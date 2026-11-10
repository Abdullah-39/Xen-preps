import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import { env } from '@/config/env';

/**
 * Agent (API) wallet key, generated and kept in this browser only.
 *
 * RULE: the agent key never leaves the browser. Do not send it to the XEN backend or anywhere else.
 * An agent can place/cancel orders and change leverage, but cannot withdraw or transfer funds.
 */

/** Hyperliquid limits agent names to 16 characters. Approving the same name again replaces the old agent. */
export const AGENT_NAME = 'XEN Perps';

interface StoredAgent {
  privateKey: Hex;
  address: Address;
}

function storageKey(user: Address): string {
  return `xen-perps:agent:${env.hlNetwork}:${user.toLowerCase()}`;
}

export function loadAgent(user: Address): PrivateKeyAccount | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(user));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredAgent;
    const account = privateKeyToAccount(stored.privateKey);
    return account.address.toLowerCase() === stored.address.toLowerCase() ? account : null;
  } catch {
    return null;
  }
}

/** Creates a new key but does not store it. Store it only after approveAgent succeeds. */
export function createAgent(): { privateKey: Hex; account: PrivateKeyAccount } {
  const privateKey = generatePrivateKey();
  return { privateKey, account: privateKeyToAccount(privateKey) };
}

export function saveAgent(user: Address, privateKey: Hex): void {
  const account = privateKeyToAccount(privateKey);
  const value: StoredAgent = { privateKey, address: account.address };
  window.localStorage.setItem(storageKey(user), JSON.stringify(value));
}

export function clearAgent(user: Address): void {
  window.localStorage.removeItem(storageKey(user));
}
