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
  const message = error instanceof Error ? error.message : String(error);
  return <p className="mt-2 break-words text-xs text-sell">{shorten(message)}</p>;
}

/** Wallet errors can be very long (full RPC dumps). Keep the first useful line. */
function shorten(message: string): string {
  const first = message.split('\n')[0];
  return first.length > 300 ? `${first.slice(0, 300)}…` : first;
}

export function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />;
}
