import { connectorsForWallets, type Wallet, type WalletList } from '@rainbow-me/rainbowkit';
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, createConnector, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { bridge } from '@/config/bridge';
import { hlChain } from '@/config/chains';
import { env } from '@/config/env';

/**
 * Regular wallets (EOA) only. Hyperliquid and the XEN backend both need EOA signatures, so smart
 * contract wallets (Safe, Coinbase Smart Wallet, Base Account, other ERC-4337) are not offered.
 */
coinbaseWallet.preference = 'eoaOnly';

const hasWalletConnect = env.walletConnectProjectId !== '';

type CreateWallet = WalletList[number]['wallets'][number];

interface InjectedEthereum {
  isMetaMask?: boolean;
  providers?: InjectedEthereum[];
}

function hasMetaMaskExtension(): boolean {
  if (typeof window === 'undefined') return false;
  const eth = (window as Window & { ethereum?: InjectedEthereum }).ethereum;
  return !!eth && (!!eth.isMetaMask || !!eth.providers?.some((p: InjectedEthereum) => p.isMetaMask));
}

/**
 * MetaMask through the browser extension's own injected provider.
 * RainbowKit's MetaMask entry uses the MetaMask SDK connector even when the extension is installed.
 * With it, MetaMask rejected the Hyperliquid EIP-712 approvals with 4100 ("account and/or method
 * has not been authorized") after switching to HyperEVM, while personal_sign still worked. The
 * plain injected provider is what wallets are tested against, so use it whenever the extension is
 * there; fall back to RainbowKit's entry (SDK / WalletConnect) when it is not.
 */
const metaMaskExtensionWallet: CreateWallet = (params) => {
  const base: Wallet = metaMaskWallet(params);
  if (!hasMetaMaskExtension()) return base;
  return {
    ...base,
    installed: true,
    createConnector: (walletDetails) =>
      createConnector((config) => ({
        ...injected({ target: 'metaMask' })(config),
        ...walletDetails,
      })),
  };
};

// MetaMask and Rabby connect through the browser extension directly; that needs no WalletConnect
// project ID. Without an ID, MetaMask only works when its extension is installed (no QR / mobile).
const wallets: WalletList = [
  {
    groupName: 'Wallets',
    wallets: hasWalletConnect
      ? [metaMaskExtensionWallet, rabbyWallet, rainbowWallet, coinbaseWallet, walletConnectWallet]
      : [metaMaskExtensionWallet, rabbyWallet, coinbaseWallet, injectedWallet],
  },
];

const connectors = connectorsForWallets(wallets, {
  appName: 'XEN Perps',
  // RainbowKit requires a value; WalletConnect-based wallets are only listed when it is set.
  projectId: env.walletConnectProjectId || 'unset',
});

/**
 * HyperEVM is the main chain (listed first). Arbitrum / Arbitrum Sepolia is only for USDC deposits.
 * Both follow NEXT_PUBLIC_HL_NETWORK.
 */
export const wagmiConfig = createConfig({
  connectors,
  chains: [hlChain, bridge.chain],
  transports: { [hlChain.id]: http(), [bridge.chain.id]: http() },
  ssr: true,
});
