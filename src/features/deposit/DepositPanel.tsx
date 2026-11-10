'use client';

import Decimal from 'decimal.js';
import { useState } from 'react';
import { erc20Abi, formatUnits, parseUnits } from 'viem';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { bridge } from '@/config/bridge';
import { isTestnet } from '@/config/env';
import { Button, ErrorText, Spinner } from '@/components/ui';

/**
 * Deposit = plain USDC ERC-20 transfer on Arbitrum to Hyperliquid's bridge. It is credited to the
 * sending address, usually within a minute. Below the minimum it is NOT credited and is lost.
 */
export function DepositPanel() {
  const { address } = useAccount();
  const [amount, setAmount] = useState('');

  const balance = useReadContract({
    address: bridge.usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: bridge.chain.id,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data, chainId: bridge.chain.id });

  const balanceStr = balance.data !== undefined ? formatUnits(balance.data, bridge.usdcDecimals) : null;
  const validation = validate(amount, balanceStr);

  function deposit() {
    if (validation) return;
    write.writeContract({
      address: bridge.usdcAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [bridge.bridgeAddress, parseUnits(amount, bridge.usdcDecimals)],
      chainId: bridge.chain.id,
    });
  }

  const busy = write.isPending || receipt.isLoading;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Deposit USDC from {bridge.chain.name} into your Hyperliquid account. Funds stay in your own account.
        {isTestnet && ' On testnet, use Hyperliquid testnet USDC.'}
      </p>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Wallet USDC</span>
        <button className="underline-offset-2 hover:underline" onClick={() => balanceStr && setAmount(balanceStr)}>
          {balanceStr ?? '-'}
        </button>
      </div>
      <input
        inputMode="decimal"
        placeholder={`Amount (min ${bridge.minDepositUsdc} USDC)`}
        value={amount}
        onChange={(e) => setAmount(e.target.value.trim())}
        className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {amount && validation && <p className="text-xs text-sell">{validation}</p>}
      <p className="text-xs text-warn">
        Deposits below {bridge.minDepositUsdc} USDC are not credited and are lost.
      </p>
      <Button className="w-full" disabled={!!validation || busy} onClick={deposit}>
        {busy ? <Spinner /> : 'Deposit'}
      </Button>
      {receipt.isSuccess && (
        <p className="text-xs text-buy">Transfer confirmed. Hyperliquid usually credits it within a minute.</p>
      )}
      <ErrorText error={write.error ?? receipt.error} />
    </div>
  );
}

function validate(amount: string, balance: string | null): string | null {
  if (!amount) return 'Enter an amount.';
  let d: Decimal;
  try {
    d = new Decimal(amount);
  } catch {
    return 'Enter a valid number.';
  }
  if (!d.isFinite() || d.decimalPlaces() > bridge.usdcDecimals) return 'Enter a valid number.';
  if (d.lt(bridge.minDepositUsdc)) return `Minimum deposit is ${bridge.minDepositUsdc} USDC.`;
  if (balance !== null && d.gt(balance)) return 'Amount is more than your wallet balance.';
  return null;
}
