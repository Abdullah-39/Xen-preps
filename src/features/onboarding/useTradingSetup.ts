'use client';

import { ExchangeClient } from '@nktkas/hyperliquid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { useMemo, useSyncExternalStore } from 'react';
import { useAccount, useConfig, useWalletClient } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { hlChain } from '@/config/chains';
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
  const wagmiConfig = useConfig();
  const queryClient = useQueryClient();
  const lower = address?.toLowerCase();
  const { builderAddress, builderFee } = env;

  const account = useClearinghouseState(address);
  // USDC sent on Hyperliquid (e.g. from another testnet account) lands in SPOT, and in unified
  // account mode the perps account value can read 0. Count both so we don't ask for a deposit
  // when the user already has funds on Hyperliquid.
  const spot = useQuery({
    queryKey: ['hl', 'spotClearinghouseState', lower],
    queryFn: () => info.spotClearinghouseState({ user: address! }),
    enabled: !!address,
    refetchInterval: 15_000,
  });
  const perpsValue = account.data ? new Decimal(account.data.marginSummary.accountValue) : new Decimal(0);
  const spotUsdc = new Decimal(spot.data?.balances.find((b) => b.coin === 'USDC')?.total ?? '0');
  const hasFunds = perpsValue.gt(0) || spotUsdc.gt(0);
  const fundsLoading = account.isLoading || spot.isLoading;

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

  /**
   * Runs a main-wallet action with a fresh wallet client for the connected account on HyperEVM.
   * If the wallet answers 4100 ("method and/or account has not been authorized"), which MetaMask
   * does when the site has no permission for this account/chain yet (e.g. after switching to a
   * newly added chain), ask the wallet to re-authorize (eth_requestAccounts) and retry once.
   */
  async function withMainExchange<T>(run: (exchange: ExchangeClient) => Promise<T>): Promise<T> {
    if (!address) throw new Error('Connect a wallet first.');
    const client = await getWalletClient(wagmiConfig, { chainId: hlChain.id, account: address });
    const exchange = new ExchangeClient({ transport: httpTransport, wallet: client });
    try {
      return await run(exchange);
    } catch (err) {
      if (!isUnauthorizedError(err)) throw err;
      const granted = await client.requestAddresses();
      if (!granted.some((a) => a.toLowerCase() === address.toLowerCase())) {
        throw new Error(`Your wallet did not authorize ${address} for this site. Select this account in your wallet and try again.`);
      }
      return run(exchange);
    }
  }

  const approveBuilder = useMutation({
    mutationFn: async () => {
      if (!builderAddress || builderFee === null) throw new Error('Builder config missing.');
      // approveBuilderFee takes a PERCENT string: 50 (tenths of a bp) -> "0.05%".
      const maxFeeRate = `${new Decimal(builderFee).div(1000).toFixed()}%`;
      await withMainExchange((ex) => ex.approveBuilderFee({ builder: builderAddress, maxFeeRate }));
    },
    onError: (err) => console.error('[approveBuilderFee]', err),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['hl', 'maxBuilderFee', lower] }),
  });

  const approveAgent = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error('Connect a wallet first.');
      const { privateKey, account: agent } = createAgent();
      await withMainExchange((ex) => ex.approveAgent({ agentAddress: agent.address, agentName: AGENT_NAME }));
      // Only keep the key once Hyperliquid has accepted it. It never leaves this browser.
      saveAgent(address, privateKey);
      agentStore.bump();
    },
    onError: (err) => console.error('[approveAgent]', err),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['hl', 'extraAgents', lower] }),
  });

  return {
    account,
    spot,
    hasFunds,
    fundsLoading,
    perpsValue: perpsValue.toFixed(),
    spotUsdc: spotUsdc.toFixed(),
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

/** EIP-1193 4100 Unauthorized, anywhere in the error's cause chain. */
function isUnauthorizedError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (e.code === 4100) return true;
    if (typeof e.message === 'string' && /has not been authorized/i.test(e.message)) return true;
    current = e.cause;
  }
  return false;
}
