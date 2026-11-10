import { connectorsForWallets, type WalletList } from '@rainbow-me/rainbowkit';
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { bridge } from '@/config/bridge';
import { env } from '@/config/env';

/**
 * Regular wallets (EOA) only. Hyperliquid and the XEN backend both need EOA signatures, so smart
 * contract wallets (Safe, Coinbase Smart Wallet, Base Account, other ERC-4337) are not offered.
 */
coinbaseWallet.preference = 'eoaOnly';

const hasWalletConnect = env.walletConnectProjectId !== '';

const wallets: WalletList = [
  {
    groupName: 'Wallets',
    wallets: hasWalletConnect
      ? [metaMaskWallet, rabbyWallet, rainbowWallet, coinbaseWallet, walletConnectWallet]
      : [injectedWallet, rabbyWallet, coinbaseWallet],
  },
];

const connectors = connectorsForWallets(wallets, {
  appName: 'XEN Perps',
  // RainbowKit requires a value; WalletConnect-based wallets are only listed when it is set.
  projectId: env.walletConnectProjectId || 'unset',
});

/** Arbitrum (mainnet) or Arbitrum Sepolia (testnet), matching NEXT_PUBLIC_HL_NETWORK. Used for deposits. */
export const wagmiConfig = createConfig({
  connectors,
  chains: [bridge.chain],
  transports: { [bridge.chain.id]: http() },
  ssr: true,
});
