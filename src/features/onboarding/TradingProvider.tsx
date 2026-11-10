'use client';

import { createContext, useContext, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { configErrors } from '@/config/env';
import { bridge } from '@/config/bridge';
import { useSession } from '@/features/auth/SessionProvider';
import { useTerms } from '@/features/terms/useTerms';
import { createTradingClient, type TradingClient } from '@/lib/hl/trading';
import { useTradingSetup } from './useTradingSetup';

/**
 * The single source of truth for "can this user trade?". The user flow:
 * connect -> network -> sign in -> terms -> deposit -> enable trading (builder fee + agent) -> trade.
 * `trading` is null until every step has passed, so no trading action can run before that.
 */
export type SetupStep =
  | 'config'
  | 'connect'
  | 'network'
  | 'sign-in'
  | 'terms'
  | 'deposit'
  | 'enable-trading'
  | 'ready';

interface TradingValue {
  step: SetupStep;
  trading: TradingClient | null;
  setup: ReturnType<typeof useTradingSetup>;
  terms: ReturnType<typeof useTerms>;
}

const TradingContext = createContext<TradingValue | null>(null);

export function TradingProvider({ children }: { children: React.ReactNode }) {
  const { chainId } = useAccount();
  const session = useSession();
  const terms = useTerms();
  const setup = useTradingSetup();

  let step: SetupStep;
  if (configErrors.length > 0) step = 'config';
  else if (session.status === 'disconnected') step = 'connect';
  else if (chainId !== bridge.chain.id) step = 'network';
  else if (session.status !== 'signed-in') step = 'sign-in';
  else if (!terms.accepted) step = 'terms';
  else if (!setup.hasFunds) step = 'deposit';
  else if (!setup.builderApproved || !setup.agentApproved) step = 'enable-trading';
  else step = 'ready';

  const ready = step === 'ready';
  const agent = setup.localAgent;
  const trading = useMemo(() => (ready && agent ? createTradingClient(agent) : null), [ready, agent]);

  return (
    <TradingContext.Provider value={{ step, trading, setup, terms }}>{children}</TradingContext.Provider>
  );
}

export function useTrading(): TradingValue {
  const ctx = useContext(TradingContext);
  if (!ctx) throw new Error('useTrading must be used inside TradingProvider');
  return ctx;
}
