import { S, createEffect } from "envio";
import { createPublicClient, erc20Abi, http, parseAbi } from "viem";

const DEFAULT_URLS: Record<number, string> = {
  143: "https://rpc.monad.xyz",
  10143: "https://testnet-rpc.monad.xyz",
};

// Read at call time, not at import time, so tests can redirect the RPC.
const url = (chainId: number) =>
  process.env[`RPC_URL_${chainId}`] || DEFAULT_URLS[chainId];

const clients = new Map<string, ReturnType<typeof createPublicClient>>();
function client(chainId: number) {
  const u = url(chainId);
  if (!u) throw new Error(`no RPC for chain ${chainId}`);
  let c = clients.get(u);
  if (!c) {
    // Bounded: a hanging RPC must not stall event processing.
    c = createPublicClient({ transport: http(u, { retryCount: 2, timeout: 10_000 }) });
    clients.set(u, c);
  }
  return c;
}

const marketAbi = parseAbi(["function baseToken() view returns (address)"]);

// Failures return "?"/18 (uncached) so a flaky RPC never stops the indexer.
export const tokenMeta = createEffect(
  {
    name: "tokenMeta",
    input: S.string,
    output: { symbol: S.string, decimals: S.number },
    rateLimit: { calls: 10, per: "second" },
    cache: true,
    crossChain: false,
  },
  async ({ input, context }) => {
    try {
      const c = client(context.chain.id);
      const address = input as `0x${string}`;
      const [symbol, decimals] = await Promise.all([
        c.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
        c.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
      ]);
      return { symbol, decimals };
    } catch (err) {
      context.log.warn(`tokenMeta failed for ${input}: ${err}`);
      context.cache = false;
      return { symbol: "?", decimals: 18 };
    }
  },
);

// Empty string means the lookup failed; the caller retries on the next swap.
export const marketBase = createEffect(
  {
    name: "marketBase",
    input: S.string,
    output: S.string,
    rateLimit: { calls: 10, per: "second" },
    cache: true,
    crossChain: false,
  },
  async ({ input, context }) => {
    try {
      return await client(context.chain.id).readContract({
        address: input as `0x${string}`,
        abi: marketAbi,
        functionName: "baseToken",
      });
    } catch (err) {
      context.log.warn(`baseToken failed for ${input}: ${err}`);
      context.cache = false;
      return "";
    }
  },
);

// Block timestamp for onBlock handlers, whose block argument carries only the number.
export const blockTimestamp = createEffect(
  {
    name: "blockTimestamp",
    input: S.number,
    output: S.number,
    rateLimit: { calls: 10, per: "second" },
    cache: true,
    crossChain: false,
  },
  async ({ input, context }) => {
    try {
      const b = await client(context.chain.id).getBlock({ blockNumber: BigInt(input) });
      return Number(b.timestamp);
    } catch (err) {
      context.log.warn(`blockTimestamp failed for ${input}: ${err}`);
      context.cache = false;
      return 0;
    }
  },
);
