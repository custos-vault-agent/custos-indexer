/*
 * Please refer to https://docs.envio.dev for a thorough guide on all Envio indexer features
 *
 * AgentVault has no fixed address — one is deployed per agent via
 * CustosCore.registerAgent. Instances are registered dynamically; see the
 * indexer.contractRegister call in CustosCore.ts.
 */
import { indexer } from "envio";
import {
  ONE, ZERO_ADDRESS, agentByVault, agentKey, applyDeposit, applyRedeem, applySwap, applyYield,
  recordPrice, shareBalance, subscriberDelta, updatePosition,
} from "./derived";
import { marketBase, tokenMeta } from "./effects";
import type {
  AgentVault_CircuitBreakerTriggered,
  AgentVault_FeeMinted,
  AgentVault_SeedDeposited,
  AgentVault_SubscriberDeposited,
  AgentVault_SubscriberRedeemed,
  AgentVault_SwapExecuted,
  AgentVault_Transfer,
  AgentVault_YieldPulled,
  AgentVault_YieldPushed,
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

    const agent = await context.Agent.get(agentKey(event.params.agentId));
    if (agent) {
      const updated = recordPrice(context, agent, {
        id: entity.id,
        timestamp: event.block.timestamp,
        sharePrice: event.params.newSharePrice,
        totalAssets: event.params.newTotalAssets,
        notional: event.params.notionalCharged,
        source: "swap",
      });
      const { isBuy, baseAmount, quoteAmount } = event.params;
      const basis = applySwap(agent, isBuy, baseAmount, quoteAmount);
      if (!basis) context.log.warn(`sell with no tracked base balance on ${agent.id}; cost basis skipped`);
      context.Agent.set({
        ...updated,
        ...basis,
        totalAssets: event.params.newTotalAssets,
        swapCount: agent.swapCount + 1,
        volume: agent.volume + event.params.notionalCharged,
      });
    }

    const marketId = event.params.market.toLowerCase();
    if (!(await context.Market.get(marketId))) {
      const baseToken = await context.effect(marketBase, marketId);
      if (baseToken) {
        const meta = await context.effect(tokenMeta, baseToken);
        context.Market.set({ id: marketId, baseToken: baseToken.toLowerCase(), baseSymbol: meta.symbol, baseDecimals: meta.decimals });
      }
    }
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

    const agent = await agentByVault(context, event.params.vault);
    if (agent) {
      await updatePosition(context, agent, event.params.subscriber, event.block.timestamp, (p) => ({
        assetsIn: p.assetsIn + event.params.assets,
      }));
      context.Agent.set({ ...agent, totalAssets: applyDeposit(agent.totalAssets, event.params.assets) });
    }
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

    const agent = await agentByVault(context, event.params.vault);
    if (agent) {
      await updatePosition(context, agent, event.params.subscriber, event.block.timestamp, (p) => ({
        assetsOut: p.assetsOut + event.params.assets,
      }));
      context.Agent.set({ ...agent, totalAssets: applyRedeem(agent.totalAssets, event.params.assets) });
    }
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

    const agent = await agentByVault(context, event.params.vault);
    if (agent) {
      await updatePosition(context, agent, event.params.deadAddress, event.block.timestamp, (p) => ({
        assetsIn: p.assetsIn + event.params.assets,
      }));
      context.Agent.set({
        ...recordPrice(context, agent, {
          id: entity.id,
          timestamp: event.block.timestamp,
          sharePrice: ONE,
          totalAssets: event.params.assets,
          notional: 0n,
          source: "seed",
        }),
        totalAssets: applyDeposit(agent.totalAssets, event.params.assets),
      });
    }
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

    const agent = await agentByVault(context, event.params.vault);
    if (agent) {
      // The vault pauses itself here with no registry event; mirror it.
      context.Agent.set({
        ...recordPrice(context, agent, {
          id: entity.id,
          timestamp: event.block.timestamp,
          sharePrice: event.params.currentSharePrice,
          totalAssets: 0n,
          notional: 0n,
          source: "breaker",
        }),
        status: 2,
      });
    }
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
      vault: event.srcAddress,
      from: event.params.from,
      to: event.params.to,
      value: event.params.value,
    };

    context.AgentVault_Transfer.set(entity);

    const agent = await agentByVault(context, event.srcAddress);
    if (!agent) return;
    const { from, to, value } = event.params;
    let count = agent.subscriberCount;
    for (const [holder, delta] of [[from, -value], [to, value]] as const) {
      if (holder.toLowerCase() === ZERO_ADDRESS) continue;
      const { before, after } = await updatePosition(context, agent, holder, event.block.timestamp, (p) => ({
        shares: shareBalance(p.shares, delta),
      }));
      count = Math.max(0, count + subscriberDelta(holder, before.shares, after.shares));
    }
    if (count !== agent.subscriberCount) context.Agent.set({ ...agent, subscriberCount: count });
  },
);

for (const [name, pushed] of [["YieldPushed", true], ["YieldPulled", false]] as const) {
  indexer.onEvent(
    { contract: "AgentVault", event: name, fields: { block: ["timestamp"] } },
    async ({ event, context }) => {
      const entity: AgentVault_YieldPushed | AgentVault_YieldPulled = {
        id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
        blockNumber: event.block.number,
        logIndex: event.logIndex,
        timestamp: event.block.timestamp,
        vault: event.params.vault,
        amount: event.params.amount,
      };
      context[`AgentVault_${name}`].set(entity);

      const agent = await agentByVault(context, event.params.vault);
      if (agent) {
        context.Agent.set({ ...agent, yieldDeployed: applyYield(agent.yieldDeployed, event.params.amount, pushed) });
      }
    },
  );
}
