'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useSwitchChain } from 'wagmi';
import { bridge } from '@/config/bridge';
import { configErrors, env } from '@/config/env';
import { ApiError } from '@/lib/api';
import { useSession } from '@/features/auth/SessionProvider';
import { DepositPanel } from '@/features/deposit/DepositPanel';
import { Button, ErrorText, Spinner } from '@/components/ui';
import { useTrading, type SetupStep } from './TradingProvider';

const STEPS: { id: SetupStep; label: string }[] = [
  { id: 'connect', label: 'Connect wallet' },
  { id: 'network', label: 'Network' },
  { id: 'sign-in', label: 'Sign in' },
  { id: 'terms', label: 'Accept terms' },
  { id: 'deposit', label: 'Deposit' },
  { id: 'enable-trading', label: 'Enable trading' },
];

/** Shown in place of the order form until the user can trade. */
export function SetupPanel() {
  const { step } = useTrading();
  const currentIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="space-y-4 p-3">
      {step !== 'config' && (
        <ol className="space-y-1 text-xs">
          {STEPS.map((s, i) => (
            <li key={s.id} className={i < currentIndex ? 'text-buy' : i === currentIndex ? 'text-fg' : 'text-muted'}>
              {i < currentIndex ? '✓' : `${i + 1}.`} {s.label}
            </li>
          ))}
        </ol>
      )}
      <div className="border-t border-line pt-4">
        <StepBody step={step} />
      </div>
    </div>
  );
}

function StepBody({ step }: { step: SetupStep }) {
  switch (step) {
    case 'config':
      return (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-sell">Trading is not configured.</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
            {configErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="text-xs text-muted">Set these in .env.local (see .env.example) and restart the dev server.</p>
        </div>
      );
    case 'connect':
      return (
        <div className="space-y-3 text-sm">
          <p className="text-muted">Connect a regular wallet (MetaMask, Rabby, …). Smart contract wallets are not supported.</p>
          <ConnectButton />
        </div>
      );
    case 'network':
      return <SwitchNetwork />;
    case 'sign-in':
      return <SignIn />;
    case 'terms':
      return <Terms />;
    case 'deposit':
      return <Deposit />;
    case 'enable-trading':
      return <EnableTrading />;
    case 'ready':
      return null;
  }
}

function SwitchNetwork() {
  const { switchChain, isPending, error } = useSwitchChain();
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">Switch your wallet to {bridge.chain.name}.</p>
      <Button className="w-full" disabled={isPending} onClick={() => switchChain({ chainId: bridge.chain.id })}>
        {isPending ? <Spinner /> : `Switch to ${bridge.chain.name}`}
      </Button>
      <ErrorText error={error} />
    </div>
  );
}

function SignIn() {
  const { status, signIn, signingIn, signInError, checkError, retryCheck } = useSession();
  if (status === 'checking') {
    return checkError ? (
      <div className="space-y-2 text-sm">
        <p className="text-muted">Could not reach the XEN server.</p>
        <Button variant="ghost" onClick={retryCheck}>Retry</Button>
        <ErrorText error={checkError} />
      </div>
    ) : (
      <p className="text-sm text-muted"><Spinner /> Checking session…</p>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">Sign a message to prove you own this wallet. This costs no gas.</p>
      <Button className="w-full" disabled={signingIn} onClick={() => void signIn().catch(() => {})}>
        {signingIn ? <Spinner /> : 'Sign in'}
      </Button>
      <ErrorText error={signInError} />
    </div>
  );
}

function Terms() {
  const { terms } = useTrading();
  const { current, status, accept } = terms;

  if (current.error instanceof ApiError && current.error.status === 404) {
    return <p className="text-sm text-sell">No terms version is published yet. Ask the XEN team to publish one.</p>;
  }
  if (current.isLoading || status.isLoading) return <p className="text-sm text-muted"><Spinner /> Loading terms…</p>;
  if (current.error || status.error) return <ErrorText error={current.error ?? status.error} />;
  if (!current.data) return null;

  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium">Terms and risk disclosure</p>
      <p className="text-xs text-muted">
        Version {current.data.version} · effective {new Date(current.data.effectiveFrom).toLocaleDateString()}
      </p>
      {/* TODO(open decision): show the full published terms text here (a /terms page or static file).
          It must be the exact file whose SHA-256 the backend stores (textHash). */}
      <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-bg p-3 text-xs">
        {current.data.statement}
      </div>
      {status.data?.accepted === false && status.data.acceptedAt && (
        <p className="text-xs text-warn">The terms have changed since you last accepted them.</p>
      )}
      <Button className="w-full" disabled={accept.isPending} onClick={() => accept.mutate()}>
        {accept.isPending ? <Spinner /> : 'I accept'}
      </Button>
      <ErrorText error={accept.error} />
    </div>
  );
}

function Deposit() {
  const { setup } = useTrading();
  if (setup.account.isLoading) return <p className="text-sm text-muted"><Spinner /> Loading account…</p>;
  if (setup.account.error) return <ErrorText error={setup.account.error} />;
  return <DepositPanel />;
}

function EnableTrading() {
  const { setup } = useTrading();
  const { builderApproved, agentApproved, approveBuilder, approveAgent, builder, agents, walletReady } = setup;
  const feePct = env.builderFee !== null ? `${env.builderFee / 1000}%` : '-';

  if (builder.isLoading || agents.isLoading) return <p className="text-sm text-muted"><Spinner /> Checking…</p>;

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">Two one-time wallet signatures. Neither one moves funds.</p>

      <div className="space-y-2">
        <p className="font-medium">{builderApproved ? '✓ ' : ''}1. Approve XEN fee</p>
        <p className="text-xs text-muted">Allows XEN Perps to charge up to {feePct} per trade, on top of Hyperliquid fees.</p>
        {!builderApproved && (
          <Button className="w-full" disabled={!walletReady || approveBuilder.isPending} onClick={() => approveBuilder.mutate()}>
            {approveBuilder.isPending ? <Spinner /> : 'Approve fee'}
          </Button>
        )}
        <ErrorText error={approveBuilder.error ?? builder.error} />
      </div>

      <div className="space-y-2">
        <p className="font-medium">{agentApproved ? '✓ ' : ''}2. Approve trading key</p>
        <p className="text-xs text-muted">
          Creates a trading key in this browser so orders don&apos;t need a wallet popup. It can trade but cannot withdraw or
          transfer funds, and never leaves this browser.
        </p>
        {!agentApproved && (
          <Button
            className="w-full"
            disabled={!walletReady || !builderApproved || approveAgent.isPending}
            onClick={() => approveAgent.mutate()}
          >
            {approveAgent.isPending ? <Spinner /> : 'Approve trading key'}
          </Button>
        )}
        <ErrorText error={approveAgent.error ?? agents.error} />
      </div>
    </div>
  );
}
