import Decimal from 'decimal.js';
import { formatPrice, formatSize } from '@nktkas/hyperliquid/utils';

/**
 * Order maths. Prices and sizes stay strings; arithmetic goes through decimal.js, never JS floats.
 * Hyperliquid perps rules (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size):
 * - size: at most `szDecimals` decimals
 * - price: at most 5 significant figures and at most `6 - szDecimals` decimals (integers always OK)
 * The SDK's formatPrice/formatSize apply these rules (rounding down) and throw if the result is 0.
 */

export const DEFAULT_SLIPPAGE_PCT = '3';

export function toPerpPrice(price: Decimal.Value, szDecimals: number): string {
  return formatPrice(new Decimal(price).toFixed(), szDecimals, 'perp');
}

export function toSize(size: Decimal.Value, szDecimals: number): string {
  return formatSize(new Decimal(size).toFixed(), szDecimals);
}

/**
 * Limit price for a "market" order. Hyperliquid has no true market order: we send an IOC limit
 * at mid ± slippage.
 *
 * When `oraclePx` is given, the price is also kept within the same slippage of the oracle price.
 * Hyperliquid rejects orders priced too far from the oracle ("Order price too far from oracle"),
 * which happens on testnet when the book drifts away from the oracle. The exact threshold is not
 * documented, so we stay within our own slippage of it.
 */
export function marketOrderPrice(
  mid: string,
  isBuy: boolean,
  szDecimals: number,
  slippagePct: string = DEFAULT_SLIPPAGE_PCT,
  oraclePx?: string | null,
): string {
  const slip = new Decimal(slippagePct).div(100);
  const factor = isBuy ? new Decimal(1).plus(slip) : new Decimal(1).minus(slip);
  let price = new Decimal(mid).times(factor);
  if (oraclePx && isPositiveDecimal(oraclePx)) {
    const oracleLimit = new Decimal(oraclePx).times(factor);
    price = isBuy ? Decimal.min(price, oracleLimit) : Decimal.max(price, oracleLimit);
  }
  return toPerpPrice(price, szDecimals);
}

/** How far the book (mid) is from the oracle, in percent (positive = mid above oracle). */
export function oracleGapPct(mid: string | null, oraclePx: string): string | null {
  if (!mid || !isPositiveDecimal(mid) || !isPositiveDecimal(oraclePx)) return null;
  return new Decimal(mid).div(oraclePx).minus(1).times(100).toFixed(2);
}

/**
 * True when a market order on this side probably can't fill within the slippage: the best price
 * available in the book is further from the oracle than our slippage allows.
 */
export function marketOrderBlockedByOracle(
  mid: string | null,
  oraclePx: string,
  isBuy: boolean,
  slippagePct: string = DEFAULT_SLIPPAGE_PCT,
): boolean {
  const gap = oracleGapPct(mid, oraclePx);
  if (gap === null) return false;
  // Buying when the book is far above the oracle, or selling when it is far below it.
  return isBuy ? new Decimal(gap).gt(slippagePct) : new Decimal(gap).lt(new Decimal(slippagePct).neg());
}

/** Size in coins from a USD notional at a given price. */
export function sizeFromUsd(usd: string, price: string, szDecimals: number): string {
  return toSize(new Decimal(usd).div(price), szDecimals);
}

export function isPositiveDecimal(value: string): boolean {
  try {
    const d = new Decimal(value);
    return d.isFinite() && d.gt(0);
  } catch {
    return false;
  }
}

/** Display helper only. Never feed the result back into order maths. */
export function fmt(value: string | null | undefined, dp = 2): string {
  if (value == null || value === '') return '-';
  try {
    return new Decimal(value).toFixed(dp);
  } catch {
    return value;
  }
}
