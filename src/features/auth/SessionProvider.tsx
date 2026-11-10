'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { createSiweMessage } from 'viem/siwe';
import { useAccount, useSignMessage } from 'wagmi';
import { api, ApiError } from '@/lib/api';
import { tokenStore } from './tokenStore';

export type SessionStatus = 'disconnected' | 'signed-out' | 'checking' | 'signed-in';

interface SessionValue {
  status: SessionStatus;
  accessToken: string | null;
  signIn: () => Promise<void>;
  signingIn: boolean;
  signInError: Error | null;
  /** Set when the stored token could not be checked (e.g. backend unreachable). */
  checkError: Error | null;
  retryCheck: () => void;
  signOut: () => void;
  /** Call when a protected route returns 401/403: clears the token so the user signs in again. */
  handleAuthError: (err: unknown) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const stored = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, tokenStore.getServerSnapshot);

  const lowerAddress = address?.toLowerCase();
  const token = stored && lowerAddress && stored.address === lowerAddress ? stored.token : null;

  // The token belongs to the address that signed in. If the wallet switches account, drop it.
  useEffect(() => {
    if (stored && lowerAddress && stored.address !== lowerAddress) tokenStore.clear();
  }, [stored, lowerAddress]);

  // Check a stored token is still valid (and really belongs to this address).
  const me = useQuery({
    queryKey: ['auth-me', token],
    queryFn: () => api.me(token!),
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) tokenStore.clear();
    if (me.data && lowerAddress && me.data.address.toLowerCase() !== lowerAddress) tokenStore.clear();
  }, [me.error, me.data, lowerAddress]);

  const signInMutation = useMutation({
    mutationFn: async () => {
      if (!address || !chainId) throw new Error('Connect a wallet first.');
      // A nonce works once and expires after 10 minutes: always fetch a fresh one.
      const { nonce } = await api.nonce();
      const message = createSiweMessage({
        address,
        chainId,
        domain: window.location.host, // must equal the backend's SIWE_DOMAIN
        uri: window.location.origin,
        nonce,
        version: '1',
        statement: 'Sign in to XEN Perps',
      });
      const signature = await signMessageAsync({ message });
      const { accessToken, address: wallet } = await api.verify(message, signature);
      tokenStore.set({ address: wallet, token: accessToken });
    },
  });

  const signOut = useCallback(() => tokenStore.clear(), []);

  const handleAuthError = useCallback((err: unknown) => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      tokenStore.clear();
      return true;
    }
    return false;
  }, []);

  let status: SessionStatus;
  if (!isConnected || !address) status = 'disconnected';
  else if (!token) status = 'signed-out';
  else if (me.isSuccess && me.data.address.toLowerCase() === lowerAddress) status = 'signed-in';
  else if (me.isError) status = me.error instanceof ApiError && me.error.status === 401 ? 'signed-out' : 'checking';
  else status = 'checking';

  const { mutateAsync, isPending, error } = signInMutation;
  const value = useMemo<SessionValue>(
    () => ({
      status,
      accessToken: status === 'signed-in' ? token : null,
      signIn: () => mutateAsync(),
      signingIn: isPending,
      signInError: error,
      checkError: status === 'checking' ? me.error : null,
      retryCheck: () => void me.refetch(),
      signOut,
      handleAuthError,
    }),
    [status, token, mutateAsync, isPending, error, me, signOut, handleAuthError],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
