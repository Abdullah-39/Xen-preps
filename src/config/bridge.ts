import type { Address } from 'viem';
import { arbitrum, arbitrumSepolia, type Chain } from 'viem/chains';
import { env } from './env';

/**
 * Hyperliquid USDC deposit bridge (Bridge2) on Arbitrum.
 *
 * Source: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/bridge2
 * (checked 2026-11-10; that URL now serves the "USDC" page):
 * - mainnet bridge 0x2df1c51e09aecf9cacb7bc98cb1742757f163df7, testnet 0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89
 * - USDC: mainnet 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 (Arbitrum One),
 *   testnet 0x1baAbB04529D43a73232B713C0FE471f7c7334d5 ("USDC2", Arbitrum Sepolia, chainId 421614)
 * - "The minimum deposit amount is 5 USDC. If you send an amount less than this, it will not be
 *   credited and be lost forever."
 * - Deposits are credited to the account that sent the USDC.
 *
 * TODO(team): the docs now label this the "Legacy Bridge" and say it is deprecated in favour of
 * CCTP. Confirm the deposit route with Saif before mainnet.
 */
interface BridgeConfig {
  chain: Chain;
  bridgeAddress: Address;
  usdcAddress: Address;
  usdcDecimals: number;
  minDepositUsdc: string;
}

const BRIDGES: Record<typeof env.hlNetwork, BridgeConfig> = {
  mainnet: {
    chain: arbitrum,
    bridgeAddress: '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7',
    usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    usdcDecimals: 6,
    minDepositUsdc: '5',
  },
  testnet: {
    chain: arbitrumSepolia,
    bridgeAddress: '0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89',
    usdcAddress: '0x1baAbB04529D43a73232B713C0FE471f7c7334d5',
    usdcDecimals: 6,
    minDepositUsdc: '5',
  },
};

export const bridge = BRIDGES[env.hlNetwork];
