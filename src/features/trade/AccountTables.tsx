'use client';

import { useMutation } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useTrading } from '@/features/onboarding/TradingProvider';
import { useClearinghouseState, useOpenOrders, type Market } from '@/lib/hl/hooks';
import { fmt, marketOrderPrice, toSize } from '@/lib/hl/orderMath';
import { ErrorText } from '@/components/ui';

export function AccountTables({ markets }: { markets: Market[] }) {
  const [tab, setTab] = useState<'positions' | 'orders'>('positions');
  const { address } = useAccount();
  const account = useClearinghouseState(address);
  const orders = useOpenOrders(address);
  const byName = new Map(markets.map((m) => [m.name, m]));

  if (!address) return <p className="p-3 text-xs text-muted">Connect a wallet to see your account.</p>;

  const positions = account.data?.assetPositions ?? [];
  const ms = account.data?.marginSummary;

  return (
    <div className="text-xs">
      <div className="flex flex-wrap items-center gap-4 border-b border-line px-3 py-2">
        {(['positions', 'orders'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? 'text-fg' : 'text-muted'}>
            {t === 'positions' ? `Positions (${positions.length})` : `Open orders (${orders.data?.length ?? 0})`}
          </button>
        ))}
        <span className="ml-auto text-muted">
          Account value <span className="text-fg">${fmt(ms?.accountValue)}</span> · Withdrawable{' '}
          <span className="text-fg">${fmt(account.data?.withdrawable)}</span>
        </span>
      </div>
      {tab === 'positions' ? (
        <Positions positions={positions} byName={byName} />
      ) : (
        <Orders orders={orders.data ?? []} byName={byName} />
      )}
    </div>
  );
}

type Position = NonNullable<ReturnType<typeof useClearinghouseState>['data']>['assetPositions'][number]['position'];

function Positions({ positions, byName }: { positions: { position: Position }[]; byName: Map<string, Market> }) {
  const { trading } = useTrading();
  const close = useMutation({
    mutationFn: async (p: Position) => {
      const m = byName.get(p.coin);
      if (!trading || !m) throw new Error('Trading not ready.');
      const szi = new Decimal(p.szi);
      const isBuy = szi.lt(0); // close a short by buying
      return trading.placeOrder([
        {
          a: m.assetIndex,
          b: isBuy,
          p: marketOrderPrice(m.midPx ?? m.markPx, isBuy, m.szDecimals),
          s: toSize(szi.abs(), m.szDecimals),
          r: true,
          t: { limit: { tif: 'Ioc' } },
        },
      ]);
    },
  });

  if (positions.length === 0) return <p className="p-3 text-muted">No open positions.</p>;
  return (
    <>
      <table className="w-full tabular-nums">
        <thead className="text-left text-muted">
          <tr>
            {['Coin', 'Size', 'Entry', 'Mark', 'PnL (ROE)', 'Liq.', 'Margin', ''].map((h) => (
              <th key={h} className="px-3 py-1.5 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map(({ position: p }) => {
            const pnlNeg = p.unrealizedPnl.startsWith('-');
            return (
              <tr key={p.coin} className="border-t border-line">
                <td className="px-3 py-1.5">
                  {p.coin} <span className="text-muted">{p.leverage.value}x {p.leverage.type}</span>
                </td>
                <td className={`px-3 ${p.szi.startsWith('-') ? 'text-sell' : 'text-buy'}`}>{p.szi}</td>
                <td className="px-3">{p.entryPx}</td>
                <td className="px-3">{byName.get(p.coin)?.markPx ?? '-'}</td>
                <td className={`px-3 ${pnlNeg ? 'text-sell' : 'text-buy'}`}>
                  ${fmt(p.unrealizedPnl)} ({fmt(new Decimal(p.returnOnEquity).times(100).toFixed())}%)
                </td>
                <td className="px-3">{p.liquidationPx ?? '-'}</td>
                <td className="px-3">${fmt(p.marginUsed)}</td>
                <td className="px-3 text-right">
                  <button
                    className="text-accent disabled:opacity-40"
                    disabled={!trading || close.isPending}
                    onClick={() => close.mutate(p)}
                  >
                    Close
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 pb-2"><ErrorText error={close.error} /></div>
    </>
  );
}

type OpenOrder = NonNullable<ReturnType<typeof useOpenOrders>['data']>[number];

function Orders({ orders, byName }: { orders: OpenOrder[]; byName: Map<string, Market> }) {
  const { trading } = useTrading();
  const cancel = useMutation({
    mutationFn: async (o: OpenOrder) => {
      const m = byName.get(o.coin);
      if (!trading || !m) throw new Error('Trading not ready.');
      return trading.cancel([{ a: m.assetIndex, o: o.oid }]);
    },
  });

  if (orders.length === 0) return <p className="p-3 text-muted">No open orders.</p>;
  return (
    <>
      <table className="w-full tabular-nums">
        <thead className="text-left text-muted">
          <tr>
            {['Coin', 'Type', 'Side', 'Size', 'Price', 'Trigger', ''].map((h) => (
              <th key={h} className="px-3 py-1.5 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.oid} className="border-t border-line">
              <td className="px-3 py-1.5">{o.coin}</td>
              <td className="px-3">{o.orderType}{o.reduceOnly ? ' · RO' : ''}</td>
              <td className={`px-3 ${o.side === 'B' ? 'text-buy' : 'text-sell'}`}>{o.side === 'B' ? 'Buy' : 'Sell'}</td>
              <td className="px-3">{o.sz}</td>
              <td className="px-3">{o.limitPx}</td>
              <td className="px-3">{o.isTrigger ? o.triggerCondition : '-'}</td>
              <td className="px-3 text-right">
                <button
                  className="text-accent disabled:opacity-40"
                  disabled={!trading || cancel.isPending}
                  onClick={() => cancel.mutate(o)}
                >
                  Cancel
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 pb-2"><ErrorText error={cancel.error} /></div>
    </>
  );
}
