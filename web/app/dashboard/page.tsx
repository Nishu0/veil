"use client";

import Link from "next/link";
import { ArrowRight, Bot, CircleDollarSign, Gauge, ListChecks, PieChart, ShieldCheck, TrendingUp } from "lucide-react";
import { useVeil, useNow } from "@/components/veil/provider";
import { fmtCountdown, fmtLev, fmtSharePrice, fmtTime, fmtUsd } from "@/components/veil/format";
import { Card, Empty, Metric, PageIntro, Pill } from "@/components/veil/ui";
import { Allocation } from "@/components/veil/allocation";

export default function Overview() {
  const { state, agent, userName, account } = useVeil();
  const now = useNow();
  const you = state?.wallets.you;
  const decisions = agent.decisions;
  const last = decisions[0];
  const steps = [
    { done: !!account, title: "Connect a wallet", text: "Browser wallet or a throwaway demo key.", href: "/dashboard/identity", cta: "Connect" },
    { done: !!you?.verified, title: "Prove your credential", text: "Mock KYC, then a real zero-knowledge proof registered on-chain.", href: "/dashboard/identity", cta: "Verify" },
    { done: (you?.vrwa ?? 0) > 0, title: "Deposit and receive vRWA", text: "USDT in, permissioned vault shares out.", href: "/dashboard/wallet", cta: "Invest" },
    { done: !!state?.wallets.friend.verified, title: "Send vRWA to a friend", text: "Blocked while they are unverified, passes once they prove a credential.", href: "/dashboard/wallet", cta: "Transfer" },
    { done: decisions.some((d) => d.action === "DeLever"), title: "Survive the weekend gap", text: "Friday pre-close makes the agent cut leverage; then gap the Monday open.", href: "/dashboard/simulator", cta: "Simulate" },
    { done: decisions.some((d) => d.action === "Rejected"), title: "Test the agent's limits", text: "Over-limit orders and withdrawals are refused by the exchange.", href: "/dashboard/agent", cta: "Probe" },
  ];
  const next = steps.findIndex((s) => !s.done);
  const m = state?.mandate;

  return (
    <>
      <PageIntro title={userName ? <>Welcome, <em>{userName}</em></> : <>Welcome to <em>Veil</em></>}>
        A private, compliant prime account for real-world assets. Your name stays in this browser; the chain only ever sees a proof.
      </PageIntro>

      <div className="vd-grid c4" style={{ marginBottom: 14 }}>
        <Metric title="Vault NAV" icon={<CircleDollarSign />} value={state ? fmtUsd(state.vault.nav) : "—"} unit="USDT">
          {state ? <>{fmtUsd(state.vault.totalShares)} vRWA outstanding</> : "loading"}
        </Metric>
        <Metric title="Share price" icon={<TrendingUp />} value={state ? fmtSharePrice(state.vault.sharePrice) : "—"} unit="USDT">
          {you ? <>You hold <b>{fmtUsd(you.vrwa)}</b> vRWA</> : "per vRWA"}
        </Metric>
        <Metric title="Hedge leverage" icon={<Gauge />} value={state?.position.open ? fmtLev(state.position.leverage) : "—"}>
          {agent.status ? <>gap-safe max <b>{fmtLev(agent.status.policy.gapSafeLeverage)}</b>, weekday {fmtLev(agent.status.policy.weekdayMaxLeverage)}</> : state?.position.open ? "short TSLA iAsset perp" : "no hedge open"}
        </Metric>
        <Metric title="Agent mandate" icon={<ShieldCheck />} value={m?.active ? fmtUsd(m.orderRemaining) : "—"} unit={m?.active ? "USDT left" : undefined}>
          {m?.active ? <>of {fmtUsd(m.spendLimit)} · expires in {now ? fmtCountdown(m.expiry, now) : "…"}</> : "no active mandate"}
        </Metric>
      </div>

      <div className="vd-grid c32">
        <Card title="Demo run" icon={<ListChecks />} right={<Pill tone={next === -1 ? "ok" : undefined}>{steps.filter((s) => s.done).length}/{steps.length} done</Pill>} flush>
          <ol className="vd-steps">
            {steps.map((s, i) => (
              <li key={s.title} className={s.done ? "is-done" : i === next ? "is-next" : ""}>
                <i className="vd-step-n" style={{ fontStyle: "normal" }}>{s.done ? "✓" : i + 1}</i>
                <div><b>{s.title}</b><span>{s.text}</span></div>
                {i === next && <Link href={s.href} className="v-btn is-sm is-primary">{s.cta}<ArrowRight /></Link>}
              </li>
            ))}
          </ol>
        </Card>

        <div className="vd-stack">
          <Card title="Where the money is" icon={<PieChart />}>
            <Allocation />
          </Card>
          <Card title="Latest agent decision" icon={<Bot />} right={<Link href="/dashboard/agent" className="v-btn is-sm">All decisions</Link>} flush>
            {last ? (
              <div className="vd-feed"><article>
                <header><Pill tone={last.action === "Rejected" ? "bad" : last.action === "Hold" ? undefined : "ok"}>{last.action}</Pill>{fmtTime(last.timestamp)}<b>{fmtLev(last.leverageBefore)} → {fmtLev(last.leverageAfter)}</b></header>
                <p>{last.rationale}</p>
              </article></div>
            ) : (
              <Empty icon={<Bot />} title={agent.online === false ? "Risk agent is offline" : "No decisions yet"}>
                {agent.online === false ? "Start it with npm run dev from the repo root." : "The agent opens the hedge as soon as the vault has collateral."}
              </Empty>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
