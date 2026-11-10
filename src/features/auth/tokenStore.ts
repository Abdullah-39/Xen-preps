/**
 * JWT storage. One token at a time, tied to the address that signed in.
 * Exposed as an external store so React can read it with useSyncExternalStore.
 */
export interface StoredSession {
  address: string; // lowercase
  token: string;
}

const KEY = 'xen-perps:session';
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: StoredSession | null = null;

function read(): StoredSession | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    cached = raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    cached = null;
  }
  return cached;
}

function emit() {
  listeners.forEach((l) => l());
}

export const tokenStore = {
  get: read,
  getServerSnapshot: (): StoredSession | null => null,
  set(session: StoredSession) {
    window.localStorage.setItem(KEY, JSON.stringify({ ...session, address: session.address.toLowerCase() }));
    emit();
  },
  clear() {
    window.localStorage.removeItem(KEY);
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  },
};
