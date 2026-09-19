import { createTestIndexer } from "envio";
import { describe, expect, it } from "vitest";

const CORE = "0xCfBbd07b107A6cb7e685e555E4C9ef956d11a0bB";
const VAULT = "0x1111111111111111111111111111111111111111";
const AGENT_ID = "0x" + "ab".repeat(32);
const ONE = 10n ** 18n;
const hex = (byte: string, n: number) => `0x${byte.repeat(n)}` as const;
const CREATOR = hex("c1", 20);

describe("derived Agent / SharePricePoint", () => {
  it("builds one Agent row and a price series from the raw events", async () => {
    const ti = createTestIndexer();
    await ti.process({
      chains: {
        10143: {
          simulate: [
            {
              contract: "CustosCore",
              event: "AgentRegistered",
              srcAddress: CORE,
              block: { number: 1, timestamp: 1000 },
              params: {
                id: AGENT_ID,
                creator: CREATOR,
                wallet: hex("a1", 20),
                vault: VAULT,
                name: hex("00", 32),
                description: "grid bot",
                allowance: 4_000_000_000n,
                periodLength: 86_400n,
                feeRate: 1000n,
                isPublic: true,
              },
            },
            {
              contract: "AgentVault",
              event: "SeedDeposited",
              srcAddress: VAULT,
              block: { number: 1, timestamp: 1000 },
              params: { vault: VAULT, creator: CREATOR, assets: 1_000_000_000n, shares: 1_000_000_000n, deadAddress: `0x${"00".repeat(19)}01` },
            },
            {
              contract: "AgentVault",
              event: "SwapExecuted",
              srcAddress: VAULT,
              block: { number: 2, timestamp: 2000 },
              params: {
                vault: VAULT,
                agentId: AGENT_ID,
                market: hex("44", 20),
                isBuy: true,
                baseAmount: 50n * ONE,
                quoteAmount: 100_000_000n,
                notionalCharged: 100_000_000n,
                newTotalAssets: 1_100_000_000n,
                newSharePrice: (ONE * 11n) / 10n,
              },
            },
            {
              contract: "AgentVault",
              event: "CircuitBreakerTriggered",
              srcAddress: VAULT,
              block: { number: 3, timestamp: 3000 },
              params: { vault: VAULT, currentSharePrice: (ONE * 8n) / 10n, highWaterMark: (ONE * 11n) / 10n, maxDrawdownBps: 2000n },
            },
            {
              contract: "CustosCore",
              event: "AgentStatusChanged",
              srcAddress: CORE,
              block: { number: 4, timestamp: 4000 },
              params: { id: AGENT_ID, oldStatus: 2n, newStatus: 1n },
            },
          ],
        },
      },
    });

    const agent = await ti.Agent.getOrThrow(AGENT_ID.toLowerCase());
    expect(agent.description).toBe("grid bot");
    expect(agent.vault).toBe(VAULT);
    expect(agent.swapCount).toBe(1);
    expect(agent.volume).toBe(100_000_000n);
    expect(agent.sharePrice).toBe((ONE * 8n) / 10n); // last observation = breaker
    expect(agent.status).toBe(1); // resumed after the breaker set 2

    const points = (await ti.SharePricePoint.getWhere({ agent: { _eq: AGENT_ID.toLowerCase() } }))
      .sort((a, b) => a.timestamp - b.timestamp);
    expect(points.map((p) => p.source)).toEqual(["seed", "swap", "breaker"]);
    expect(points.map((p) => p.sharePrice)).toEqual([ONE, (ONE * 11n) / 10n, (ONE * 8n) / 10n]);
  });
});
