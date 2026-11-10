import {
  HttpTransport,
  InfoClient,
  SubscriptionClient,
  WebSocketTransport,
} from '@nktkas/hyperliquid';
import { isTestnet } from '@/config/env';

/**
 * Shared Hyperliquid clients. The network always comes from NEXT_PUBLIC_HL_NETWORK.
 * HTTP and WebSocket transports always point at the same network.
 */
export const httpTransport = new HttpTransport({ isTestnet });
export const info = new InfoClient({ transport: httpTransport });

let wsTransport: WebSocketTransport | null = null;
let subs: SubscriptionClient | null = null;

/** Lazily opened so server rendering never creates a socket. Browser only. */
export function getSubscriptionClient(): SubscriptionClient {
  if (typeof window === 'undefined') throw new Error('Subscriptions are browser-only');
  if (!subs) {
    wsTransport = new WebSocketTransport({ isTestnet });
    subs = new SubscriptionClient({ transport: wsTransport });
  }
  return subs;
}

export type InfoResult<K extends keyof InfoClient> = InfoClient[K] extends (...args: never[]) => Promise<infer R>
  ? R
  : never;

export type ClearinghouseState = InfoResult<'clearinghouseState'>;
export type MetaAndAssetCtxs = InfoResult<'metaAndAssetCtxs'>;
export type PerpMeta = MetaAndAssetCtxs[0];
export type PerpAssetCtx = MetaAndAssetCtxs[1][number];
export type FrontendOpenOrders = InfoResult<'frontendOpenOrders'>;
export type L2Book = NonNullable<InfoResult<'l2Book'>>;
