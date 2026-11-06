import { NextResponse } from "next/server";
import { serverConfig, errorMessage } from "@/lib/server/veil";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const c = serverConfig();
    return NextResponse.json({
      chainId: c.chainId,
      networkName: c.networkName,
      rpcUrl: c.rpcUrl,
      explorerUrl: c.explorerUrl,
      agentUrl: c.agentUrl,
      addresses: c.deployment,
      abis: c.abis,
      issuer: { ax: c.env.ISSUER_AX, ay: c.env.ISSUER_AY },
      blockedJurisdictions: ["408", "364", "760"],
    });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
