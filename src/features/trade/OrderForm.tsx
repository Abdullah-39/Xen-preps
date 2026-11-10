'use client';

import type { OrderParameters } from '@nktkas/hyperliquid/api/exchange';
import { useMutation } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { useRef, useState } from 'react';
import { env } from '@/config/env';
import type { Market } from '@/lib/hl/hooks';
import { toOrderError } from '@/lib/hl/errors';
import {
  DEFAULT_SLIPPAGE_PCT,
  isPositiveDecimal,
  marketOrderBlockedByOracle,
  marketOrderPrice,
  oracleGapPct,
  toPerpPrice,
  toSize,
} from '@/lib/hl/orderMath';
import type { TradingClient } from '@/lib/hl/trading';
import { Button, ErrorText, Spinner } from '@/components/ui';

type Order = OrderParameters['orders'][number];
type OrderType = 'market' | 'limit';

export function OrderForm({
  market,
  trading,
  limitPx,
  onLimitPxChange,
}: {
  market: Market;
  trading: TradingClient;
  limitPx: string;
  onLimitPxChange: (px: string) => void;
}) {
  const [isBuy, setIsBuy] = useState(true);
  const [type, setType] = useState<OrderType>('market');
  const [size, setSize] = useState('');
  const [leverage, setLeverage] = useState(() => Math.min(10, market.maxLeverage));
  const [isCross, setIsCross] = useState(!market.onlyIsolated);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpPx, setTpPx] = useState('');
  const [slPx, setSlPx] = useState('');
  // Leverage settings already sent this session, so we only call updateLeverage when it changes.
  const appliedLeverage = useRef(new Set<string>());

  const mid = market.midPx ?? market.markPx;
  const gap = oracleGapPct(mid, market.oraclePx);
  // A market order is priced within slippage of both mid and oracle; if the book is further than
  // that from the oracle, it cannot fill on this side.
  const oracleBlocked = type === 'market' && marketOrderBlockedByOracle(mid, market.oraclePx, isBuy);
  const refPx = type === 'limit' && isPositiveDecimal(limitPx) ? limitPx : mid;
  const notional = isPositiveDecimal(size) && refPx ? new Decimal(size).times(refPx).toFixed(2) : null;
  const error = validate();

  function validate(): string | null {
    if (!isPositiveDecimal(size)) return 'Enter a size.';
    if (new Decimal(size).decimalPlaces() > market.szDecimals) return `Size allows at most ${market.szDecimals} decimals.`;
    if (type === 'limit' && !isPositiveDecimal(limitPx)) return 'Enter a limit price.';
    if (!mid) return 'No price available.';
    if (oracleBlocked)
      return `The order book is ${gap}% away from the oracle price, so a market ${isBuy ? 'buy' : 'sell'} can't fill within ${DEFAULT_SLIPPAGE_PCT}% slippage. Use a limit order.`;
    if (tpPx && !isPositiveDecimal(tpPx)) return 'Invalid take-profit price.';
    if (slPx && !isPositiveDecimal(slPx)) return 'Invalid stop-loss price.';
    if (tpPx && (isBuy ? new Decimal(tpPx).lte(refPx) : new Decimal(tpPx).gte(refPx)))
      return `Take profit must be ${isBuy ? 'above' : 'below'} the entry price.`;
    if (slPx && (isBuy ? new Decimal(slPx).gte(refPx) : new Decimal(slPx).lte(refPx)))
      return `Stop loss must be ${isBuy ? 'below' : 'above'} the entry price.`;
    return null;
  }

  const submit = useMutation({
    mutationFn: async () => {
      const a = market.assetIndex;
      const sz = toSize(size, market.szDecimals);
      const p =
        type === 'limit'
          ? toPerpPrice(limitPx, market.szDecimals)
          : marketOrderPrice(mid, isBuy, market.szDecimals, DEFAULT_SLIPPAGE_PCT, market.oraclePx);

      // Leverage must be set before the order.
      const levKey = `${a}:${isCross}:${leverage}`;
      if (!reduceOnly && !appliedLeverage.current.has(levKey)) {
        await trading.updateLeverage({ asset: a, isCross, leverage });
        appliedLeverage.current.add(levKey);
      }

      const orders: Order[] = [
        {
          a,
          b: isBuy,
          p,
          s: sz,
          r: reduceOnly,
          // No true market orders on Hyperliquid: a "market" order is an IOC limit with slippage room.
          t: { limit: { tif: type === 'limit' ? 'Gtc' : 'Ioc' } },
        },
      ];
      // TP/SL: reduce-only trigger orders on the opposite side, fixed size ('normalTpsl').
      for (const [px, tpsl] of [
        [tpPx, 'tp'],
        [slPx, 'sl'],
      ] as const) {
        if (!px) continue;
        const triggerPx = toPerpPrice(px, market.szDecimals);
        orders.push({
          a,
          b: !isBuy,
          p: marketOrderPrice(triggerPx, !isBuy, market.szDecimals),
          s: sz,
          r: true,
          t: { trigger: { isMarket: true, triggerPx, tpsl } },
        });
      }
      return trading.placeOrder(orders, orders.length > 1 ? 'normalTpsl' : 'na');
    },
    onSuccess: () => {
      setSize('');
      setTpPx('');
      setSlPx('');
    },
  });

  const status = submit.data?.response.data.statuses[0];
  const feePct = env.builderFee !== null ? `${env.builderFee / 1000}%` : '-';

  return (
    <form
      className="space-y-3 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!error) submit.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-1 rounded-md bg-bg p-1">
        <Toggle active={isBuy} onClick={() => setIsBuy(true)} activeClass="bg-buy text-white">Long</Toggle>
        <Toggle active={!isBuy} onClick={() => setIsBuy(false)} activeClass="bg-sell text-white">Short</Toggle>
      </div>

      <div className="flex gap-4 text-xs">
        {(['market', 'limit'] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setType(t)}
            className={`capitalize ${type === t ? 'text-fg underline underline-offset-4' : 'text-muted'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs">
        <select
          value={isCross ? 'cross' : 'isolated'}
          onChange={(e) => setIsCross(e.target.value === 'cross')}
          disabled={market.onlyIsolated}
          className="rounded-md border border-line bg-bg px-2 py-1"
        >
          <option value="cross">Cross</option>
          <option value="isolated">Isolated</option>
        </select>
        <input
          type="range"
          min={1}
          max={market.maxLeverage}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="flex-1 accent-[var(--accent)]"
        />
        <span className="w-10 text-right tabular-nums">{leverage}x</span>
      </div>

      {type === 'limit' && (
        <Field label="Price (USD)" value={limitPx} onChange={onLimitPxChange} placeholder={mid ?? ''} />
      )}
      <Field label={`Size (${market.name})`} value={size} onChange={setSize} placeholder="0" />
      <p className="text-xs text-muted">≈ {notional ? `$${notional}` : '-'}</p>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
        Reduce only
      </label>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Take profit" value={tpPx} onChange={setTpPx} placeholder="optional" />
        <Field label="Stop loss" value={slPx} onChange={setSlPx} placeholder="optional" />
      </div>

      <Button type="submit" variant={isBuy ? 'buy' : 'sell'} className="w-full" disabled={!!error || submit.isPending}>
        {submit.isPending ? <Spinner /> : `${isBuy ? 'Long' : 'Short'} ${market.name}`}
      </Button>
      {(size || oracleBlocked) && error && (
        <p className={`text-xs ${oracleBlocked ? 'text-warn' : 'text-muted'}`}>{error}</p>
      )}
      <ErrorText error={toOrderError(submit.error)} />
      {status && typeof status === 'object' && 'filled' in status && (
        <p className="text-xs text-buy">Filled {status.filled.totalSz} @ {status.filled.avgPx}</p>
      )}
      {status && typeof status === 'object' && 'resting' in status && (
        <p className="text-xs text-buy">Order placed (#{status.resting.oid}).</p>
      )}
      <p className="text-[10px] text-muted">
        Oracle {market.oraclePx}
        {gap !== null && ` · book ${gap}% from oracle`} · Market orders use up to {DEFAULT_SLIPPAGE_PCT}% slippage
        from mid and oracle. Includes XEN fee of {feePct}.
      </p>
    </form>
  );
}

function Toggle({
  active,
  onClick,
  activeClass,
  children,
}: {
  active: boolean;
  onClick: () => void;
  activeClass: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={`rounded py-1.5 text-sm font-medium ${active ? activeClass : 'text-muted'}`}>
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <input
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.trim())}
        className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-fg tabular-nums outline-none focus:border-accent"
      />
    </label>
  );
}
