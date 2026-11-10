'use client';

import { ExchangeClient } from '@nktkas/hyperliquid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { useMemo, useSyncExternalStore } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { env } from '@/config/env';
import { AGENT_NAME, createAgent, loadAgent, saveAgent } from '@/lib/hl/agent';
import { httpTransport, info } from '@/lib/hl/clients';
import { useClearinghouseState } from '@/lib/hl/hooks';

// Bumped after saveAgent so components re-read localStorage.
let agentVersion = 0;
const agentListeners = new Set<() => void>();
const agentStore = {
  subscribe: (l: () => void) => {
    agentListeners.add(l);
    return () => agentListeners.delete(l);
  },
  get: () => agentVersion,
  bump: () => {
    agentVersion += 1;
    agentListeners.forEach((l) => l());
  },
};

/**
 * Step 4-5 of the user flow: deposit check, builder fee approval and agent approval.
 * Both approvals are signed by the user's MAIN wallet (popup). Hyperliquid rejects these for a
 * wallet that has never deposited, so they only run once the account has funds.
 */
export function useTradingSetup() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const lower = address?.toLowerCase();
  const { builderAddress, builderFee } = env;

  const account = useClearinghouseState(address);
  const hasFunds = !!account.data && new Decimal(account.data.marginSummary.accountValue).gt(0);

  const builder = useQuery({
    queryKey: ['hl', 'maxBuilderFee', lower, builderAddress],
    queryFn: () => info.maxBuilderFee({ user: address!, builder: builderAddress! }),
    enabled: !!address && !!builderAddress,
  });
  // maxBuilderFee is in tenths of a basis point, same unit as NEXT_PUBLIC_BUILDER_FEE.
  const builderApproved = builder.data !== undefined && builderFee !== null && builder.data >= builderFee;

  const agentVer = useSyncExternalStore(agentStore.subscribe, agentStore.get, () => 0);
  // Stable account object; re-read localStorage when agentVer changes (after a new agent is saved).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const localAgent = useMemo(() => (address ? loadAgent(address) : null), [address, agentVer]);

  const agents = useQuery({
    queryKey: ['hl', 'extraAgents', lower],
    // Drop expired agents at fetch time (refetched every minute).
    queryFn: async () => {
      const now = Date.now();
      const list = await info.extraAgents({ user: address! });
      return list.filter((a) => a.validUntil === null || a.validUntil > now);
    },
    enabled: !!address,
    refetchInterval: 60_000,
  });
  const agentApproved =
    !!localAgent &&
    !!agents.data?.some(
      (a) =>
        a.address.toLowerCase() === localAgent.address.toLowerCase(),
    );

  function mainExchange() {
    if (!walletClient) throw new Error('Wallet not ready. Reconnect and try again.');
    return new ExchangeClient({ transport: httpTransport, wallet: walletClient });
  }

  const approveBuilder = useMutation({
    mutationFn: async () => {
      if (!builderAddress || builderFee === null) throw new Error('Builder config missing.');
      // approveBuilderFee takes a PERCENT string: 50 (tenths of a bp) -> "0.05%".
      const maxFeeRate = `${new Decimal(builderFee).div(1000).toFixed()}%`;
      await mainExchange().approveBuilderFee({ builder: builderAddress, maxFeeRate });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['hl', 'maxBuilderFee', lower] }),
  });

  const approveAgent = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error('Connect a wallet first.');
      const { privateKey, account: agent } = createAgent();
      await mainExchange().approveAgent({ agentAddress: agent.address, agentName: AGENT_NAME });
      // Only keep the key once Hyperliquid has accepted it. It never leaves this browser.
      saveAgent(address, privateKey);
      agentStore.bump();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['hl', 'extraAgents', lower] }),
  });

  return {
    account,
    hasFunds,
    builder,
    builderApproved,
    agents,
    agentApproved,
    localAgent,
    approveBuilder,
    approveAgent,
    walletReady: !!walletClient,
  };
}
