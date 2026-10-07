import { createTestIndexer } from "envio";
import { describe, expect, it, test } from "vitest";

const CORE = "0xd39e810EAE02E8247ec9308c936c5077dBAe2c46" as const;
const VAULT = "0x1111111111111111111111111111111111111111";
const AGENT_ID = "0x" + "ab".repeat(32);
// Simulated blocks must sit above the chain start_block or simulate drops the event.
const FIRST_BLOCK = 69_086_040;
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
              block: { number: FIRST_BLOCK, timestamp: 1000 },
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
              block: { number: FIRST_BLOCK, timestamp: 1000 },
              params: { vault: VAULT, creator: CREATOR, assets: 1_000_000_000n, shares: 1_000_000_000n, deadAddress: `0x${"00".repeat(19)}01` },
            },
            {
              contract: "AgentVault",
              event: "SwapExecuted",
              srcAddress: VAULT,
              block: { number: FIRST_BLOCK + 1, timestamp: 2000 },
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
              block: { number: FIRST_BLOCK + 2, timestamp: 3000 },
              params: { vault: VAULT, currentSharePrice: (ONE * 8n) / 10n, highWaterMark: (ONE * 11n) / 10n, maxDrawdownBps: 2000n },
            },
            {
              contract: "CustosCore",
              event: "AgentStatusChanged",
              srcAddress: CORE,
              block: { number: FIRST_BLOCK + 3, timestamp: 4000 },
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

describe("NanSigil attestation → Agent", () => {
  const SIGIL = "0xfF86D1b2fd3edaD27B361A9d004f3b6facb43621" as const;
  const CREATOR = hex("c1", 20);
  const register = (id: `0x${string}`, wallet: `0x${string}`, vault: `0x${string}`, block: number) =>
    ({
      contract: "CustosCore" as const,
      event: "AgentRegistered" as const,
      srcAddress: CORE,
      block: { number: FIRST_BLOCK + block - 1, timestamp: block * 1000 },
      params: {
        id, creator: CREATOR, wallet, vault, name: hex("00", 32), description: "",
        allowance: 1n, periodLength: 0n, feeRate: 0n, isPublic: true,
      },
    });

  test("fans out to existing agents and pre-fills later ones", async () => {
    const ti = createTestIndexer();
    const A = hex("aa", 32), B = hex("bb", 32);
    await ti.process({
      chains: {
        10143: {
          simulate: [
            register(A, hex("a1", 20), hex("11", 20), 1),
            {
              contract: "NanSigil",
              event: "AttestationSubmitted",
              srcAddress: SIGIL,
              block: { number: FIRST_BLOCK + 1, timestamp: 2000 },
              params: { wallet: CREATOR, label: "Fund", pnl: 90_000n, winRate: 65n, timestamp: 1999n, attestHash: hex("ff", 32) },
            },
            register(B, hex("b1", 20), hex("12", 20), 3), // same creator, registered after the attestation
          ],
        },
      },
    });
    const a = await ti.Agent.getOrThrow(A.toLowerCase());
    const b = await ti.Agent.getOrThrow(B.toLowerCase());
    expect([a.nansenLabel, a.nansenWinRate, a.nansenAttestedAt]).toEqual(["Fund", 65, 1999]);
    expect([b.nansenLabel, b.nansenPnl]).toEqual(["Fund", 90_000n]);
  });
});
