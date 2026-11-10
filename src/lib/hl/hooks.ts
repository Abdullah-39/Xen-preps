'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { Address } from 'viem';
import {
  getSubscriptionClient,
  info,
  type ClearinghouseState,
  type FrontendOpenOrders,
  type L2Book,
} from './clients';

/**
 * Hyperliquid data hooks: a snapshot from InfoClient, kept live by a WebSocket subscription
 * that writes into the react-query cache.
 */

/** Subscribes while mounted; `start` returns the SDK subscription promise. */
function useSubscription(key: string | null, start: () => Promise<{ unsubscribe(): Promise<void> }>) {
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let sub: { unsubscribe(): Promise<void> } | null = null;
    start()
      .then((s) => {
        if (cancelled) void s.unsubscribe().catch(() => {});
        else sub = s;
      })
      .catch((err) => console.warn(`[hl] subscription ${key} failed`, err));
    return () => {
      cancelled = true;
      if (sub) void sub.unsubscribe().catch(() => {});
    };
    // `start` is recreated each render; the key identifies the subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export interface Market {
  /** Asset index `a` used in orders: the coin's index in meta().universe. */
  assetIndex: number;
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated: boolean;
  markPx: string;
  midPx: string | null;
  /** Oracle price. Hyperliquid rejects orders priced too far from it ("Order price too far from oracle"). */
  oraclePx: string;
  prevDayPx: string;
  funding: string;
  openInterest: string;
  dayNtlVlm: string;
}

export function useMarkets() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['hl', 'metaAndAssetCtxs'],
    queryFn: () => info.metaAndAssetCtxs(),
    refetchInterval: 5_000, // keeps oracle/mark prices fresh
  });

  const mids = useQuery<Record<string, string>>({
    queryKey: ['hl', 'allMids'],
    queryFn: () => info.allMids(),
    staleTime: Infinity,
  });

  useSubscription('allMids', () =>
    getSubscriptionClient().allMids((e) => queryClient.setQueryData(['hl', 'allMids'], e.mids)),
  );

  const markets = useMemo<Market[]>(() => {
    if (!query.data) return [];
    const [meta, ctxs] = query.data;
    return meta.universe
      .flatMap((u, i) => (u.isDelisted ? [] : [{
        assetIndex: i,
        name: u.name,
        szDecimals: u.szDecimals,
        maxLeverage: u.maxLeverage,
        onlyIsolated: !!u.onlyIsolated || u.marginMode === 'strictIsolated' || u.marginMode === 'noCross',
        markPx: ctxs[i]?.markPx ?? '0',
        oraclePx: ctxs[i]?.oraclePx ?? '0',
        midPx: mids.data?.[u.name] ?? ctxs[i]?.midPx ?? null,
        prevDayPx: ctxs[i]?.prevDayPx ?? '0',
        funding: ctxs[i]?.funding ?? '0',
        openInterest: ctxs[i]?.openInterest ?? '0',
        dayNtlVlm: ctxs[i]?.dayNtlVlm ?? '0',
      }]));
  }, [query.data, mids.data]);

  return { markets, isLoading: query.isLoading, error: query.error };
}

export function useL2Book(coin: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery<L2Book | null>({
    queryKey: ['hl', 'l2Book', coin],
    queryFn: () => info.l2Book({ coin: coin! }),
    enabled: !!coin,
    staleTime: Infinity,
  });
  useSubscription(coin ? `l2Book:${coin}` : null, () =>
    getSubscriptionClient().l2Book({ coin: coin! }, (e) => queryClient.setQueryData(['hl', 'l2Book', coin], e)),
  );
  return query;
}

export function useClearinghouseState(user: Address | undefined) {
  const queryClient = useQueryClient();
  const key = ['hl', 'clearinghouseState', user?.toLowerCase()];
  const query = useQuery<ClearinghouseState>({
    queryKey: key,
    queryFn: () => info.clearinghouseState({ user: user! }),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  useSubscription(user ? `clearinghouseState:${user}` : null, () =>
    getSubscriptionClient().clearinghouseState({ user: user! }, (e) => {
      if (e.dex === '') queryClient.setQueryData(key, e.clearinghouseState);
    }),
  );
  return query;
}

export function useOpenOrders(user: Address | undefined) {
  const queryClient = useQueryClient();
  const key = ['hl', 'openOrders', user?.toLowerCase()];
  const query = useQuery<FrontendOpenOrders>({
    queryKey: key,
    queryFn: () => info.frontendOpenOrders({ user: user! }),
    enabled: !!user,
  });
  useSubscription(user ? `openOrders:${user}` : null, () =>
    getSubscriptionClient().openOrders({ user: user! }, (e) => {
      if (e.dex === '') queryClient.setQueryData(key, e.orders);
    }),
  );
  return query;
}
