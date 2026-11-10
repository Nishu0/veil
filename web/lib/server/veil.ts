// Server-only helpers: env, deployment, deployer wallet. Never import from client components.
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = path.join(process.cwd(), "..");

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function serverConfig() {
  const env = loadEnv();
  const testnet = env.VEIL_NETWORK === "testnet";
  const chainId = testnet ? 1439 : 31337;
  const rpcUrl = testnet ? env.TESTNET_RPC_URL : env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
  const shared = JSON.parse(readFileSync(path.join(ROOT, "shared/contracts.json"), "utf8"));
  const deployment = shared.deployments[String(chainId)];
  if (!deployment) throw new Error(`VEIL is not deployed on chain ${chainId} yet`);
  return {
    env,
    chainId,
    rpcUrl,
    networkName: testnet ? "Injective EVM Testnet" : "Local devnet (anvil)",
    explorerUrl: testnet ? "https://testnet.blockscout.injective.network" : null,
    // In production the agent sits behind the reverse proxy (AGENT_PUBLIC_URL=/agent).
    agentUrl: env.AGENT_PUBLIC_URL || `http://localhost:${env.AGENT_PORT || 8787}`,
    deployment: deployment as Record<string, string>,
    abis: shared.abis as Record<string, Abi>,
  };
}

export function deployer() {
  const c = serverConfig();
  const chain = defineChain({
    id: c.chainId,
    name: c.networkName,
    nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
    rpcUrls: { default: { http: [c.rpcUrl] } },
  });
  const account = privateKeyToAccount(c.env.DEPLOYER_PRIVATE_KEY as Hex);
  return {
    ...c,
    account,
    pub: createPublicClient({ chain, transport: http(c.rpcUrl) }),
    wallet: createWalletClient({ chain, transport: http(c.rpcUrl), account }),
    a: (k: string) => c.deployment[k] as Address,
  };
}

// The deployer key signs faucet + simulator txs; run them one at a time so nonces never collide.
let queue: Promise<unknown> = Promise.resolve();
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

export function errorMessage(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string };
  return err.shortMessage || err.message || String(e);
}
