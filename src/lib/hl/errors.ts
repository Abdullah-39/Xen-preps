import { describeError } from '@/components/ui';

/**
 * Turns Hyperliquid order rejections into messages a trader understands. The raw Hyperliquid
 * message is kept at the end for support/debugging.
 * Error strings: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses
 */
const RULES: { match: RegExp; message: string }[] = [
  {
    match: /too far from oracle|too far from reference price/i,
    message:
      'Price is too far from the oracle price. The order book has moved away from the oracle (common on testnet). Try a limit order closer to the oracle price, or try again later.',
  },
  {
    match: /could not immediately match/i,
    message: 'Not filled: no orders in the book within the allowed slippage. Try a smaller size or a limit order.',
  },
  { match: /insufficient margin/i, message: 'Not enough margin for this order. Reduce the size or leverage, or deposit more USDC.' },
  { match: /minimum value of \$?10/i, message: 'Order value is below the $10 minimum.' },
  { match: /reduce only order would increase position/i, message: 'Reduce-only order would increase your position.' },
  { match: /builder fee has not been approved|builder.*not approved/i, message: 'The XEN fee approval is missing. Re-enable trading.' },
  {
    match: /user or api wallet .* does not exist/i,
    message: 'Hyperliquid does not know this wallet or trading key yet. Deposit first, then enable trading again.',
  },
  {
    match: /more aggressive than oracle while at open interest cap/i,
    message: 'This market is at its open interest cap: orders priced more aggressively than the oracle are rejected.',
  },
];

export function describeOrderError(err: unknown): string {
  const raw = describeError(err);
  const rule = RULES.find((r) => r.match.test(raw));
  return rule ? `${rule.message} (${raw})` : raw;
}

/** Same as describeOrderError, as an Error for <ErrorText>. */
export function toOrderError(err: unknown): Error | null {
  return err ? new Error(describeOrderError(err)) : null;
}
