/*
 * Please refer to https://docs.envio.dev for a thorough guide on all Envio indexer features
 *
 * AgentVault has no fixed address — one is deployed per agent via
 * CustosCore.registerAgent. Instances are registered dynamically; see the
 * indexer.contractRegister call in CustosCore.ts.
 */
import { indexer } from "envio";
import type {
  AgentVault_CircuitBreakerTriggered,
  AgentVault_FeeMinted,
  AgentVault_SeedDeposited,
  AgentVault_SubscriberDeposited,
  AgentVault_SubscriberRedeemed,
  AgentVault_SwapExecuted,
  AgentVault_Transfer,
} from "envio";

indexer.onEvent(
  { contract: "AgentVault", event: "SwapExecuted", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const entity: AgentVault_SwapExecuted = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
      vault: event.params.vault,
      agentId: event.params.agentId,
      market: event.params.market,
      isBuy: event.params.isBuy,
      baseAmount: event.params.baseAmount,
      quoteAmount: event.params.quoteAmount,
      notionalCharged: event.params.notionalCharged,
      newTotalAssets: event.params.newTotalAssets,
      newSharePrice: event.params.newSharePrice,
    };

    context.AgentVault_SwapExecuted.set(entity);
  },
);

indexer.onEvent(
  { contract: "AgentVault", event: "SubscriberDeposited", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const entity: AgentVault_SubscriberDeposited = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
      vault: event.params.vault,
      subscriber: event.params.subscriber,
      assets: event.params.assets,
      shares: event.params.shares,
    };

    context.AgentVault_SubscriberDeposited.set(entity);
  },
);

indexer.onEvent(
  { contract: "AgentVault", event: "SubscriberRedeemed", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const entity: AgentVault_SubscriberRedeemed = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
      vault: event.params.vault,
      subscriber: event.params.subscriber,
      assets: event.params.assets,
      shares: event.params.shares,
    };

    context.AgentVault_SubscriberRedeemed.set(entity);
  },
);

indexer.onEvent(
  { contract: "AgentVault", event: "SeedDeposited", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const entity: AgentVault_SeedDeposited = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
      vault: event.params.vault,
      creator: event.params.creator,
      assets: event.params.assets,
      shares: event.params.shares,
      deadAddress: event.params.deadAddress,
    };

    context.AgentVault_SeedDeposited.set(entity);
  },
);

indexer.onEvent(
  { contract: "AgentVault", event: "FeeMinted", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const entity: AgentVault_FeeMinted = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
      vault: event.params.vault,
      creator: event.params.creator,
      feeShares: event.params.feeShares,
      feeAssets: event.params.feeAssets,
      newHighWaterMark: event.params.newHighWaterMark,
    };

    context.AgentVault_FeeMinted.set(entity);
  },
);

indexer.onEvent(
  { contract: "AgentVault", event: "CircuitBreakerTriggered", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const entity: AgentVault_CircuitBreakerTriggered = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
      vault: event.params.vault,
      currentSharePrice: event.params.currentSharePrice,
      highWaterMark: event.params.highWaterMark,
      maxDrawdownBps: event.params.maxDrawdownBps,
    };

    context.AgentVault_CircuitBreakerTriggered.set(entity);
  },
);

indexer.onEvent(
  { contract: "AgentVault", event: "Transfer", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const entity: AgentVault_Transfer = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
      from: event.params.from,
      to: event.params.to,
      value: event.params.value,
    };

    context.AgentVault_Transfer.set(entity);
  },
);
