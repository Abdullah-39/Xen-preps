'use client';

import Decimal from 'decimal.js';
import { useState } from 'react';
import type { Market } from '@/lib/hl/hooks';
import { fmt } from '@/lib/hl/orderMath';

export function change24h(m: Market): string | null {
  const now = m.midPx ?? m.markPx;
  if (!now || new Decimal(m.prevDayPx).isZero()) return null;
  return new Decimal(now).minus(m.prevDayPx).div(m.prevDayPx).times(100).toFixed(2);
}

export function MarketList({
  markets,
  selected,
  onSelect,
}: {
  markets: Market[];
  selected: string;
  onSelect: (coin: string) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = markets
    .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Decimal(b.dayNtlVlm).cmp(a.dayNtlVlm));

  return (
    <div className="flex h-full flex-col">
      <input
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="m-2 rounded-md border border-line bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
      />
      <ul className="min-h-0 flex-1 overflow-auto text-xs">
        {filtered.map((m) => {
          const ch = change24h(m);
          return (
            <li key={m.name}>
              <button
                onClick={() => onSelect(m.name)}
                className={`grid w-full grid-cols-[1fr_auto_4rem] gap-2 px-3 py-1.5 text-left hover:bg-white/5 ${
                  m.name === selected ? 'bg-white/10' : ''
                }`}
              >
                <span className="font-medium">
                  {m.name} <span className="text-muted">{m.maxLeverage}x</span>
                </span>
                <span className="tabular-nums">{m.midPx ?? m.markPx}</span>
                <span className={`text-right tabular-nums ${ch && ch.startsWith('-') ? 'text-sell' : 'text-buy'}`}>
                  {ch ? `${fmt(ch)}%` : '-'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
