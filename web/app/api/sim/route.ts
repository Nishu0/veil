import { NextResponse } from "next/server";
import { BaseError, ContractFunctionRevertedError, parseUnits } from "viem";
import { deployer, serial, errorMessage } from "@/lib/server/veil";

const FRIENDLY: Record<string, string> = {
  OracleFrozen: "The equity oracle is paused for the weekend; the mark price cannot update.",
  NotLiquidatable: "Position is healthy: equity is above maintenance margin, so it cannot be liquidated.",
  InsufficientMargin: "Margin is too small for that size (max 25x).",
  InsufficientBalance: "Not enough free collateral in the vault subaccount.",
  ReduceExceedsPosition: "That is more than the open position.",
};
function revertName(e: unknown): string | null {
  if (!(e instanceof BaseError)) return null;
  const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
  const name = r?.data?.errorName;
  return name ? `${name}: ${FRIENDLY[name] ?? "the contract reverted."}` : null;
}

/**
 * Market simulator (owner-only mock controls):
 *  { action: "session", value: 0|1|2 }   0 Open, 1 Friday pre-close, 2 Weekend (oracle frozen)
 *  { action: "price", value: "312.5" }    set the TSLA mark (fails while frozen)
 *  { action: "gap", pct: 12 }             Monday open: unfreeze and move the mark by pct %
 *  { action: "yield", days: 30 }          accrue T-bill yield
 *  { action: "liquidate" }                try to liquidate the vault position (anyone may)
 * Vault operator (owner) actions, the manual alternative to the agent:
 *  { action: "order", side, quantity, margin }   VeilVault.placeOrder at the mark with a 1% slippage bound
 *  { action: "grantMandate", limit, days }       VeilVault.grantMandate(agent, limit USDT, days)
 *  { action: "revokeMandate" }                   VeilVault.revokeMandate()
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const d = deployer();
    const market = d.deployment.marketID;
    const send = async (address: `0x${string}`, abi: unknown, functionName: string, args: unknown[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { request } = await d.pub.simulateContract({ address, abi, functionName, args, account: d.account } as any);
      const hash = await d.wallet.writeContract(request);
      await d.pub.waitForTransactionReceipt({ hash });
      return hash;
    };
    const txs = await serial(async () => {
      const out: string[] = [];
      const oracle = d.a("oracle");
      switch (body.action) {
        case "session":
          out.push(await send(oracle, d.abis.MockOracle, "setSession", [Number(body.value)]));
          break;
        case "price":
          out.push(await send(oracle, d.abis.MockOracle, "setPrice", [market, parseUnits(String(body.value), 18)]));
          break;
        case "gap": {
          const mark = (await d.pub.readContract({ address: oracle, abi: d.abis.MockOracle, functionName: "price", args: [market] })) as bigint;
          const next = (mark * BigInt(Math.round((100 + Number(body.pct)) * 100))) / 10000n;
          out.push(await send(oracle, d.abis.MockOracle, "setSession", [0]));
          out.push(await send(oracle, d.abis.MockOracle, "setPrice", [market, next]));
          break;
        }
        case "yield":
          out.push(await send(d.a("tbill"), d.abis.MockTBill, "simulateYield", [BigInt(body.days)]));
          break;
        case "liquidate":
          out.push(await send(d.a("exchange"), d.abis.MockExchange, "liquidate", [d.deployment.subaccountID, market]));
          break;
        case "order": {
          const mark = (await d.pub.readContract({ address: oracle, abi: d.abis.MockOracle, functionName: "price", args: [market] })) as bigint;
          const isBuy = body.side === "buy";
          const limit = isBuy ? (mark * 101n) / 100n : (mark * 99n) / 100n;
          out.push(await send(d.a("vault"), d.abis.VeilVault, "placeOrder", [isBuy, parseUnits(String(body.quantity), 18), limit, parseUnits(String(body.margin || "0"), 18)]));
          break;
        }
        case "grantMandate":
          out.push(await send(d.a("vault"), d.abis.VeilVault, "grantMandate", [d.a("agent"), parseUnits(String(body.limit), 6), BigInt(Math.round(Number(body.days) * 86400))]));
          break;
        case "revokeMandate":
          out.push(await send(d.a("vault"), d.abis.VeilVault, "revokeMandate", []));
          break;
        default:
          throw new Error("unknown action");
      }
      return out;
    });
    return NextResponse.json({ txs });
  } catch (e) {
    return NextResponse.json({ error: revertName(e) ?? errorMessage(e) }, { status: 400 });
  }
}
