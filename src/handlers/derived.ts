import type { Agent, MarketFlowBucket, SharePricePoint, VaultPosition, VaultRef } from "envio";

// envio does not export its handler context type; this is the slice we use.
type HandlerContext = {
  VaultRef: { get(id: string): Promise<VaultRef | undefined> };
  Agent: { get(id: string): Promise<Agent | undefined> };
  SharePricePoint: { set(e: SharePricePoint): void };
  VaultPosition: { get(id: string): Promise<VaultPosition | undefined>; set(e: VaultPosition): void };
};

export const ONE = 10n ** 18n;

export const agentKey = (agentId: string) => agentId.toLowerCase();
export const vaultKey = (vault: string) => vault.toLowerCase();

export async function agentByVault(context: HandlerContext, vault: string) {
  const ref = await context.VaultRef.get(vaultKey(vault));
  return ref ? context.Agent.get(ref.agent) : undefined;
}

export function recordPrice(
  context: HandlerContext,
  agent: Agent,
  point: Omit<SharePricePoint, "agent">,
): Agent {
  context.SharePricePoint.set({ ...point, agent: agent.id });
  return { ...agent, sharePrice: point.sharePrice, lastPriceAt: point.timestamp };
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const SEED_HOLDER = "0x0000000000000000000000000000000000000001";

const subtractFloor = (a: bigint, b: bigint) => (a > b ? a - b : 0n);

// Burn/mint counterparties and the locked seed are not subscribers.
export const isSubscriber = (holder: string) => {
  const h = holder.toLowerCase();
  return h !== ZERO_ADDRESS && h !== SEED_HOLDER;
};

// Change to subscriberCount when a holder's balance moves from `before` to `after`.
export function subscriberDelta(holder: string, before: bigint, after: bigint): number {
  if (!isSubscriber(holder)) return 0;
  if (before === 0n && after > 0n) return 1;
  if (before > 0n && after === 0n) return -1;
  return 0;
}

export const applyDeposit = (totalAssets: bigint, assets: bigint) => totalAssets + assets;
export const applyRedeem = (totalAssets: bigint, assets: bigint) => subtractFloor(totalAssets, assets);

export const applyYield = (deployed: bigint, amount: bigint, pushed: boolean) =>
  pushed ? deployed + amount : subtractFloor(deployed, amount);

export type CostBasis = {
  realizedPnl: bigint;
  closedCount: number;
  winCount: number;
  baseBalance: bigint;
  baseCostBasis: bigint;
};

// Weighted-average cost basis. A sell with no known balance means earlier
// history was missed; it is left unrecorded.
export function applySwap(s: CostBasis, isBuy: boolean, baseAmount: bigint, quoteAmount: bigint): CostBasis | undefined {
  if (isBuy) {
    return { ...s, baseBalance: s.baseBalance + baseAmount, baseCostBasis: s.baseCostBasis + quoteAmount };
  }
  if (s.baseBalance === 0n) return undefined;
  const cost = (s.baseCostBasis * baseAmount) / s.baseBalance;
  return {
    realizedPnl: s.realizedPnl + quoteAmount - cost,
    closedCount: s.closedCount + 1,
    winCount: s.winCount + (quoteAmount > cost ? 1 : 0),
    baseBalance: subtractFloor(s.baseBalance, baseAmount),
    baseCostBasis: subtractFloor(s.baseCostBasis, cost),
  };
}

export const shareBalance = (shares: bigint, delta: bigint) => (delta < 0n ? subtractFloor(shares, -delta) : shares + delta);

// Loads (or creates) a holder's position and applies `patch` to it.
export async function updatePosition(
  context: HandlerContext,
  agent: Agent,
  holder: string,
  timestamp: number,
  patch: (p: VaultPosition) => Partial<VaultPosition>,
): Promise<{ before: VaultPosition; after: VaultPosition }> {
  const h = holder.toLowerCase();
  const id = `${vaultKey(agent.vault)}_${h}`;
  const before: VaultPosition = (await context.VaultPosition.get(id)) ?? {
    id, vault: vaultKey(agent.vault), agent: agent.id, holder: h,
    shares: 0n, assetsIn: 0n, assetsOut: 0n, firstSeenAt: timestamp, lastActivityAt: timestamp,
  };
  const after = { ...before, ...patch(before), lastActivityAt: timestamp };
  context.VaultPosition.set(after);
  return { before, after };
}

export const hourStart = (timestamp: number) => Math.floor(timestamp / 3600) * 3600;

export const flowBucketId = (chainId: number, market: string, timestamp: number) =>
  `${chainId}_${market.toLowerCase()}_${hourStart(timestamp)}`;

// notionalCharged equals quoteAmount in the contract, so either is the USDC leg.
export function applyFlow(
  prev: MarketFlowBucket | undefined,
  id: string,
  market: string,
  timestamp: number,
  isBuy: boolean,
  quoteAmount: bigint,
): MarketFlowBucket {
  const b = prev ?? { id, market: market.toLowerCase(), timestamp: hourStart(timestamp), buyNotional: 0n, sellNotional: 0n, swapCount: 0 };
  return {
    ...b,
    buyNotional: b.buyNotional + (isBuy ? quoteAmount : 0n),
    sellNotional: b.sellNotional + (isBuy ? 0n : quoteAmount),
    swapCount: b.swapCount + 1,
  };
}

export const addMarket = (markets: readonly string[], market: string): string[] => {
  const m = market.toLowerCase();
  return markets.includes(m) ? [...markets] : [...markets, m];
};
