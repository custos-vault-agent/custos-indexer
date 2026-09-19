import type { Agent, SharePricePoint, VaultRef } from "envio";

// envio does not export its handler context type; this is the slice we use.
type HandlerContext = {
  VaultRef: { get(id: string): Promise<VaultRef | undefined> };
  Agent: { get(id: string): Promise<Agent | undefined> };
  SharePricePoint: { set(e: SharePricePoint): void };
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
