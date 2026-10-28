// Writes a real proof for the Foundry tests: contracts/test/fixtures/proof.json
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crypto, issuerPubKey, issueCredential, prove } from "./lib.mjs";

const ISSUER = "0x" + "11".repeat(32); // test-only key
const WALLET = "0x00000000000000000000000000000000000A11CE";
const { H } = await crypto();
const secret = 123456789n;
const issuer = await issuerPubKey(ISSUER);
const base = { secretCommit: H([secret]), name: "nisarg", kyc: 1n, accredited: 1n, expiry: 4102444800n };

const cred = await issueCredential(ISSUER, { ...base, jurisdiction: 356n });
const p = await prove({ secret, cred, issuer, wallet: WALLET });
// second holder, for transfer tests
const WALLET2 = "0x00000000000000000000000000000000000CA401";
const secret2 = 987654321n;
const cred2 = await issueCredential(ISSUER, { ...base, secretCommit: H([secret2]), name: "carol", jurisdiction: 702n });
const p2 = await prove({ secret: secret2, cred: cred2, issuer, wallet: WALLET2 });

// a credential from a blocked jurisdiction must be unprovable
let blockedRejected = false;
try {
  await prove({ secret, cred: await issueCredential(ISSUER, { ...base, jurisdiction: 408n }), issuer, wallet: WALLET });
} catch { blockedRejected = true; }
if (!blockedRejected) throw new Error("blocked jurisdiction produced a proof");

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../contracts/test/fixtures/proof.json");
writeFileSync(out, JSON.stringify({
  wallet: WALLET, issuerAx: issuer[0].toString(), issuerAy: issuer[1].toString(),
  a: p.a, b: p.b, c: p.c, nullifier: p.nullifier, expiry: p.expiry,
  wallet2: WALLET2, a2: p2.a, b2: p2.b, c2: p2.c, nullifier2: p2.nullifier,
}, null, 2));
console.log("fixture written; blocked-jurisdiction proof correctly failed");
process.exit(0);
