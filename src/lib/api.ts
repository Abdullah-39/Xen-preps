import { env } from '@/config/env';

/** XEN backend client (xen-perps-backend). Shapes match the backend's Swagger at /docs. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly messages: string[],
    readonly error?: string,
  ) {
    super(messages.join('; ') || error || `Request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  bearer?: string | null;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(method: 'GET' | 'POST', path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;

  const res = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  });

  const text = await res.text();
  const data: unknown = text ? safeJson(text) : undefined;

  if (!res.ok) {
    // NestJS error format: { statusCode, message, error }. On validation 400s, message is string[].
    const body = (data ?? {}) as { message?: string | string[]; error?: string };
    const messages = Array.isArray(body.message) ? body.message : body.message ? [body.message] : [];
    throw new ApiError(res.status, messages, body.error);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export interface NonceResponse {
  nonce: string;
  expiresAt: string;
}
export interface VerifyResponse {
  accessToken: string;
  address: string;
}
export interface MeResponse {
  address: string;
}
export interface TermsCurrent {
  version: string;
  textHash: string;
  effectiveFrom: string;
  statement: string;
}
export interface TermsStatus {
  address: string;
  version: string;
  accepted: boolean;
  acceptedAt?: string;
}

export const api = {
  nonce: () => request<NonceResponse>('POST', '/auth/nonce'),
  verify: (message: string, signature: string) =>
    request<VerifyResponse>('POST', '/auth/verify', { body: { message, signature } }),
  me: (bearer: string) => request<MeResponse>('GET', '/auth/me', { bearer }),
  termsCurrent: () => request<TermsCurrent>('GET', '/terms/current'),
  termsStatus: (address: string) =>
    request<TermsStatus>('GET', `/terms/status/${address.toLowerCase()}`),
  termsAccept: (message: string, signature: string, bearer: string) =>
    request<TermsStatus>('POST', '/terms/accept', { body: { message, signature }, bearer }),
};
