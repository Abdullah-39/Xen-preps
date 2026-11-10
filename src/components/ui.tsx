import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Panel({
  title,
  children,
  className = '',
  bodyClassName = 'overflow-auto',
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Body overflow; defaults to scrolling inside the panel. */
  bodyClassName?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col rounded-lg border border-line bg-panel ${className}`}>
      {title && <h2 className="shrink-0 border-b border-line px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">{title}</h2>}
      <div className={`relative min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'buy' | 'sell' | 'ghost' }) {
  const styles = {
    primary: 'bg-accent text-accent-fg hover:brightness-110',
    buy: 'bg-buy text-white hover:brightness-110',
    sell: 'bg-sell text-white hover:brightness-110',
    ghost: 'border border-line text-fg hover:bg-white/5',
  }[variant];
  return (
    <button
      className={`rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="mt-2 break-words text-xs text-sell">{describeError(error)}</p>;
}

/**
 * Wrapper errors (e.g. the Hyperliquid SDK's "Failed to sign the typed data using the wallet") hide
 * the real reason in `cause`. Show the chain of messages so the wallet's actual reason is visible.
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth++) {
    if (current instanceof Error) {
      const short = (current as Error & { shortMessage?: string }).shortMessage;
      const text = shorten(short || current.message);
      if (text && !parts.includes(text)) parts.push(text);
      current = current.cause;
    } else if (typeof current === 'object') {
      const o = current as { code?: unknown; message?: unknown; data?: unknown };
      const text =
        typeof o.message === 'string'
          ? `${o.message}${o.code !== undefined ? ` (code ${String(o.code)})` : ''}`
          : safeStringify(current);
      if (text && !parts.includes(text)) parts.push(shorten(text));
      break;
    } else {
      parts.push(shorten(String(current)));
      break;
    }
  }
  return parts.join(' → ');
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Wallet errors can be very long (full RPC dumps). Keep the first useful line. */
function shorten(message: string): string {
  const first = message.split('\n')[0];
  return first.length > 300 ? `${first.slice(0, 300)}…` : first;
}

export function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />;
}
