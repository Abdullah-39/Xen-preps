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
 */
export function marketOrderPrice(
  mid: string,
  isBuy: boolean,
  szDecimals: number,
  slippagePct: string = DEFAULT_SLIPPAGE_PCT,
): string {
  const slip = new Decimal(slippagePct).div(100);
  const factor = isBuy ? new Decimal(1).plus(slip) : new Decimal(1).minus(slip);
  return toPerpPrice(new Decimal(mid).times(factor), szDecimals);
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
