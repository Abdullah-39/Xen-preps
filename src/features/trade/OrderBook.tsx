'use client';

import Decimal from 'decimal.js';
import { useL2Book } from '@/lib/hl/hooks';
import { Spinner } from '@/components/ui';

const DEPTH = 12;

export function OrderBook({ coin, onPickPrice }: { coin: string; onPickPrice?: (px: string) => void }) {
  const { data, isLoading } = useL2Book(coin);
  if (isLoading) return <p className="p-3 text-xs text-muted"><Spinner /> Loading book…</p>;
  if (!data) return <p className="p-3 text-xs text-muted">No book data.</p>;

  const [bids, asks] = data.levels;
  const topAsks = asks.slice(0, DEPTH).reverse();
  const topBids = bids.slice(0, DEPTH);
  const maxSz = Decimal.max(1e-12, ...[...topAsks, ...topBids].map((l) => l.sz));
  const spread = bids[0] && asks[0] ? new Decimal(asks[0].px).minus(bids[0].px).toFixed() : null;

  const row = (l: { px: string; sz: string }, side: 'bid' | 'ask') => (
    <button
      key={`${side}-${l.px}`}
      onClick={() => onPickPrice?.(l.px)}
      className="relative grid w-full grid-cols-2 px-3 py-0.5 text-left text-xs tabular-nums hover:bg-white/5"
    >
      <span
        className={`absolute inset-y-0 right-0 ${side === 'bid' ? 'bg-buy/15' : 'bg-sell/15'}`}
        style={{ width: `${new Decimal(l.sz).div(maxSz).times(100).toFixed(1)}%` }}
      />
      <span className={side === 'bid' ? 'text-buy' : 'text-sell'}>{l.px}</span>
      <span className="text-right">{l.sz}</span>
    </button>
  );

  return (
    <div className="py-1">
      <div className="grid grid-cols-2 px-3 pb-1 text-[10px] uppercase text-muted">
        <span>Price</span>
        <span className="text-right">Size ({coin})</span>
      </div>
      {topAsks.map((l) => row(l, 'ask'))}
      <div className="px-3 py-1 text-center text-[10px] text-muted">Spread {spread ?? '-'}</div>
      {topBids.map((l) => row(l, 'bid'))}
    </div>
  );
}
