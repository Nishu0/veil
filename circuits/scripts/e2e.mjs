// End-to-end smoke test against the running local chain: credential -> ZK proof -> register -> deposit.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crypto, issuerPubKey, issueCredential, prove } from "./lib.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = Object.fromEntries(readFileSync(path.join(root, ".env"), "utf8").split("\n").filter((l) => /^[A-Z_0-9]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const d = JSON.parse(readFileSync(path.join(root, "contracts/deployments/31337.json"), "utf8"));
const rpc = env.LOCAL_RPC_URL;
const sh = (c) => execSync(c, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const USER_PK = "0x" + "a1".repeat(32);
const user = sh(`cast wallet address ${USER_PK}`);
const sendAs = (pk, to, sig, ...args) => sh(`cast send ${to} "${sig}" ${args.join(" ")} --private-key ${pk} -r ${rpc} --json`);

sh(`cast rpc anvil_setBalance ${user} 0x56BC75E2D63100000 -r ${rpc}`);
sendAs(env.DEPLOYER_PRIVATE_KEY, d.usdt, "mint(address,uint256)", user, "10000000000");

const { H } = await crypto();
const secret = BigInt(Date.now());
const issuer = await issuerPubKey(env.ISSUER_PRIVATE_KEY);
const expiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
const cred = await issueCredential(env.ISSUER_PRIVATE_KEY, { secretCommit: H([secret]), name: "nisarg", kyc: 1n, jurisdiction: 356n, accredited: 1n, expiry });
const p = await prove({ secret, cred, issuer, wallet: user });
sendAs(USER_PK, d.registry, "register(uint256[2],uint256[2][2],uint256[2],uint256,uint64)",
  `"[${p.a}]"`, `"[[${p.b[0]}],[${p.b[1]}]]"`, `"[${p.c}]"`, p.nullifier, p.expiry);
console.log("verified on-chain:", sh(`cast call ${d.registry} "isVerified(address)(bool)" ${user} -r ${rpc}`));
sendAs(USER_PK, d.usdt, "approve(address,uint256)", d.vault, "10000000000");
sendAs(USER_PK, d.vault, "deposit(uint256)", "5000000000");
console.log("vRWA balance:", sh(`cast call ${d.vrwa} "balanceOf(address)(uint256)" ${user} -r ${rpc}`));
console.log("vault NAV:", sh(`cast call ${d.vault} "nav()(uint256)" -r ${rpc}`));
process.exit(0);
