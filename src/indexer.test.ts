import { describe, it } from "vitest";
import { createTestIndexer, type CustosCore_AgentAllowanceChanged } from "envio";

describe("CustosCore contract AgentAllowanceChanged event tests", () => {
  it("CustosCore_AgentAllowanceChanged is created correctly", async (t) => {
    const indexer = createTestIndexer();

    // Creating mock for CustosCore contract AgentAllowanceChanged event
    const event = {
      contract: "CustosCore" as const,
      event: "AgentAllowanceChanged" as const,
      params: {
        id: "default string value",
        oldAllowance: 0n,
        newAllowance: 0n,
      },
    };

    await indexer.process({
      chains: {
        10143: {
          simulate: [event],
        },
      },
    });

    // Getting the actual entity from the test indexer
    let actualCustosCoreAgentAllowanceChanged = await indexer.CustosCore_AgentAllowanceChanged.getOrThrow("10143_0_0");

    // Creating the expected entity
    const expectedCustosCoreAgentAllowanceChanged = {
      id: "10143_0_0",
      event_id: event.params.id,
      oldAllowance: event.params.oldAllowance,
      newAllowance: event.params.newAllowance,
      chainId: 10143,
    };
    // Asserting that the entity in the mock database is the same as the expected entity
    t.expect(actualCustosCoreAgentAllowanceChanged, "Actual CustosCoreAgentAllowanceChanged should be the same as the expected CustosCoreAgentAllowanceChanged").toEqual(expectedCustosCoreAgentAllowanceChanged);
  });
});

describe("Indexer smoke test", () => {
  it("processes the first block with events on chain 10143", async (t) => {
    const indexer = createTestIndexer();

    const result = await indexer.process({ chains: { 10143: {} } });

    t.expect(result.changes.length, "Should have at least one change").toBeGreaterThan(0);
    const firstChange = result.changes[0]!;
    t.expect(firstChange.chainId).toBe(10143);
    t.expect(firstChange.eventsProcessed).toBeGreaterThan(0);
  }, 60_000);
});
