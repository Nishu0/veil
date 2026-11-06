import { NextResponse } from "next/server";
import { isAddress, parseEther, parseUnits } from "viem";
import { deployer, serial, errorMessage } from "@/lib/server/veil";

/** Demo faucet: tops up gas and mints 10,000 mock USDT to a burner wallet. */
export async function POST(req: Request) {
  try {
    const { address } = await req.json();
    if (!isAddress(address)) return NextResponse.json({ error: "bad address" }, { status: 400 });
    const d = deployer();
    const result = await serial(async () => {
      let gasTx: string | null = null;
      if ((await d.pub.getBalance({ address })) < parseEther("0.02")) {
        gasTx = await d.wallet.sendTransaction({ to: address, value: parseEther("0.05") });
        await d.pub.waitForTransactionReceipt({ hash: gasTx as `0x${string}` });
      }
      const mintTx = await d.wallet.writeContract({
        address: d.a("usdt"), abi: d.abis.MockUSDT, functionName: "mint", args: [address, parseUnits("10000", 6)],
      });
      await d.pub.waitForTransactionReceipt({ hash: mintTx });
      return { gasTx, mintTx };
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
