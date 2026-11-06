import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { buildEddsa, buildPoseidon } from "circomlibjs";
import { serverConfig, errorMessage } from "@/lib/server/veil";

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * MOCK KYC issuer. A real issuer would check documents; this one approves
 * everyone and signs the attributes it was given. It receives the holder's
 * secret *commitment* only, so it cannot derive the on-chain nullifier and
 * cannot tell which wallet later uses the credential.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const secretCommit = BigInt(body.secretCommit);
    const jurisdiction = BigInt(body.jurisdiction);
    const accredited = body.accredited ? 1n : 0n;
    const kyc = 1n;
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 3600);

    const { env } = serverConfig();
    const [eddsa, poseidon] = await Promise.all([buildEddsa(), buildPoseidon()]);
    const F = poseidon.F;
    const nameHash = BigInt("0x" + createHash("sha256").update(name.toLowerCase()).digest("hex")) % FIELD;
    const msg = poseidon([secretCommit, nameHash, kyc, jurisdiction, accredited, expiry]);
    const sig = eddsa.signPoseidon(Buffer.from(env.ISSUER_PRIVATE_KEY.replace(/^0x/, ""), "hex"), msg);

    return NextResponse.json({
      name,
      nameHash: nameHash.toString(),
      kyc: kyc.toString(),
      jurisdiction: jurisdiction.toString(),
      accredited: accredited.toString(),
      expiry: expiry.toString(),
      sigR8x: F.toObject(sig.R8[0]).toString(),
      sigR8y: F.toObject(sig.R8[1]).toString(),
      sigS: sig.S.toString(),
    });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
