import { indexer } from "envio";
import type { NanSigil_AttestationSubmitted, NanSigil_AttestorChanged, NanSigil_Upgraded } from "envio";

indexer.onEvent({ contract: "NanSigil", event: "AttestorChanged" }, async ({ event, context }) => {
  const entity: NanSigil_AttestorChanged = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    oldAttestor: event.params.oldAttestor,
    newAttestor: event.params.newAttestor,
  };
  context.NanSigil_AttestorChanged.set(entity);
});

indexer.onEvent({ contract: "NanSigil", event: "AttestationSubmitted" }, async ({ event, context }) => {
  const entity: NanSigil_AttestationSubmitted = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    wallet: event.params.wallet,
    label: event.params.label,
    pnl: event.params.pnl,
    winRate: Number(event.params.winRate),
    timestamp: event.params.timestamp,
    attestHash: event.params.attestHash,
  };
  context.NanSigil_AttestationSubmitted.set(entity);

  // An attestation is about a wallet; every agent that wallet created carries it.
  const agents = await context.Agent.getWhere({ creator: { _eq: event.params.wallet } });
  for (const agent of agents) {
    context.Agent.set({
      ...agent,
      nansenLabel: event.params.label,
      nansenPnl: event.params.pnl,
      nansenWinRate: Number(event.params.winRate),
      nansenAttestedAt: Number(event.params.timestamp),
    });
  }
});

indexer.onEvent({ contract: "NanSigil", event: "Upgraded" }, async ({ event, context }) => {
  const entity: NanSigil_Upgraded = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    implementation: event.params.implementation,
  };
  context.NanSigil_Upgraded.set(entity);
});
