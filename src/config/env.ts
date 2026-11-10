import { getAddress, isAddress, type Address } from 'viem';

/**
 * Public runtime config. Every value is read with a literal `process.env.NEXT_PUBLIC_*`
 * reference so Next.js can inline it at build time. Nothing here is secret.
 */

export type HlNetwork = 'testnet' | 'mainnet';

/** Perps maximum builder fee: f = 100 (0.1%), in tenths of a basis point. */
export const MAX_PERP_BUILDER_FEE = 100;

const rawNetwork = process.env.NEXT_PUBLIC_HL_NETWORK;
const rawBuilderAddress = process.env.NEXT_PUBLIC_BUILDER_ADDRESS ?? '';
const rawBuilderFee = process.env.NEXT_PUBLIC_BUILDER_FEE ?? '';

/** Problems that block trading. Shown in the UI instead of crashing the app. */
export const configErrors: string[] = [];

function parseNetwork(value: string | undefined): HlNetwork {
  if (value === 'testnet' || value === 'mainnet') return value;
  configErrors.push(`NEXT_PUBLIC_HL_NETWORK must be "testnet" or "mainnet" (got "${value ?? ''}").`);
  // Fall back to testnet so a missing value can never silently point at mainnet.
  return 'testnet';
}

function parseBuilderAddress(value: string): Address | null {
  if (isAddress(value)) return getAddress(value);
  configErrors.push('NEXT_PUBLIC_BUILDER_ADDRESS is missing or not a valid address.');
  return null;
}

function parseBuilderFee(value: string): number | null {
  const fee = Number(value);
  if (value !== '' && Number.isInteger(fee) && fee >= 0 && fee <= MAX_PERP_BUILDER_FEE) return fee;
  configErrors.push(
    `NEXT_PUBLIC_BUILDER_FEE must be an integer from 0 to ${MAX_PERP_BUILDER_FEE} (tenths of a basis point).`,
  );
  return null;
}

export const env = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/+$/, ''),
  hlNetwork: parseNetwork(rawNetwork),
  builderAddress: parseBuilderAddress(rawBuilderAddress),
  builderFee: parseBuilderFee(rawBuilderFee),
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '',
} as const;

export const isTestnet = env.hlNetwork === 'testnet';
