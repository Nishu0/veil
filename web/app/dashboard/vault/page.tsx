"use client";

import * as React from "react";
import { Activity, Hand, PieChart, ShieldCheck } from "lucide-react";
import { operate } from "@/lib/veil/client";
import { useVeil, useNow } from "@/components/veil/provider";
import { fmtCountdown, fmtLev, fmtQty, fmtSignedUsd, fmtUsd, isPositiveAmount } from "@/components/veil/format";
import { Allocation } from "@/components/veil/allocation";
import { Btn, Card, Empty, Field, Hash, KV, Note, PageIntro, Pill, Seg, useAction, type ActionResult } from "@/components/veil/ui";

function OpNote({ r, ok }: { r: ActionResult<{ txs: string[] }> | null; ok: string }) {
  if (!r) return null;
  return r.kind === "ok" ? <Note tone="ok" title={ok}>Transaction <Hash value={r.value.txs[r.value.txs.length - 1]} /></Note> : <Note tone="err" title="Reverted">{r.message}</Note>;
}

export default function VaultPage() {
  const { state, config } = useVeil();
  const now = useNow();
  const p = state?.position;
  const m = state?.mandate;
  const [side, setSide] = React.useState<"sell" | "buy">("sell");
  const [qty, setQty] = React.useState("2");
  const [margin, setMargin] = React.useState("150");
  const [limit, setLimit] = React.useState("2500");

  const quiet = { quietError: true } as const;
  const order = useAction(() => operate({ action: "order", side, quantity: qty, margin: side === "buy" && p?.open && !p.isLong ? "0" : margin }), quiet);
  const grant = useAction(() => operate({ action: "grantMandate", limit, days: 7 }), quiet);
  const revoke = useAction(() => operate({ action: "revokeMandate" }), quiet);
  const reducing = !!p?.open && ((side === "buy" && !p.isLong) || (side === "sell" && p.isLong));

  return (
    <>
      <PageIntro title={<>The <em>vault</em></>}>
        Deposits are split across tokenized T-bills, a margin subaccount on the exchange, and idle cash. The hedge is a short TSLA iAsset perp. It can be run by the agent under its mandate, or by hand from the manual desk.
      </PageIntro>
      <div className="vd-grid c2">
        <div className="vd-stack">
          <Card title="Allocation" icon={<PieChart />} right={<span className="v-mono" style={{ fontSize: 11 }}>NAV {fmtUsd(state?.vault.nav)} USDT</span>}>
            <Allocation />
          </Card>
          <Card title="Hedge position" icon={<Activity />} right={p?.open ? <Pill tone="ok">{p.isLong ? "long" : "short"} · {fmtLev(p.leverage)}</Pill> : <Pill>flat</Pill>} flush={!p?.open}>
            {p?.open ? (
              <KV rows={[
                ["Market", "TSLA / USDT iAsset perp"],
                ["Size", `${fmtQty(p.quantity)} TSLA`],
                ["Entry price", `$${fmtUsd(p.entryPrice)}`],
                ["Mark price", `$${fmtUsd(p.markPrice)}`],
                ["Notional", `${fmtUsd(p.notional)} USDT`],
                ["Margin posted", `${fmtUsd(p.margin)} USDT`],
                ["Unrealized PnL", `${fmtSignedUsd(p.unrealizedPnl)} USDT`, p.unrealizedPnl >= 0 ? "pos" : "neg"],
                ["Free collateral", `${fmtUsd(state?.vault.freeCollateral)} USDT`],
              ]} />
            ) : (
              <Empty icon={<Activity />} title="No hedge open yet">The agent opens one once the vault has collateral, or place an order from the manual desk.</Empty>
            )}
          </Card>
        </div>
        <div className="vd-stack">
          <Card title="Agent mandate" icon={<ShieldCheck />} right={<Pill tone={m?.active ? "ok" : "bad"}>{m?.active ? "active" : "none"}</Pill>}>
            <div className="vd-form">
              <KV rows={[
                ["Agent", <Hash key="a" value={m?.active ? m.agent : config?.addresses.agent} kind="address" />],
                ["Allowed", "place orders, add margin"],
                ["Not allowed", "withdraw, transfer, deposit"],
                ["Order spend left", m?.active ? `${fmtUsd(m.orderRemaining)} of ${fmtUsd(m.spendLimit)} USDT` : "—"],
                ["Margin spend left", m?.active ? `${fmtUsd(m.marginRemaining)} USDT` : "—"],
                ["Expires", m?.active && now ? `in ${fmtCountdown(m.expiry, now)}` : "—"],
              ]} />
              <div className="vd-row" style={{ flexWrap: "nowrap" }}>
                <div className="vd-affix" style={{ flex: 1 }}><input className="v-input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /><span>USDT</span></div>
                <Btn pending={grant.pending} disabled={!isPositiveAmount(limit)} onClick={() => grant.run()}>{m?.active ? "Re-issue 7d" : "Grant 7d"}</Btn>
                <Btn variant="danger" pending={revoke.pending} disabled={!m?.active} onClick={() => revoke.run()}>Revoke</Btn>
              </div>
              <OpNote r={grant.result} ok="Mandate granted through the exchange's approve()." />
              <OpNote r={revoke.result} ok="Mandate revoked. The agent's next order will revert." />
            </div>
          </Card>
          <Card title="Manual desk" icon={<Hand />} right={<Pill>vault operator</Pill>}>
            <div className="vd-form">
              <Seg block value={side} onChange={setSide} options={[{ value: "sell", label: "Sell / short" }, { value: "buy", label: "Buy / cover" }]} />
              <div className="vd-grid c2">
                <Field label="Quantity"><div className="vd-affix"><input className="v-input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /><span>TSLA</span></div></Field>
                <Field label="Margin"><div className="vd-affix"><input className="v-input" inputMode="decimal" value={reducing ? "0" : margin} disabled={reducing} onChange={(e) => setMargin(e.target.value)} /><span>USDT</span></div></Field>
              </div>
              <p className="vd-hint" style={{ margin: 0 }}>
                {reducing ? "This reduces the open position, so no new margin is needed." : isPositiveAmount(qty) && isPositiveAmount(margin) && p ? `About ${fmtUsd(Number(qty) * p.markPrice)} USDT notional at ${fmtLev((Number(qty) * p.markPrice) / Number(margin))} on this order.` : "Fills at the mark with a 1% slippage bound."}
              </p>
              <Btn variant="primary" block pending={order.pending} disabled={!isPositiveAmount(qty) || (!reducing && !isPositiveAmount(margin))} onClick={() => order.run()}>Place order through the vault</Btn>
              <OpNote r={order.result} ok="Order filled on the exchange." />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
