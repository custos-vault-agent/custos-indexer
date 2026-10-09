import { indexer } from "envio";
import { blockTimestamp } from "./effects";

// Monad targets ~0.4s blocks; the repos do not state a block time, so assume
// 0.5s (7200 blocks/hour). That fires at least once per real hour.
const STRIDE = 7200;

// Snapshots carry forward the last event-derived values: idle-yield interest
// between events is invisible until the next swap or deposit. Reading
// totalAssets() per historical block would need archive RPC access.
indexer.onBlock(
  { name: "agentSnapshot", where: () => ({ block: { number: { _every: STRIDE } } }) },
  async ({ block, context }) => {
    const timestamp = await context.effect(blockTimestamp, block.number);
    // 0 means the RPC lookup failed; skip rather than write a bogus hour.
    if (timestamp === 0) return;
    const hourStart = Math.floor(timestamp / 3600) * 3600;
    const agents = await context.Agent.getWhere({ registeredAt: { _gt: 0 } });
    for (const a of agents) {
      context.AgentSnapshot.set({
        id: `${context.chain.id}_${a.id}_${hourStart}`,
        agent: a.id,
        timestamp: hourStart,
        sharePrice: a.sharePrice,
        totalAssets: a.totalAssets,
        subscriberCount: a.subscriberCount,
      });
    }
  },
);
