import { NextResponse } from "next/server";
import { isAddress, parseEther, parseUnits } from "viem";
import { deployer, serial, errorMessage } from "@/lib/server/veil";

// The faucet spends the deployer's real testnet INJ on gas top-ups, so it is rationed:
// one top-up per address, a daily cap across all addresses, and a cooldown on USDT mints.
const GAS_TOPUP = parseEther("0.01"); // a proof registration costs about 0.0002 INJ
const GAS_FLOOR = parseEther("0.003");
const RESERVE = parseEther("0.1"); // never drain the deployer below this
const DAILY_TOPUPS = 40;
const MINT_COOLDOWN_MS = 5 * 60_000;

const toppedUp = new Set<string>();
const lastMint = new Map<string, number>();
let day = "", topupsToday = 0;

/** Demo faucet: a little gas (once) and 10,000 mock USDT for a wallet. */
export async function POST(req: Request) {
  try {
    const { address } = await req.json();
    if (!isAddress(address)) return NextResponse.json({ error: "bad address" }, { status: 400 });
    const key = address.toLowerCase();
    const wait = MINT_COOLDOWN_MS - (Date.now() - (lastMint.get(key) ?? 0));
    if (wait > 0) return NextResponse.json({ error: `This wallet used the faucet recently. Try again in ${Math.ceil(wait / 60_000)} min.` }, { status: 429 });

    const d = deployer();
    const local = d.chainId === 31337;
    const result = await serial(async () => {
      const today = new Date().toISOString().slice(0, 10);
      if (today !== day) { day = today; topupsToday = 0; }
      let gasTx: string | null = null, gasNote: string | null = null;
      if ((await d.pub.getBalance({ address })) < GAS_FLOOR) {
        const reserveOk = (await d.pub.getBalance({ address: d.account.address })) > RESERVE;
        if (!local && toppedUp.has(key)) gasNote = "This wallet already received gas from the faucet.";
        else if (!local && topupsToday >= DAILY_TOPUPS) gasNote = "The faucet's daily gas budget is used up. Get testnet INJ from the Injective faucet.";
        else if (!reserveOk) gasNote = "The faucet is out of gas funds. Get testnet INJ from the Injective faucet.";
        else {
          gasTx = await d.wallet.sendTransaction({ to: address, value: local ? parseEther("0.05") : GAS_TOPUP });
          await d.pub.waitForTransactionReceipt({ hash: gasTx as `0x${string}` });
          toppedUp.add(key);
          topupsToday++;
        }
      }
      const mintTx = await d.wallet.writeContract({
        address: d.a("usdt"), abi: d.abis.MockUSDT, functionName: "mint", args: [address, parseUnits("10000", 6)],
      });
      await d.pub.waitForTransactionReceipt({ hash: mintTx });
      lastMint.set(key, Date.now());
      return { gasTx, mintTx, gasNote };
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
