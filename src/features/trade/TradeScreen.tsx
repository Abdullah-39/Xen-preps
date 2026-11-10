'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useState } from 'react';
import { env, isTestnet } from '@/config/env';
import { useTrading } from '@/features/onboarding/TradingProvider';
import { SetupPanel } from '@/features/onboarding/SetupPanel';
import { useMarkets, type Market } from '@/lib/hl/hooks';
import { fmt } from '@/lib/hl/orderMath';
import { ErrorText, Panel, Spinner } from '@/components/ui';
import Decimal from 'decimal.js';
import { AccountTables } from './AccountTables';
import { change24h, MarketList } from './MarketList';
import { OrderBook } from './OrderBook';
import { OrderForm } from './OrderForm';

export function TradeScreen() {
  const { markets, isLoading, error } = useMarkets();
  const [coin, setCoin] = useState('BTC');
  const [limitPx, setLimitPx] = useState('');
  const market = markets.find((m) => m.name === coin) ?? markets[0];

  return (
    <div className="flex min-h-screen flex-col gap-2 p-2">
      <header className="flex items-center gap-3 px-1">
        <span className="text-lg font-semibold tracking-tight">XEN Perps</span>
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
            isTestnet ? 'bg-warn/20 text-warn' : 'bg-buy/20 text-buy'
          }`}
        >
          {env.hlNetwork}
        </span>
        <div className="ml-auto">
          <ConnectButton chainStatus="icon" showBalance={false} />
        </div>
      </header>

      {error && <ErrorText error={error} />}

      <div className="grid flex-1 gap-2 lg:grid-cols-[16rem_1fr_20rem]">
        <Panel title="Markets" className="max-h-[70vh] lg:max-h-none">
          {isLoading ? (
            <p className="p-3 text-xs text-muted"><Spinner /> Loading markets…</p>
          ) : (
            <MarketList markets={markets} selected={market?.name ?? coin} onSelect={(c) => { setCoin(c); setLimitPx(''); }} />
          )}
        </Panel>

        <div className="flex min-h-0 flex-col gap-2">
          {market && <MarketHeader market={market} />}
          <div className="grid min-h-0 flex-1 gap-2 md:grid-cols-[1fr_16rem]">
            <Panel title="Chart">
              {/* TODO(open decision): TradingView Charting Library or Lightweight Charts, fed by candleSnapshot + candle subscription. */}
              <div className="grid h-full min-h-64 place-items-center text-xs text-muted">Chart coming soon</div>
            </Panel>
            <Panel title="Order book">{market && <OrderBook coin={market.name} onPickPrice={setLimitPx} />}</Panel>
          </div>
        </div>

        <Panel title="Trade">{market && <TradePanel market={market} limitPx={limitPx} onLimitPxChange={setLimitPx} />}</Panel>
      </div>

      <Panel className="min-h-48">
        <AccountTables markets={markets} />
      </Panel>
    </div>
  );
}

function TradePanel({ market, limitPx, onLimitPxChange }: { market: Market; limitPx: string; onLimitPxChange: (px: string) => void }) {
  const { step, trading } = useTrading();
  // No trading UI until every setup step (incl. terms for the current version) has passed.
  if (step !== 'ready' || !trading) return <SetupPanel />;
  return <OrderForm key={market.name} market={market} trading={trading} limitPx={limitPx} onLimitPxChange={onLimitPxChange} />;
}

function MarketHeader({ market }: { market: Market }) {
  const ch = change24h(market);
  const fundingPct = new Decimal(market.funding).times(100).toFixed(4);
  const items = [
    ['Mark', market.markPx],
    ['24h change', ch ? `${fmt(ch)}%` : '-'],
    ['24h volume', `$${fmt(market.dayNtlVlm, 0)}`],
    ['Open interest', `${fmt(market.openInterest, 2)} ${market.name}`],
    ['Funding (1h)', `${fundingPct}%`],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-line bg-panel px-3 py-2">
      <span className="text-base font-semibold">{market.name}-USD</span>
      <span className="text-lg tabular-nums">{market.midPx ?? market.markPx}</span>
      {items.map(([k, v]) => (
        <span key={k} className="text-xs">
          <span className="block text-muted">{k}</span>
          <span className="tabular-nums">{v}</span>
        </span>
      ))}
    </div>
  );
}
