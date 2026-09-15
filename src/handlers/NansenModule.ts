/*
 * Please refer to https://docs.envio.dev for a thorough guide on all Envio indexer features
 */
import { indexer } from "envio";
import type {
  NansenModule_AttestorChanged,
  NansenModule_Initialized,
  NansenModule_NansenAttestationSubmitted,
  NansenModule_Upgraded,
} from "envio";

indexer.onEvent({ contract: "NansenModule", event: "AttestorChanged" }, async ({ event, context }) => {
  const entity: NansenModule_AttestorChanged = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    oldAttestor: event.params.oldAttestor,
    newAttestor: event.params.newAttestor,
  };

  context.NansenModule_AttestorChanged.set(entity);
});

indexer.onEvent({ contract: "NansenModule", event: "Initialized" }, async ({ event, context }) => {
  const entity: NansenModule_Initialized = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    version: event.params.version,
  };

  context.NansenModule_Initialized.set(entity);
});

indexer.onEvent({ contract: "NansenModule", event: "NansenAttestationSubmitted" }, async ({ event, context }) => {
  const entity: NansenModule_NansenAttestationSubmitted = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    agentId: event.params.agentId,
    attestHash: event.params.attestHash,
    timestamp: event.params.timestamp,
  };

  context.NansenModule_NansenAttestationSubmitted.set(entity);
});

indexer.onEvent({ contract: "NansenModule", event: "Upgraded" }, async ({ event, context }) => {
  const entity: NansenModule_Upgraded = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    implementation: event.params.implementation,
  };

  context.NansenModule_Upgraded.set(entity);
});
