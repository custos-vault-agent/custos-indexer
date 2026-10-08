# custos-indexer

Envio indexer for the Custos contracts and NanSigil on Monad. It reads their events, stores them in Postgres, and serves them through Hasura GraphQL. The marketplace frontend (`custos-web`) is the reader.

## Commands

This project uses npm. Do not use pnpm: the lockfile is `package-lock.json`, and the Dockerfile runs `npm ci`.

```bash
npm install
npm run codegen   # regenerate types from config.yaml, schema.graphql and abis/
npm run dev       # local run with the Envio dev tooling
npm run start     # what the container runs
npm test
```

`npm test` reports one failure. `src/indexer.test.ts` holds a scaffold test left over from `envio init`, and it does not test the handlers.

## Chains

| Chain | Id | Start block | CustosCore | NanSigil |
|---|---|---|---|---|
| Monad mainnet | 143 | 107876400 | `0x8809926996F45505F17599fda8299d86bA3586af` | `0x1421E6Acc7C7b3199077CD3b2A7d2A33778dfe9D` |
| Monad testnet | 10143 | 69086038 | `0xd39e810EAE02E8247ec9308c936c5077dBAe2c46` | `0xfF86D1b2fd3edaD27B361A9d004f3b6facb43621` |

An `AgentVault` has no fixed address. The contract `CustosCore` deploys one per agent, and the indexer registers each vault from the `AgentRegistered` event (see `src/handlers/CustosCore.ts`).

CAUTION: CHANGING THE ADDRESSES OR THE START BLOCK OF A CHAIN IN `config.yaml` IS INCOMPATIBLE WITH AN EXISTING DATABASE. ENVIO COMPARES THE STORED CONFIG WHEN IT RESUMES AND REFUSES TO START. THERE ARE THREE WAYS OUT: REVERT THE CHANGE, RUN `envio start -r` TO DELETE ALL INDEXED DATA AND START OVER, OR RUN A SECOND INDEXER NEXT TO THE FIRST ONE WITH `ENVIO_PG_SCHEMA` AND `ENVIO_INDEXER_PORT` SET. WITH DOCKER, THE START-OVER PATH IS `docker compose down -v` AND THEN `docker compose up -d --build`. THE `-v` FLAG DELETES THE POSTGRES VOLUME.

## Schema

`schema.graphql` has two kinds of entity.

Raw entities, one per event, are the audit log:

| Contract | Events |
|---|---|
| `CustosCore` | `AgentAllowanceChanged`, `AgentPeriodChanged`, `AgentPublicChanged`, `AgentRegistered`, `AgentStatusChanged`, `Initialized`, `MarketAdapterChanged`, `MarketAllowedChanged`, `MinSeedChanged`, `PausedChanged`, `Upgraded` |
| `NanSigil` | `AttestorChanged`, `AttestationSubmitted`, `Upgraded` |
| `AgentVault` | `SwapExecuted`, `SubscriberDeposited`, `SubscriberRedeemed`, `SeedDeposited`, `FeeMinted`, `CircuitBreakerTriggered`, `Transfer` |

Each raw entity is named `Contract_Event`, for example `AgentVault_SwapExecuted`.

Derived entities are what the marketplace reads:

| Entity | Content |
|---|---|
| `Agent` | One row per agent: creator, vault, fee rate, status, last share price, swap count, volume, and the latest NanSigil attestation of the creator wallet |
| `SharePricePoint` | One row per event that reports a share price, for the price history |
| `VaultRef` | Maps a vault address to its agent, because vault events carry only the vault address |

## ABIs

The files in `abis/` come from `make abi` in the contract repos. `config.yaml` reads the event signatures from them, so `npm run codegen` fails when a signature drifts from the contract. Regenerate the ABI, copy it here, and run codegen again.

## Docker

`docker-compose.yml` runs Postgres, Hasura, and the indexer. Fill `.env` from `.env.example` first. The compose file requires `ENVIO_PG_PASSWORD` and `HASURA_GRAPHQL_ADMIN_SECRET`.
