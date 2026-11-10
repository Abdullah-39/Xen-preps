import type { NextConfig } from 'next';

// wagmi's Base Account connector (a smart wallet, which we don't offer) pulls in @coinbase/cdp-sdk,
// whose optional @x402/* peer deps aren't installed. Map them to an empty module so the build resolves.
const EMPTY = './src/lib/empty-module.js';
const optionalPeers = [
  '@x402/core',
  '@x402/core/client',
  '@x402/evm',
  '@x402/evm/exact/client',
  '@x402/evm/upto/client',
  '@x402/svm',
  '@x402/svm/exact/client',
  '@x402/extensions',
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
    resolveAlias: Object.fromEntries(optionalPeers.map((m) => [m, EMPTY])),
  },
};

export default nextConfig;
