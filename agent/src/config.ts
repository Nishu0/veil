import { config as dotenv } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv({ path: path.join(ROOT, ".env") });

const network = process.env.VEIL_NETWORK === "testnet" ? "testnet" : "local";
export const chainId = network === "testnet" ? 1439 : 31337;
const rpc = network === "testnet" ? process.env.TESTNET_RPC_URL! : process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545";

const shared = JSON.parse(readFileSync(path.join(ROOT, "shared/contracts.json"), "utf8"));
const dep = shared.deployments[String(chainId)];
if (!dep) throw new Error(`no deployment for chain ${chainId}; run the deploy script first`);

export const addr = dep as Record<"usdt" | "tbill" | "oracle" | "exchange" | "registry" | "vault" | "vrwa" | "agentLog", Address> & {
  marketID: string;
  subaccountID: string;
};
export const abi = shared.abis as Record<"VeilVault" | "MockExchange" | "MockOracle" | "AgentLog", Abi>;

export const chain = defineChain({
  id: chainId,
  name: network === "testnet" ? "Injective EVM Testnet" : "Anvil (local)",
  nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
export const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
export const pub = createPublicClient({ chain, transport: http(rpc) });
export const wallet = createWalletClient({ chain, transport: http(rpc), account });

export const LLM_MODEL = process.env.VEIL_LLM_MODEL ?? "opencode/deepseek-v4.1-flash-free";
export const PORT = Number(process.env.AGENT_PORT ?? 8787);

/** Hard risk limits. The LLM can only choose inside these; code enforces them. */
export const POLICY = {
  weekdayMaxLeverage: 6,
  weekendGapSigma: 0.063, // 1-sigma Fri close -> Mon open move for a high-vol equity (4% daily * sqrt(2.5))
  gapSigmas: 4, // survive an N-sigma gap
  maintenanceMargin: 0.05,
  marginBudget: 0.5, // share of free subaccount collateral put up as initial margin
  minFreeUsdt: 50,
};
/** Highest leverage at which a short still clears maintenance after an N-sigma adverse gap. */
export const gapSafeLeverage = () => 1 / (POLICY.gapSigmas * POLICY.weekendGapSigma + POLICY.maintenanceMargin);
