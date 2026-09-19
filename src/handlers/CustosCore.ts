/*
 * Please refer to https://docs.envio.dev for a thorough guide on all Envio indexer features
 */
import { indexer } from "envio";
import { ONE, agentKey, vaultKey } from "./derived";
import type {
  CustosCore_AgentAllowanceChanged,
  CustosCore_AgentPeriodChanged,
  CustosCore_AgentPublicChanged,
  CustosCore_AgentRegistered,
  CustosCore_AgentStatusChanged,
  CustosCore_AuroraReceiverChanged,
  CustosCore_Initialized,
  CustosCore_MarketAdapterChanged,
  CustosCore_MarketAllowedChanged,
  CustosCore_MinSeedChanged,
  CustosCore_PausedChanged,
  CustosCore_Upgraded,
} from "envio";

indexer.onEvent(
  { contract: "CustosCore", event: "AgentAllowanceChanged", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const entity: CustosCore_AgentAllowanceChanged = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      event_id: event.params.id,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
      oldAllowance: event.params.oldAllowance,
      newAllowance: event.params.newAllowance,
    };

    context.CustosCore_AgentAllowanceChanged.set(entity);

    const agent = await context.Agent.get(agentKey(event.params.id));
    if (agent) context.Agent.set({ ...agent, allowance: event.params.newAllowance });
  },
);

indexer.onEvent(
  { contract: "CustosCore", event: "AgentPeriodChanged", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const entity: CustosCore_AgentPeriodChanged = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      event_id: event.params.id,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
      oldPeriodLength: event.params.oldPeriodLength,
      newPeriodLength: event.params.newPeriodLength,
    };

    context.CustosCore_AgentPeriodChanged.set(entity);

    const agent = await context.Agent.get(agentKey(event.params.id));
    if (agent) context.Agent.set({ ...agent, periodLength: event.params.newPeriodLength });
  },
);

indexer.onEvent(
  { contract: "CustosCore", event: "AgentPublicChanged", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const entity: CustosCore_AgentPublicChanged = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      event_id: event.params.id,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
      isPublic: event.params.isPublic,
    };

    context.CustosCore_AgentPublicChanged.set(entity);

    const agent = await context.Agent.get(agentKey(event.params.id));
    if (agent) context.Agent.set({ ...agent, isPublic: event.params.isPublic });
  },
);

// AgentVault has no fixed address in config.yaml — one is deployed per agent.
// This registers each new vault for dynamic indexing the moment it's created,
// so SwapExecuted/SubscriberDeposited/etc. get picked up automatically without
// ever needing to hand-list vault addresses.
indexer.contractRegister({ contract: "CustosCore", event: "AgentRegistered" }, async ({ event, context }) => {
  context.chain.AgentVault.add(event.params.vault);
});

indexer.onEvent(
  { contract: "CustosCore", event: "AgentRegistered", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const entity: CustosCore_AgentRegistered = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      event_id: event.params.id,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
      creator: event.params.creator,
      wallet: event.params.wallet,
      vault: event.params.vault,
      name: event.params.name,
      description: event.params.description,
      allowance: event.params.allowance,
      periodLength: event.params.periodLength,
      feeRate: event.params.feeRate,
      isPublic: event.params.isPublic,
    };

    context.CustosCore_AgentRegistered.set(entity);

    const id = agentKey(event.params.id);
    context.Agent.set({
      id,
      creator: event.params.creator,
      wallet: event.params.wallet,
      vault: event.params.vault,
      name: event.params.name,
      description: event.params.description,
      allowance: event.params.allowance,
      periodLength: event.params.periodLength,
      feeRate: event.params.feeRate,
      isPublic: event.params.isPublic,
      status: 1,
      registeredAt: event.block.timestamp,
      sharePrice: ONE,
      lastPriceAt: event.block.timestamp,
      swapCount: 0,
      volume: 0n,
    });
    context.VaultRef.set({ id: vaultKey(event.params.vault), agent: id });
  },
);

indexer.onEvent(
  { contract: "CustosCore", event: "AgentStatusChanged", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const entity: CustosCore_AgentStatusChanged = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      event_id: event.params.id,
      blockNumber: event.block.number,
      logIndex: event.logIndex,
      timestamp: event.block.timestamp,
      oldStatus: event.params.oldStatus,
      newStatus: event.params.newStatus,
    };

    context.CustosCore_AgentStatusChanged.set(entity);

    const agent = await context.Agent.get(agentKey(event.params.id));
    if (agent) context.Agent.set({ ...agent, status: Number(event.params.newStatus) });
  },
);

indexer.onEvent({ contract: "CustosCore", event: "AuroraReceiverChanged" }, async ({ event, context }) => {
  const entity: CustosCore_AuroraReceiverChanged = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    oldReceiver: event.params.oldReceiver,
    newReceiver: event.params.newReceiver,
  };

  context.CustosCore_AuroraReceiverChanged.set(entity);
});

indexer.onEvent({ contract: "CustosCore", event: "Initialized" }, async ({ event, context }) => {
  const entity: CustosCore_Initialized = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    version: event.params.version,
  };

  context.CustosCore_Initialized.set(entity);
});

indexer.onEvent({ contract: "CustosCore", event: "MarketAdapterChanged" }, async ({ event, context }) => {
  const entity: CustosCore_MarketAdapterChanged = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    oldAdapter: event.params.oldAdapter,
    newAdapter: event.params.newAdapter,
  };

  context.CustosCore_MarketAdapterChanged.set(entity);
});

indexer.onEvent({ contract: "CustosCore", event: "MarketAllowedChanged" }, async ({ event, context }) => {
  const entity: CustosCore_MarketAllowedChanged = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    market: event.params.market,
    allowed: event.params.allowed,
  };

  context.CustosCore_MarketAllowedChanged.set(entity);
});

indexer.onEvent({ contract: "CustosCore", event: "MinSeedChanged" }, async ({ event, context }) => {
  const entity: CustosCore_MinSeedChanged = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    oldMinSeed: event.params.oldMinSeed,
    newMinSeed: event.params.newMinSeed,
  };

  context.CustosCore_MinSeedChanged.set(entity);
});

indexer.onEvent({ contract: "CustosCore", event: "PausedChanged" }, async ({ event, context }) => {
  const entity: CustosCore_PausedChanged = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    paused: event.params.paused,
  };

  context.CustosCore_PausedChanged.set(entity);
});

indexer.onEvent({ contract: "CustosCore", event: "Upgraded" }, async ({ event, context }) => {
  const entity: CustosCore_Upgraded = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    implementation: event.params.implementation,
  };

  context.CustosCore_Upgraded.set(entity);
});
