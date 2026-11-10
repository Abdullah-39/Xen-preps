'use client';

import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { getSubscriptionClient, info } from '@/lib/hl/clients';

/**
 * Price chart: TradingView Lightweight Charts, fed straight from Hyperliquid
 * (candleSnapshot for history, `candle` subscription for live updates). No XEN backend involved.
 *
 * Numbers here are for drawing only. Never use chart values for order maths.
 */

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
type Interval = (typeof INTERVALS)[number];

const INTERVAL_MS: Record<Interval, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

const BARS = 500; // Hyperliquid returns at most 5000 candles per request

const COLORS = {
  text: '#8a93a0',
  grid: '#1a1f27',
  border: '#222831',
  up: '#16a34a',
  down: '#dc2626',
  upVol: 'rgba(22, 163, 74, 0.35)',
  downVol: 'rgba(220, 38, 38, 0.35)',
};

interface HlCandle {
  t: number; // open time, ms
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

function toBars(c: HlCandle): { candle: CandlestickData<UTCTimestamp>; volume: HistogramData<UTCTimestamp> } {
  const time = Math.floor(c.t / 1000) as UTCTimestamp;
  const open = Number(c.o);
  const close = Number(c.c);
  return {
    candle: { time, open, high: Number(c.h), low: Number(c.l), close },
    volume: { time, value: Number(c.v), color: close >= open ? COLORS.upVol : COLORS.downVol },
  };
}

export function PriceChart({ coin, szDecimals }: { coin: string; szDecimals: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [interval, setChartInterval] = useState<Interval>('15m');
  // Error tagged with the coin/interval it belongs to, so switching hides a stale one.
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const dataKey = `${coin}:${interval}`;

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: COLORS.text,
        fontSize: 11,
        attributionLogo: true, // Lightweight Charts licence requires TradingView attribution
      },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      rightPriceScale: { borderColor: COLORS.border },
      timeScale: { borderColor: COLORS.border, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderVisible: false,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    });
    volumeRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    // Volume in the bottom 20%, candles above it, so they don't overlap.
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.25 } });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  // Price precision follows Hyperliquid's perp rule: at most 6 - szDecimals decimals.
  useEffect(() => {
    const precision = Math.max(0, 6 - szDecimals);
    candleRef.current?.applyOptions({
      priceFormat: { type: 'price', precision, minMove: 1 / 10 ** precision },
    });
  }, [szDecimals]);

  // Load history, then stream live candles for the selected coin and interval.
  useEffect(() => {
    let cancelled = false;
    let sub: { unsubscribe(): Promise<void> } | null = null;
    candleRef.current?.setData([]);
    volumeRef.current?.setData([]);

    const applyLive = (c: HlCandle) => {
      const { candle, volume } = toBars(c);
      try {
        candleRef.current?.update(candle);
        volumeRef.current?.update(volume);
      } catch {
        // Ignore an out-of-order update older than the last bar.
      }
    };

    (async () => {
      try {
        const now = Date.now();
        const history = await info.candleSnapshot({
          coin,
          interval,
          startTime: now - BARS * INTERVAL_MS[interval],
          endTime: now,
        });
        if (cancelled) return;
        const bars = history.map(toBars);
        candleRef.current?.setData(bars.map((b) => b.candle));
        volumeRef.current?.setData(bars.map((b) => b.volume));
        chartRef.current?.timeScale().fitContent();

        const s = await getSubscriptionClient().candle({ coin, interval }, applyLive);
        if (cancelled) void s.unsubscribe().catch(() => {});
        else sub = s;
      } catch (err) {
        if (!cancelled)
          setError({ key: `${coin}:${interval}`, message: err instanceof Error ? err.message : 'Failed to load chart data.' });
      }
    })();

    return () => {
      cancelled = true;
      if (sub) void sub.unsubscribe().catch(() => {});
    };
  }, [coin, interval]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex shrink-0 gap-1 border-b border-line px-2 py-1">
        {INTERVALS.map((i) => (
          <button
            key={i}
            onClick={() => setChartInterval(i)}
            className={`rounded px-2 py-0.5 text-xs ${i === interval ? 'bg-white/10 text-fg' : 'text-muted hover:text-fg'}`}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {error?.key === dataKey && <p className="absolute left-2 top-2 text-xs text-sell">{error.message}</p>}
      </div>
    </div>
  );
}
