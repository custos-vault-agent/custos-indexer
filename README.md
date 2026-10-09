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
| `CustosCore` | `AgentAllowanceChanged`, `AgentMarketChanged`, `AgentPeriodChanged`, `AgentPublicChanged`, `AgentRegistered`, `AgentStatusChanged`, `CuratedMarketChanged`, `Initialized`, `MarketAdapterChanged`, `MinSeedChanged`, `PausedChanged`, `Upgraded`, `YieldSourceAllowedChanged` |
| `NanSigil` | `AttestorChanged`, `AttestationSubmitted`, `Upgraded` |
| `AgentVault` | `SwapExecuted`, `SubscriberDeposited`, `SubscriberRedeemed`, `SeedDeposited`, `FeeMinted`, `CircuitBreakerTriggered`, `Transfer`, `YieldPushed`, `YieldPulled` |

Each raw entity is named `Contract_Event`, for example `AgentVault_SwapExecuted`.

Derived entities are what the marketplace reads:

| Entity | Content |
|---|---|
| `Agent` | One row per agent: creator, vault, fee rate, status, last share price, swap count, volume, total assets, subscriber count, idle USDC in the yield source, realized P/L with closed and winning trade counts, base-token balance and cost basis, lifetime assets in and out of the vault (for the dollar-weighted return), the markets it has traded, buy count, largest swap, swaps by UTC hour, hold-time totals, circuit breaker trips, and the latest NanSigil attestation of the creator wallet |
| `SharePricePoint` | One row per event that reports a share price, for the price history |
| `VaultPosition` | One row per vault and holder: share balance from the vault's ERC-20 `Transfer` events, and the assets deposited and redeemed |
| `Market` | One row per market the vaults swapped on: base token address, symbol and decimals |
| `AgentSnapshot` | One row per agent per hour: share price, total assets, subscriber count |
| `MarketFlowBucket` | One row per market per hour: USDC bought, USDC sold and swap count across all agents. Readers sum buckets for 24h and 7d windows |
| `YieldSource` | One row per yield source address, last write wins: whether `CustosCore` currently allows it. The on-chain mapping cannot be enumerated, so this replay of `YieldSourceAllowedChanged` is the list |
| `VaultRef` | Maps a vault address to its agent, because vault events carry only the vault address |

## Block handler, effects and RPC

`src/handlers/snapshot.ts` registers the block handler `agentSnapshot`. It runs every 7200 blocks, which is one hour at an assumed 0.5 s block time (Monad targets about 0.4 s, so it fires at least once per hour), and writes one `AgentSnapshot` per agent for the hour the block falls in. Snapshots carry forward the last event-derived values. Interest that idle yield earns between events is not visible until the next swap or deposit, because reading `totalAssets()` for old blocks needs an archive RPC.

`src/handlers/effects.ts` holds the Envio effects that read the chain: `tokenMeta` (symbol and decimals, falls back to `?` and 18 on failure), `marketBase` (the `baseToken()` of a market) and `blockTimestamp` (the block argument of the block handler has no timestamp). Set these variables in `.env` to use your own endpoints. They are optional, and only these effects use them:

| Variable | Default |
|---|---|
| `RPC_URL_143` | `https://rpc.monad.xyz` |
| `RPC_URL_10143` | `https://testnet-rpc.monad.xyz` |

A schema change needs a database reset. See the caution above.

## ABIs

The files in `abis/` come from `make abi` in the contract repos. `config.yaml` reads the event signatures from them, so `npm run codegen` fails when a signature drifts from the contract. Regenerate the ABI, copy it here, and run codegen again.

## Docker

`docker-compose.yml` runs Postgres, Hasura, and the indexer. Fill `.env` from `.env.example` first. The compose file requires `ENVIO_PG_PASSWORD` and `HASURA_GRAPHQL_ADMIN_SECRET`.
