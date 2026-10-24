// Creates ../.env with fresh demo keys (deployer, agent, credential issuer) if it does not exist.
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { issuerPubKey } from "./lib.mjs";

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(envPath)) { console.log(".env already exists, leaving it alone"); process.exit(0); }
const key = () => "0x" + randomBytes(32).toString("hex");
const addr = (k) => execSync(`cast wallet address ${k}`).toString().trim();
const deployer = key(), agent = key(), issuer = key();
const [ax, ay] = await issuerPubKey(issuer);
writeFileSync(envPath, `# VEIL demo keys. Generated locally, never commit this file.
DEPLOYER_PRIVATE_KEY=${deployer}
DEPLOYER_ADDRESS=${addr(deployer)}
AGENT_PRIVATE_KEY=${agent}
AGENT_ADDRESS=${addr(agent)}
ISSUER_PRIVATE_KEY=${issuer}
ISSUER_AX=${ax}
ISSUER_AY=${ay}

# local | testnet
VEIL_NETWORK=local
LOCAL_RPC_URL=http://127.0.0.1:8545
TESTNET_RPC_URL=https://k8s.testnet.json-rpc.injective.network/

# LLM used by the risk agent, called through the opencode CLI (\`opencode run -m <model>\`).
# After \`opencode auth login\` with your OpenCode Go plan, set this to the Go DeepSeek model id
# shown by \`opencode models\`.
VEIL_LLM_MODEL=opencode/deepseek-v4.1-flash-free
`, { mode: 0o600 });
console.log("wrote .env  deployer:", addr(deployer), " agent:", addr(agent));
process.exit(0);
