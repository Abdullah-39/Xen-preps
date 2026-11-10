import { ExchangeClient } from '@nktkas/hyperliquid';
import type {
  CancelParameters,
  OrderParameters,
  UpdateLeverageParameters,
} from '@nktkas/hyperliquid/api/exchange';
import type { PrivateKeyAccount } from 'viem/accounts';
import { env } from '@/config/env';
import { httpTransport } from './clients';

/**
 * Agent-signed trading actions (no wallet popups).
 *
 * RULE: every order carries XEN's builder code. `placeOrder` below is the ONLY place in the app
 * that calls `ExchangeClient.order`. Do not call `.order` anywhere else.
 *
 * Builder fee units: `builder.f` is in tenths of a basis point (50 = 0.05%).
 *
 * A TradingClient is only created by TradingProvider once the terms are accepted, the builder fee
 * is approved and the agent is approved, so nothing here can run before those checks pass.
 */
export interface TradingClient {
  agentAddress: `0x${string}`;
  placeOrder(
    orders: OrderParameters['orders'],
    grouping?: OrderParameters['grouping'],
  ): ReturnType<ExchangeClient['order']>;
  cancel(cancels: CancelParameters['cancels']): ReturnType<ExchangeClient['cancel']>;
  updateLeverage(params: UpdateLeverageParameters): ReturnType<ExchangeClient['updateLeverage']>;
}

export function createTradingClient(agent: PrivateKeyAccount): TradingClient {
  const { builderAddress, builderFee } = env;
  if (!builderAddress || builderFee === null) {
    throw new Error('Builder address and fee must be configured before trading.');
  }
  const BUILDER = { b: builderAddress, f: builderFee } as const;
  const agentExchange = new ExchangeClient({ transport: httpTransport, wallet: agent });

  return {
    agentAddress: agent.address,
    placeOrder(orders, grouping = 'na') {
      return agentExchange.order({ orders, grouping, builder: BUILDER });
    },
    cancel(cancels) {
      return agentExchange.cancel({ cancels });
    },
    updateLeverage(params) {
      return agentExchange.updateLeverage(params);
    },
  };
}
