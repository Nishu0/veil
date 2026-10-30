// Collects ABIs + deployment addresses into shared/contracts.json (read by the agent and the web app).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = ["VeilVault", "VRWA", "ZkComplianceRegistry", "VeilPermissionsHook", "AgentLog", "MockUSDT", "MockTBill", "MockOracle", "MockExchange"];
const abis = Object.fromEntries(names.map((n) => [n, JSON.parse(readFileSync(path.join(root, `contracts/out/${n}.sol/${n}.json`), "utf8")).abi]));
const depDir = path.join(root, "contracts/deployments");
const deployments = {};
if (existsSync(depDir)) for (const f of readdirSync(depDir).filter((f) => f.endsWith(".json"))) deployments[f.replace(".json", "")] = JSON.parse(readFileSync(path.join(depDir, f), "utf8"));
mkdirSync(path.join(root, "shared"), { recursive: true });
writeFileSync(path.join(root, "shared/contracts.json"), JSON.stringify({ abis, deployments }));
console.log("shared/contracts.json updated; networks:", Object.keys(deployments).join(", ") || "none");
