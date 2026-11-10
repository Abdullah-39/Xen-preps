import { hyperEvm, hyperliquidEvmTestnet } from 'viem/chains';
import { isTestnet } from './env';

/**
 * The app's main wallet chain: Hyperliquid's own chain (HyperEVM), from NEXT_PUBLIC_HL_NETWORK.
 * testnet -> Hyperliquid EVM Testnet (998), mainnet -> HyperEVM (999).
 * Sign-in, terms and the builder-fee / agent approvals are signed on this chain.
 * Arbitrum (see bridge.ts) is only used for the USDC deposit.
 */
export const hlChain = isTestnet ? hyperliquidEvmTestnet : hyperEvm;
