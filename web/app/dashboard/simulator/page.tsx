"use client";

import * as React from "react";
import { CalendarClock, Gauge, Skull, Sprout, TrendingUp } from "lucide-react";
import { simulate } from "@/lib/veil/client";
import { useVeil } from "@/components/veil/provider";
import { track } from "@/lib/veil/track";
import { SESSION_LABEL, fmtLev, fmtSignedUsd, fmtUsd } from "@/components/veil/format";
import { Btn, Card, Field, KV, Note, PageIntro, Pill, useAction, type ActionResult } from "@/components/veil/ui";

function Res({ r, ok }: { r: ActionResult<unknown> | null; ok: string }) {
  if (!r) return null;
  return r.kind === "ok" ? <Note tone="ok" title={ok} /> : <Note tone="err" title="Reverted">{r.message}</Note>;
}

export default function SimulatorPage() {
  const { state, agent } = useVeil();
  const [gap, setGap] = React.useState("12");
  const [price, setPrice] = React.useState("");
  const q = { quietError: true } as const;
  const session = useAction((v: 0 | 1 | 2) => { track("sim-session", { session: v }); return simulate({ action: "session", value: v }); }, q);
  const doGap = useAction(() => { track("sim-gap"); return simulate({ action: "gap", pct: Number(gap) }); }, q);
  const doPrice = useAction(() => simulate({ action: "price", value: price }), q);
  const doYield = useAction(() => simulate({ action: "yield", days: 30 }), q);
  const liq = useAction(() => simulate({ action: "liquidate" }), q);

  const s = state?.oracle.session;
  const p = state?.position;
  const equity = p ? p.margin + p.unrealizedPnl : 0;
  const maintenance = p ? p.notional * 0.05 : 0;
  const gapSafe = agent.status?.policy.gapSafeLeverage;
  const sessions: { v: 0 | 1 | 2; label: string; text: string }[] = [
    { v: 0, label: "Weekday open", text: "Oracle live" },
    { v: 1, label: "Friday pre-close", text: "Agent de-levers" },
    { v: 2, label: "Weekend", text: "Mark frozen" },
  ];

  return (
    <>
      <PageIntro title={<>Market <em>simulator</em></>}>
        iAsset equity marks freeze from Friday close to Monday open while trading continues. Walk the calendar forward and gap the Monday open to see whether the book survives.
      </PageIntro>
      <div className="vd-grid c32">
        <div className="vd-stack">
          <Card title="Trading session" icon={<CalendarClock />} right={s !== undefined ? <Pill tone={s === 0 ? "ok" : s === 1 ? "warn" : "bad"}>{SESSION_LABEL[state!.oracle.sessionName]}</Pill> : null}>
            <div className="vd-form">
              <div className="vd-grid c3">
                {sessions.map((x) => (
                  <Btn key={x.v} variant={s === x.v ? "primary" : undefined} pending={session.pending && false} disabled={session.pending || s === x.v} onClick={() => session.run(x.v)} style={{ height: 54, flexDirection: "column", gap: 2 }}>
                    {x.label}<span style={{ fontWeight: 400, fontSize: 10.5, opacity: .7 }}>{x.text}</span>
                  </Btn>
                ))}
              </div>
              {session.result?.kind === "err" && <Note tone="err" title="Reverted">{session.result.message}</Note>}
              <p className="vd-hint" style={{ margin: 0 }}>Switch to Friday pre-close and watch the Risk agent page: it cuts leverage to the gap-safe level and logs why.</p>
            </div>
          </Card>
          <Card title="Monday open with a gap" icon={<TrendingUp />}>
            <div className="vd-form">
              <div className="vd-row" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}><Field label="Gap versus the frozen mark"><div className="vd-affix"><input className="v-input" inputMode="decimal" value={gap} onChange={(e) => setGap(e.target.value)} /><span>%</span></div></Field></div>
                <Btn variant="primary" pending={doGap.pending} disabled={!Number.isFinite(Number(gap)) || gap.trim() === ""} onClick={() => doGap.run()} style={{ height: 38 }}>Open Monday</Btn>
              </div>
              <p className="vd-hint" style={{ margin: 0 }}>Unfreezes the oracle and moves TSLA by this much. The vault is short, so a positive gap hurts it.</p>
              <Res r={doGap.result} ok={`Oracle live again. TSLA moved ${gap}%.`} />
              <div className="vd-row" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}><Field label="Or set the mark directly"><div className="vd-affix"><input className="v-input" inputMode="decimal" value={price} placeholder={state ? fmtUsd(state.oracle.price) : ""} onChange={(e) => setPrice(e.target.value)} /><span>USD</span></div></Field></div>
                <Btn pending={doPrice.pending} disabled={!(Number(price) > 0)} onClick={() => doPrice.run()} style={{ height: 38 }}>Set price</Btn>
              </div>
              <Res r={doPrice.result} ok="Mark price updated." />
            </div>
          </Card>
        </div>
        <div className="vd-stack">
          <Card title="Position health" icon={<Gauge />}>
            <KV rows={[
              ["TSLA mark", state ? `$${fmtUsd(state.oracle.price)}` : "—"],
              ["Leverage", p?.open ? fmtLev(p.leverage) : "flat"],
              ["Gap-safe limit", gapSafe ? fmtLev(gapSafe) : "—"],
              ["Position equity", p?.open ? `${fmtUsd(equity)} USDT` : "—"],
              ["Maintenance margin", p?.open ? `${fmtUsd(maintenance)} USDT` : "—"],
              ["Unrealized PnL", p?.open ? `${fmtSignedUsd(p.unrealizedPnl)} USDT` : "—", p && p.unrealizedPnl < 0 ? "neg" : "pos"],
              ["Vault NAV", state ? `${fmtUsd(state.vault.nav)} USDT` : "—"],
            ]} />
          </Card>
          <Card title="Liquidation test" icon={<Skull />}>
            <div className="vd-form">
              <p className="vd-hint" style={{ margin: 0 }}>Anyone may liquidate a position whose equity is below maintenance. After a gap, try it.</p>
              <Btn variant="danger" block pending={liq.pending} disabled={!p?.open} onClick={() => liq.run()}>Try to liquidate the vault position</Btn>
              {liq.result?.kind === "err" && (liq.result.message.startsWith("NotLiquidatable")
                ? <Note tone="ok" title="The position survived">{liq.result.message.replace("NotLiquidatable: ", "")}</Note>
                : <Note tone="err" title="Reverted">{liq.result.message}</Note>)}
              {liq.result?.kind === "ok" && <Note tone="err" title="Position liquidated">Equity was below maintenance margin, so the margin was lost to the insurance fund.</Note>}
            </div>
          </Card>
          <Card title="T-bill yield" icon={<Sprout />}>
            <div className="vd-form">
              <Btn block pending={doYield.pending} onClick={() => doYield.run()}>Accrue 30 days of yield</Btn>
              <Res r={doYield.result} ok="30 days of T-bill yield accrued. Share price moved up." />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
