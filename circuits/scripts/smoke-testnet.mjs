// Testnet smoke test: fund a throwaway wallet, issue a credential, prove it, register it on-chain.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crypto, issuerPubKey, issueCredential, prove } from "./lib.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = Object.fromEntries(readFileSync(path.join(root, ".env"), "utf8").split("\n").filter((l) => /^[A-Z_0-9]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const d = JSON.parse(readFileSync(path.join(root, "contracts/deployments/1439.json"), "utf8"));
const rpc = env.TESTNET_RPC_URL;
const sh = (c) => execSync(c, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const pk = "0x" + randomBytes(32).toString("hex");
const user = sh(`cast wallet address ${pk}`);
sh(`cast send ${user} --value 0.02ether --private-key ${env.DEPLOYER_PRIVATE_KEY} -r ${rpc}`);
const { H } = await crypto();
const secret = BigInt("0x" + randomBytes(31).toString("hex"));
const issuer = await issuerPubKey(env.ISSUER_PRIVATE_KEY);
const expiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
const cred = await issueCredential(env.ISSUER_PRIVATE_KEY, { secretCommit: H([secret]), name: "smoke test", kyc: 1n, jurisdiction: 702n, accredited: 1n, expiry });
const p = await prove({ secret, cred, issuer, wallet: user });
const out = JSON.parse(sh(`cast send ${d.registry} "register(uint256[2],uint256[2][2],uint256[2],uint256,uint64)" "[${p.a}]" "[[${p.b[0]}],[${p.b[1]}]]" "[${p.c}]" ${p.nullifier} ${p.expiry} --private-key ${pk} -r ${rpc} --json`));
console.log("wallet:", user);
console.log("register tx:", out.transactionHash, "status", out.status, "gasUsed", parseInt(out.gasUsed, 16));
console.log("isVerified:", sh(`cast call ${d.registry} "isVerified(address)(bool)" ${user} -r ${rpc}`));
process.exit(0);
