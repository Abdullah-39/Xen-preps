'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSiweMessage } from 'viem/siwe';
import { useAccount, useSignMessage } from 'wagmi';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/features/auth/SessionProvider';

/**
 * Terms and risk disclosure.
 *
 * RULE: the front end enforces this. Orders go straight to Hyperliquid, so the backend cannot stop
 * an order from a wallet that has not accepted the terms. No trading action until `accepted` is true
 * for the CURRENT version.
 */
export function useTerms() {
  const { address, chainId } = useAccount();
  const { accessToken, handleAuthError } = useSession();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const lower = address?.toLowerCase();

  const current = useQuery({
    queryKey: ['terms-current'],
    queryFn: api.termsCurrent,
    staleTime: 5 * 60_000,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  const status = useQuery({
    queryKey: ['terms-status', lower],
    queryFn: () => api.termsStatus(lower!),
    enabled: !!lower,
  });

  const accept = useMutation({
    mutationFn: async () => {
      if (!address || !chainId) throw new Error('Connect a wallet first.');
      if (!accessToken) throw new Error('Sign in first.');
      // Always use the latest statement; the backend rejects an outdated one with 400.
      const terms = await queryClient.fetchQuery({ queryKey: ['terms-current'], queryFn: api.termsCurrent, staleTime: 0 });
      const { nonce } = await api.nonce();
      const message = createSiweMessage({
        address,
        chainId,
        nonce,
        version: '1',
        domain: window.location.host,
        uri: window.location.origin,
        statement: terms.statement, // copy exactly; do not change a character
      });
      const signature = await signMessageAsync({ message });
      return api.termsAccept(message, signature, accessToken);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['terms-status', lower], result);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 400) {
        void queryClient.invalidateQueries({ queryKey: ['terms-current'] });
      } else {
        handleAuthError(err); // 401 -> sign in again; 403 -> signed by a different wallet
      }
    },
  });

  // `accepted` only counts if it is for the version currently published.
  const accepted =
    !!status.data?.accepted && !!current.data && status.data.version === current.data.version;

  return { current, status, accepted, accept };
}
