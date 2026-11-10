# CLAUDE.md: xen-perps-frontend

Context for Claude (and the team) when working in this repo. Put this file in the root of the front-end repo as `CLAUDE.md`.

## What we are building

**XEN Perps** is a XEN-branded perpetual futures trading app. It is **not** its own exchange. Order matching, margin, positions and funds all live on **Hyperliquid**. XEN Perps is a front end on top of Hyperliquid, and XEN earns a fee on every trade through Hyperliquid **builder codes**.

What that means:

- Users connect their own wallet. Their funds sit in their own Hyperliquid account, never with XEN.
- The browser talks **directly to Hyperliquid** for market data, account data, orders and withdrawals. Trades never go through our backend.
- Every order carries XEN's builder code (builder address + fee). That is XEN's revenue. An order without it earns XEN nothing.
- Our backend (`xen-perps-backend`, NestJS) is small: wallet login, terms acceptance records and health. Admin fee stats come later. It never holds keys, never signs anything and never touches funds.

```text
Browser (this repo)
 ├── User's wallet (MetaMask, Rabby, …)  signs login, terms, approvals, withdrawals
 ├── Hyperliquid API + WebSocket          market data, account data, orders
 └── XEN backend (REST)                   login (SIWE -> JWT), terms acceptance
```

## Stack

Planned: Next.js + React + TypeScript, with wagmi + viem for wallets. Wallet modal: RainbowKit is the recommendation, but it is not final.

| Package | Used for | Docs |
| --- | --- | --- |
| `viem` | Wallet utils, SIWE messages (`viem/siwe`), agent key | https://viem.sh/docs/siwe/utilities/createSiweMessage |
| `wagmi` | React hooks for wallet connection and signing | https://wagmi.sh |
| `@nktkas/hyperliquid` | Hyperliquid info, exchange and WebSocket calls | https://nktkas.gitbook.io/hyperliquid · https://www.npmjs.com/package/@nktkas/hyperliquid |
| `@rainbow-me/rainbowkit` (if chosen) | Connect wallet modal | https://rainbowkit.com |

Notes:

- `@nktkas/hyperliquid` is ESM-only and needs Node >= 22.12. The backend uses `0.33.x`. It is pre-1.0, so a minor bump (0.33 -> 0.34) can break things. Read the changelog before upgrading.
- Do **not** add `ethers` or the `siwe` package. viem covers both.

## Env variables

Everything with `NEXT_PUBLIC_` ends up in the browser bundle, so never put a secret here. None of these values are secret.

```text
NEXT_PUBLIC_API_URL=http://localhost:3001         # XEN backend
NEXT_PUBLIC_HL_NETWORK=testnet                    # testnet | mainnet
NEXT_PUBLIC_BUILDER_ADDRESS=                      # XEN builder wallet; same value as backend BUILDER_ADDRESS
NEXT_PUBLIC_BUILDER_FEE=                          # tenths of a basis point, e.g. 50 = 0.05%; final value not decided yet
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=             # only if RainbowKit / WalletConnect is used
```

- Get `BUILDER_ADDRESS` and the fee from Saif. They must match the backend.
- Never hard-code mainnet. The network always comes from `NEXT_PUBLIC_HL_NETWORK`.

## User flow

1. Connect wallet (regular wallets only, see below)
2. Sign in with Ethereum (SIWE) and get a JWT from our backend
3. Accept the terms, if not accepted for the current version
4. Deposit USDC into Hyperliquid, if the account is empty
5. Enable trading (once): approve XEN's builder fee and approve an agent wallet
6. Trade

### 1. Wallets: regular wallets (EOA) only

Hyperliquid needs signatures from normal wallets (EOAs), and the backend checks login signatures the same way. Smart contract wallets (Safe, Coinbase Smart Wallet, other ERC-4337 accounts) will not work. If you use the Coinbase Wallet connector, set it to EOA only (`preference: 'eoaOnly'`).

### 2. Sign in (SIWE)

```ts
import { createSiweMessage } from 'viem/siwe';

const { nonce } = await api.post('/auth/nonce'); // { nonce, expiresAt }

const message = createSiweMessage({
  address,                        // from wagmi useAccount()
  chainId,                        // from wagmi useAccount()
  domain: window.location.host,   // must equal the backend's SIWE_DOMAIN
  uri: window.location.origin,
  nonce,
  version: '1',
  statement: 'Sign in to XEN Perps',
});
const signature = await signMessageAsync({ message }); // wagmi useSignMessage()

const { accessToken, address: wallet } = await api.post('/auth/verify', { message, signature });
```

- `domain` must match the backend's `SIWE_DOMAIN` exactly: host and port, no `http://`. In dev that is `localhost:3000`, so run the front end on port 3000. Before deploying, tell Saif the production domain, because the backend needs the same value.
- A nonce works once and expires after 10 minutes. Get a fresh nonce for every signature.
- Send the token as `Authorization: Bearer <accessToken>`. It lasts 7 days.
- If any protected route returns 401, clear the token and sign in again.
- If the user switches account in the wallet, the token belongs to the old address. Clear it and sign in again.
- `GET /auth/me` tells you whether a stored token is still valid.

### 3. Terms and risk disclosure

```ts
const terms = await api.get('/terms/current');
// { version, textHash, effectiveFrom, statement }

const status = await api.get(`/terms/status/${address}`);
// { address, version, accepted, acceptedAt? }

if (!status.accepted) {
  // Show the terms. The user clicks "I accept" and the wallet signs:
  const { nonce } = await api.post('/auth/nonce');
  const message = createSiweMessage({
    address, chainId, nonce, version: '1',
    domain: window.location.host,
    uri: window.location.origin,
    statement: terms.statement, // copy exactly; do not change a character
  });
  const signature = await signMessageAsync({ message });
  await api.post('/terms/accept', { message, signature }, { bearer: accessToken });
}
```

- **The front end has to enforce this.** Orders go straight to Hyperliquid, so the backend cannot stop an order from a wallet that has not accepted the terms. Block every trading action until `accepted` is `true`.
- `accepted` covers only the current version. When we publish a new version, it becomes `false` again and the user must accept again.
- The backend stores only the version and the SHA-256 of the terms file. The text that users see must be exactly the file we published. Where that file lives is still open (see Open decisions).

### 4. Deposit

A deposit is a normal USDC transfer on Arbitrum to Hyperliquid's bridge contract (an ERC-20 `transfer` with wagmi). Take the bridge address and minimum deposit for testnet and mainnet from Hyperliquid's bridge docs. Do not guess them: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/bridge2

Show the account balance from `info.clearinghouseState({ user })`.

### 5. Enable trading (once per wallet)

Hyperliquid rejects actions from a wallet that has never deposited ("User or API Wallet does not exist"), so run this after the first deposit.

**a) Approve XEN's builder fee.** This must be signed by the user's main wallet.

```ts
import { ExchangeClient, HttpTransport, InfoClient } from '@nktkas/hyperliquid';

const transport = new HttpTransport({ isTestnet: env.HL_NETWORK === 'testnet' });
const info = new InfoClient({ transport });
const mainExchange = new ExchangeClient({ transport, wallet: walletClient }); // wagmi useWalletClient()

const approved = await info.maxBuilderFee({ user: address, builder: env.BUILDER_ADDRESS });
if (approved < env.BUILDER_FEE) {
  await mainExchange.approveBuilderFee({
    builder: env.BUILDER_ADDRESS,
    maxFeeRate: `${env.BUILDER_FEE / 1000}%`, // 50 -> "0.05%"
  });
}
```

Watch the units. Hyperliquid writes the fee two ways:

| Where | Unit | 0.05% is written as |
| --- | --- | --- |
| `approveBuilderFee` `maxFeeRate` | percent string | `"0.05%"` |
| order `builder.f` and the `maxBuilderFee` result | tenths of a basis point (number) | `50` |

The perps maximum is `f = 100` (0.1%). If the units are wrong, orders are rejected.

**b) Approve an agent wallet.** Hyperliquid's own app works this way:

- Order signatures use an EIP-712 domain with chain ID 1337, which browser wallets usually refuse to sign, and a wallet popup on every order would be bad UX anyway.
- So generate a key in the browser with viem: `generatePrivateKey()` + `privateKeyToAccount()`.
- The main wallet approves it once with `mainExchange.approveAgent({ agentAddress, agentName })`.
- From then on the agent signs orders without popups.
- An agent can trade, but it cannot withdraw or transfer funds.
- The agent key stays in the browser (e.g. local storage, per user address). Never send it anywhere, including our backend.
- `info.extraAgents({ user })` lists a user's approved agents. If the stored agent is missing, approve a new one.

Which wallet signs what:

| Main wallet (popup) | Agent wallet (silent) |
| --- | --- |
| `approveBuilderFee`, `approveAgent`, `withdraw3`, `usdSend`, `usdClassTransfer` | `order`, `cancel`, `modify`, `updateLeverage`, `updateIsolatedMargin`, `scheduleCancel` |

### 6. Trading

Put every order through **one** helper so no code path can skip the builder code:

```ts
import type { OrderParameters } from '@nktkas/hyperliquid/api/exchange';

const BUILDER = { b: env.BUILDER_ADDRESS, f: env.BUILDER_FEE } as const;

const agentExchange = new ExchangeClient({ transport, wallet: agentAccount });

export function placeOrder(orders: OrderParameters['orders'], grouping: OrderParameters['grouping'] = 'na') {
  return agentExchange.order({ orders, grouping, builder: BUILDER });
}
```

- `a` (asset) is the coin's index in `info.meta().universe` (perps).
- Prices and sizes are **strings**. Do not do order math with plain JS floats.
- Round sizes to the coin's `szDecimals`. Perp prices allow at most 5 significant figures and at most `6 - szDecimals` decimals. Orders that break this are rejected: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size
- Hyperliquid has no true market order. A "market" order is an IOC limit order (`t: { limit: { tif: 'Ioc' } }`) at a price with slippage room, e.g. mid price ± a few percent.
- Set leverage with `updateLeverage` before placing the order.
- TP/SL are trigger orders with `grouping: 'normalTpsl'` (fixed size) or `'positionTpsl'` (follows the position size).

### Where the data comes from

All of this comes from Hyperliquid through the SDK, not from our backend:

| UI | `InfoClient` (snapshot) | `SubscriptionClient` (live, `WebSocketTransport`) |
| --- | --- | --- |
| Markets list, prices, funding, open interest | `metaAndAssetCtxs()` | `allMids`, `activeAssetCtx` |
| Order book | `l2Book({ coin })` | `l2Book({ coin })` |
| Recent trades | `recentTrades({ coin })` | `trades({ coin })` |
| Chart | `candleSnapshot(...)` | `candle({ coin, interval })` |
| Balance, positions, margin | `clearinghouseState({ user })` | `clearinghouseState({ user })` |
| Open orders | `frontendOpenOrders({ user })` | `openOrders({ user })` |
| Fills / trade history | `userFills({ user })` | `userFills({ user })` |
| Funding payments | `userFunding(...)` | `userFundings({ user })` |

Use `new WebSocketTransport({ isTestnet })` for subscriptions, with the same network as the HTTP transport.

## XEN backend API

Base URL: `NEXT_PUBLIC_API_URL`. In dev, the backend runs on `http://localhost:3001`, and its CORS only allows `http://localhost:3000`. Swagger with every request and response shape: `http://localhost:3001/docs` (not available in production).

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| POST | `/auth/nonce` | – | – | `{ nonce, expiresAt }` |
| POST | `/auth/verify` | – | `{ message, signature }` | `{ accessToken, address }` |
| GET | `/auth/me` | Bearer | – | `{ address }` |
| GET | `/terms/current` | – | – | `{ version, textHash, effectiveFrom, statement }` |
| POST | `/terms/accept` | Bearer | `{ message, signature }` | `{ address, version, accepted, acceptedAt }` |
| GET | `/terms/status/:address` | – | – | `{ address, version, accepted, acceptedAt? }` |
| GET | `/health` | – | – | `{ status: 'ok', ... }` |

All addresses in responses are lowercase. Compare addresses in lowercase.

Errors use the NestJS format: `{ statusCode, message, error }`. On a 400 from validation, `message` is an array of strings.

| Status | When | What the UI does |
| --- | --- | --- |
| 400 | Body is invalid, or the terms statement is not the current one | Fetch `/terms/current` again and ask the user to sign again |
| 401 | Bad or expired SIWE message, bad signature, nonce used or expired, missing or expired JWT | Get a new nonce and sign again; on a JWT route, sign in again |
| 403 | Terms signed by a different wallet than the logged-in one | Sign in again with the current wallet |
| 404 | `/terms/current` before any terms version is published | Show an error; ask Saif to publish a version |

## Rules

1. No private keys, seed phrases or agent keys ever leave the browser. Nothing in our backend needs them.
2. Every order includes XEN's builder code. Only `placeOrder` calls `order`.
3. No trading action before the terms are accepted for the current version.
4. Network comes from env. Never hard-code mainnet URLs or addresses.
5. Regular wallets (EOA) only.
6. Prices, sizes and money values as strings; use a decimal library for order maths.
7. Hyperliquid's API changes over time. Check request and response shapes in the Hyperliquid docs and the SDK types before building a feature.
8. Wallet screening (sanctions) and geo-blocking are **on hold**. Do not build UI for them now. They may come back before mainnet.

## Open decisions

- Wallet modal: RainbowKit (recommended), Reown AppKit or ConnectKit.
- Chart: TradingView Charting Library or Lightweight Charts.
- Where the terms text lives (a `/terms` page or a static file). It must be the exact file the backend has the hash of.
- Final builder fee value (business decision).
- XEN's builder wallet needs at least 100 USDC of perps account value on each network (per Hyperliquid's builder docs). Saif sets this up. If builder approvals fail on testnet, check this first.

## Getting started

1. Ask Saif for backend access (or a shared dev URL), plus `BUILDER_ADDRESS` and the testnet fee.
2. Run the backend on port 3001 and the front end on port 3000.
3. Ask Saif to publish a test terms version, otherwise `/terms/current` returns 404.
4. Get testnet USDC (see Hyperliquid's testnet docs) and test the full flow on testnet first.

## References

- Hyperliquid docs: https://hyperliquid.gitbook.io/hyperliquid-docs
- Hyperliquid API: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
- Builder codes: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes
- Agent (API) wallets and nonces: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets
- SDK: https://nktkas.gitbook.io/hyperliquid
- viem SIWE: https://viem.sh/docs/siwe/utilities/createSiweMessage
- wagmi: https://wagmi.sh
- Testnet app: https://app.hyperliquid-testnet.xyz
