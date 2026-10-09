import { createTestIndexer } from "envio";
import { describe, expect, it, test } from "vitest";
import { SEED_HOLDER, ZERO_ADDRESS, addMarket, applyDeposit, applyFlow, applyRedeem, applySwap, applyYield, bumpHour, shareBalance, subscriberDelta, type CostBasis } from "../src/handlers/derived";

// Keep token-metadata lookups off the network: the simulated market address
// does not exist, and a real RPC call would make these tests slow and flaky.
process.env.RPC_URL_10143 = "http://127.0.0.1:1";
process.env.RPC_URL_143 = "http://127.0.0.1:1";

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
    expect([agent.totalAssets, agent.baseBalance, agent.baseCostBasis]).toEqual([1_100_000_000n, 50n * ONE, 100_000_000n]);
    expect(agent.status).toBe(1); // resumed after the breaker set 2
    expect(agent.breakerCount).toBe(1);

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

describe("pure derived helpers", () => {
  const zero: CostBasis = { realizedPnl: 0n, closedCount: 0, winCount: 0, baseBalance: 0n, baseCostBasis: 0n, baseTimeCost: 0n, holdSecondsTotal: 0n };

  it("tracks weighted-average cost basis over buy, partial sell, losing sell", () => {
    let s = applySwap(zero, true, 100n, 1000n, 0)!;
    s = applySwap(s, true, 100n, 1400n, 0)!; // balance 200, cost 2400
    expect([s.baseBalance, s.baseCostBasis]).toEqual([200n, 2400n]);

    s = applySwap(s, false, 50n, 900n, 0)!; // cost 600, pnl +300
    expect(s).toMatchObject({ realizedPnl: 300n, closedCount: 1, winCount: 1, baseBalance: 150n, baseCostBasis: 1800n });

    s = applySwap(s, false, 150n, 1000n, 0)!; // cost 1800, pnl -800
    expect(s).toMatchObject({ realizedPnl: -500n, closedCount: 2, winCount: 1, baseBalance: 0n, baseCostBasis: 0n });
  });

  it("ignores a sell with no tracked balance", () => {
    expect(applySwap(zero, false, 10n, 10n, 0)).toBeUndefined();
  });

  it("accounts hold time from the weighted entry time", () => {
    let s = applySwap(zero, true, 10n, 100n, 1000)!;
    s = applySwap(s, false, 10n, 100n, 1600)!;
    expect([s.holdSecondsTotal, s.baseTimeCost]).toEqual([600n, 0n]);

    // entries at 1000 and 3000 average to 2000; selling half at 2500 holds 500s
    s = applySwap(zero, true, 10n, 100n, 1000)!;
    s = applySwap(s, true, 10n, 100n, 3000)!;
    s = applySwap(s, false, 10n, 100n, 2500)!;
    expect([s.holdSecondsTotal, s.baseTimeCost]).toEqual([500n, 20_000n]);

    // a sell timestamped before the average entry floors at zero
    expect(applySwap(s, false, 10n, 100n, 1500)!.holdSecondsTotal).toBe(500n);
  });

  it("bumpHour returns a fresh 24-slot array with the UTC hour incremented", () => {
    const zeros = new Array(24).fill(0);
    const h = bumpHour(bumpHour(zeros, 3 * 3600 + 5), 27 * 3600);
    expect(h).toHaveLength(24);
    expect(h[3]).toBe(2);
    expect(h.reduce((a, b) => a + b, 0)).toBe(2);
    expect(zeros[3]).toBe(0);
  });

  it("crosses subscriberCount at zero in both directions and ignores address(1)", () => {
    const user = hex("d1", 20);
    expect(subscriberDelta(user, 0n, 5n)).toBe(1);
    expect(subscriberDelta(user, 5n, 7n)).toBe(0);
    expect(subscriberDelta(user, 7n, 0n)).toBe(-1);
    expect(subscriberDelta(SEED_HOLDER, 0n, 5n)).toBe(0);
    expect(subscriberDelta(ZERO_ADDRESS, 0n, 5n)).toBe(0);
  });

  it("accumulates assets in/out and floors totalAssets, yield and shares at zero", () => {
    expect(applyDeposit(applyDeposit(0n, 100n), 50n)).toBe(150n);
    expect(applyRedeem(150n, 40n)).toBe(110n);
    expect(applyRedeem(10n, 40n)).toBe(0n);
    expect(applyYield(applyYield(0n, 80n, true), 30n, false)).toBe(50n);
    expect(applyYield(10n, 30n, false)).toBe(0n);
    expect(shareBalance(5n, -9n)).toBe(0n);
    expect(shareBalance(5n, 3n)).toBe(8n);
  });
});

describe("market flow, markets and lifetime asset counters", () => {
  const VAULT = "0x1111111111111111111111111111111111111111" as const;
  const MARKET_A = hex("44", 20), MARKET_B = hex("55", 20);
  const swap = (block: number, timestamp: number, market: `0x${string}`, isBuy: boolean, quote: bigint) => ({
    contract: "AgentVault" as const,
    event: "SwapExecuted" as const,
    srcAddress: VAULT,
    block: { number: FIRST_BLOCK + block, timestamp },
    params: {
      vault: VAULT, agentId: AGENT_ID, market, isBuy, baseAmount: 10n * ONE, quoteAmount: quote,
      notionalCharged: quote, newTotalAssets: 1_000_000_000n, newSharePrice: ONE,
    },
  });

  it("buckets swaps by hour, tracks distinct markets and never lowers lifetime counters", async () => {
    const ti = createTestIndexer();
    await ti.process({
      chains: {
        10143: {
          simulate: [
            {
              contract: "CustosCore", event: "AgentRegistered", srcAddress: CORE,
              block: { number: FIRST_BLOCK, timestamp: 3600 },
              params: {
                id: AGENT_ID, creator: CREATOR, wallet: hex("a1", 20), vault: VAULT, name: hex("00", 32),
                description: "", allowance: 1n, periodLength: 0n, feeRate: 0n, isPublic: true,
              },
            },
            {
              contract: "AgentVault", event: "SeedDeposited", srcAddress: VAULT,
              block: { number: FIRST_BLOCK, timestamp: 3600 },
              params: { vault: VAULT, creator: CREATOR, assets: 1000n, shares: 1000n, deadAddress: `0x${"00".repeat(19)}01` },
            },
            {
              contract: "AgentVault", event: "SubscriberDeposited", srcAddress: VAULT,
              block: { number: FIRST_BLOCK + 1, timestamp: 3700 },
              params: { vault: VAULT, subscriber: hex("d1", 20), assets: 500n, shares: 500n },
            },
            swap(2, 3800, MARKET_A, true, 100n),
            swap(3, 3900, MARKET_A, true, 50n),
            swap(4, 4000, MARKET_A, false, 30n),
            swap(5, 7300, MARKET_A, true, 7n), // next hour
            swap(6, 7400, MARKET_B, false, 9n),
            {
              contract: "AgentVault", event: "SubscriberRedeemed", srcAddress: VAULT,
              block: { number: FIRST_BLOCK + 7, timestamp: 7500 },
              params: { vault: VAULT, subscriber: hex("d1", 20), assets: 800n, shares: 400n },
            },
            {
              contract: "AgentVault", event: "SubscriberRedeemed", srcAddress: VAULT,
              block: { number: FIRST_BLOCK + 8, timestamp: 7600 },
              params: { vault: VAULT, subscriber: hex("d1", 20), assets: 5000n, shares: 100n }, // over-redeem floors totalAssets only
            },
          ],
        },
      },
    });

    const a = MARKET_A.toLowerCase();
    const first = await ti.MarketFlowBucket.getOrThrow(`10143_${a}_3600`);
    expect([first.buyNotional, first.sellNotional, first.swapCount, first.timestamp]).toEqual([150n, 30n, 3, 3600]);
    const second = await ti.MarketFlowBucket.getOrThrow(`10143_${a}_7200`);
    expect([second.buyNotional, second.sellNotional, second.swapCount]).toEqual([7n, 0n, 1]);
    expect((await ti.MarketFlowBucket.getOrThrow(`10143_${MARKET_B.toLowerCase()}_7200`)).sellNotional).toBe(9n);

    const agent = await ti.Agent.getOrThrow(AGENT_ID.toLowerCase());
    expect(agent.markets).toEqual([a, MARKET_B.toLowerCase()]);
    expect([agent.assetsInTotal, agent.assetsOutTotal]).toEqual([1500n, 5800n]);
  });

  it("tracks buyCount, maxNotional and tradeHours even for an untracked sell", async () => {
    const ti = createTestIndexer();
    await ti.process({
      chains: {
        10143: {
          simulate: [
            {
              contract: "CustosCore", event: "AgentRegistered", srcAddress: CORE,
              block: { number: FIRST_BLOCK, timestamp: 100 },
              params: {
                id: AGENT_ID, creator: CREATOR, wallet: hex("a1", 20), vault: VAULT, name: hex("00", 32),
                description: "", allowance: 1n, periodLength: 0n, feeRate: 0n, isPublic: true,
              },
            },
            swap(1, 5 * 3600 + 10, MARKET_A, false, 900n), // sell with no base balance
            swap(2, 5 * 3600 + 20, MARKET_A, true, 100n),
            swap(3, 29 * 3600, MARKET_A, true, 300n), // next day, same hour slot
            swap(4, 41 * 3600, MARKET_A, false, 50n), // avg entry 17h+10s
          ],
        },
      },
    });
    const agent = await ti.Agent.getOrThrow(AGENT_ID.toLowerCase());
    expect([agent.swapCount, agent.buyCount, agent.maxNotional]).toEqual([4, 2, 900n]);
    expect(agent.tradeHours).toHaveLength(24);
    expect(agent.tradeHours[5]).toBe(3);
    expect(agent.tradeHours[17]).toBe(1);
    expect(agent.holdSecondsTotal).toBe(24n * 3600n - 10n);
    expect(agent.closedCount).toBe(1);
  });

  it("addMarket and applyFlow are pure and idempotent on repeats", () => {
    expect(addMarket([], "0xAB")).toEqual(["0xab"]);
    expect(addMarket(["0xab"], "0xAB")).toEqual(["0xab"]);
    const b = applyFlow(undefined, "id", "0xAB", 3601, false, 5n);
    expect(b).toMatchObject({ market: "0xab", timestamp: 3600, buyNotional: 0n, sellNotional: 5n, swapCount: 1 });
  });

  it("YieldSource follows allow, revoke and re-allow on one row", async () => {
    const ti = createTestIndexer();
    const YS = "0xAbCdEf0000000000000000000000000000000001" as const;
    const change = (n: number, ts: number, allowed: boolean) => ({
      contract: "CustosCore" as const, event: "YieldSourceAllowedChanged" as const, srcAddress: CORE,
      block: { number: FIRST_BLOCK + n, timestamp: ts },
      params: { yieldSource: YS, allowed },
    });
    const run = (n: number, ts: number, allowed: boolean) =>
      ti.process({ chains: { 10143: { simulate: [change(n, ts, allowed)] } } });
    const id = YS.toLowerCase();

    await run(0, 100, true);
    expect(await ti.YieldSource.getOrThrow(id)).toMatchObject({ allowed: true, updatedAt: 100 });
    await run(1, 200, false);
    expect(await ti.YieldSource.getOrThrow(id)).toMatchObject({ allowed: false, updatedAt: 200 });
    await run(2, 300, true);
    expect(await ti.YieldSource.getOrThrow(id)).toMatchObject({ allowed: true, updatedAt: 300 });
    expect(await ti.YieldSource.getAll()).toHaveLength(1);
  });
});
