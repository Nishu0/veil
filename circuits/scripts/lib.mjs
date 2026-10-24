// Shared credential helpers (issuer side + prover side) for scripts and tests.
import { buildEddsa, buildPoseidon } from "circomlibjs";
import { createHash } from "node:crypto";
import * as snarkjs from "snarkjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const WASM = path.join(here, "../build/credential_js/credential.wasm");
export const ZKEY = path.join(here, "../build/credential.zkey");
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const BLOCKED = [408n, 364n, 760n]; // KP, IR, SY

let _eddsa, _poseidon;
export async function crypto() {
  _eddsa ??= await buildEddsa();
  _poseidon ??= await buildPoseidon();
  const F = _poseidon.F;
  const H = (xs) => F.toObject(_poseidon(xs));
  return { eddsa: _eddsa, F, H };
}

export const nameToField = (name) =>
  BigInt("0x" + createHash("sha256").update(name.trim().toLowerCase()).digest("hex")) % FIELD;

export async function issuerPubKey(prvHex) {
  const { eddsa, F } = await crypto();
  const [ax, ay] = eddsa.prv2pub(Buffer.from(prvHex.replace(/^0x/, ""), "hex"));
  return [F.toObject(ax), F.toObject(ay)];
}

/** Issuer: sign a credential. It sees the secret *commitment*, never the secret. */
export async function issueCredential(prvHex, { secretCommit, name, kyc, jurisdiction, accredited, expiry }) {
  const { eddsa, F, H } = await crypto();
  const nameHash = nameToField(name);
  const msg = H([secretCommit, nameHash, kyc, jurisdiction, accredited, expiry]);
  const sig = eddsa.signPoseidon(Buffer.from(prvHex.replace(/^0x/, ""), "hex"), F.e(msg));
  return {
    nameHash, kyc, jurisdiction, accredited, expiry,
    sigR8x: F.toObject(sig.R8[0]), sigR8y: F.toObject(sig.R8[1]), sigS: sig.S,
  };
}

/** Holder: prove the credential for `wallet`. Returns calldata for registry.register. */
export async function prove({ secret, cred, issuer, wallet }) {
  const { H } = await crypto();
  const nullifier = H([secret, 1n]);
  const input = {
    issuerAx: issuer[0], issuerAy: issuer[1], wallet: BigInt(wallet), nullifier, expiry: cred.expiry, blocked: BLOCKED,
    secret, nameHash: cred.nameHash, kyc: cred.kyc, jurisdiction: cred.jurisdiction, accredited: cred.accredited,
    sigR8x: cred.sigR8x, sigR8y: cred.sigR8y, sigS: cred.sigS,
  };
  const str = JSON.parse(JSON.stringify(input, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(str, WASM, ZKEY);
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
    c: [proof.pi_c[0], proof.pi_c[1]],
    nullifier: nullifier.toString(), expiry: cred.expiry.toString(), publicSignals,
  };
}
