"use client";

import * as React from "react";
import { Bot, Cpu, Play, ScrollText, ShieldAlert } from "lucide-react";
import { agentProbe, agentTick, verifyDecision, type AgentDecision } from "@/lib/veil/client";
import { useVeil } from "@/components/veil/provider";
import { track } from "@/lib/veil/track";
import { SESSION_LABEL, fmtLev, fmtTime, truncate } from "@/components/veil/format";
import { Btn, Card, Empty, Hash, KV, Note, PageIntro, Pill, useAction } from "@/components/veil/ui";

const TONE: Record<AgentDecision["action"], "ok" | "warn" | "bad" | undefined> = { Hold: undefined, OpenHedge: "ok", DeLever: "warn", ReLever: "ok", Rejected: "bad" };

function Decision({ d }: { d: AgentDecision }) {
  const [check, setCheck] = React.useState<"idle" | "busy" | "ok" | "bad">("idle");
  return (
    <article>
      <header>
        <Pill tone={TONE[d.action]}>{d.action}</Pill>
        <span>#{d.id}</span><span>{fmtTime(d.timestamp)}</span><span>{SESSION_LABEL[d.session]}</span>
        <b>{fmtLev(d.leverageBefore)} → {fmtLev(d.leverageAfter)}</b>
      </header>
      <p>{d.rationale}</p>
      {d.txs.length > 0 && (
        <ul>
          {d.txs.map((t, i) => (
            <li key={i} className={t.reverted ? "is-rev" : ""}>
              {t.reverted ? "✕" : "✓"} {t.label} {t.hash && <Hash value={t.hash} />}
              {t.reverted && t.error && <span className="v-mono">reverted: {t.error}</span>}
            </li>
          ))}
        </ul>
      )}
      <footer>
        <span>{d.llm.source === "llm" ? d.llm.model : "deterministic fallback"}</span>
        <span>record {truncate(d.recordHash, 10, 6)}</span>
        <button type="button" className="v-btn is-sm" disabled={check === "busy"} onClick={async () => { setCheck("busy"); try { setCheck((await verifyDecision(d)) ? "ok" : "bad"); } catch { setCheck("bad"); } }}>
          {check === "busy" ? "Checking…" : check === "ok" ? "✓ Matches on-chain hash" : check === "bad" ? "✕ Does not match" : "Verify hash on-chain"}
        </button>
      </footer>
    </article>
  );
}

export default function AgentPage() {
  const { agent, state } = useVeil();
  const st = agent.status;
  const tick = useAction(() => agentTick(), { quietError: true });
  const over = useAction(() => { track("agent-probe", { kind: "overlimit" }); return agentProbe("overlimit"); }, { quietError: true });
  const wd = useAction(() => { track("agent-probe", { kind: "withdraw" }); return agentProbe("withdraw"); }, { quietError: true });
  const offline = agent.online === false;
  const lastErr = [tick.result, over.result, wd.result].find((r) => r?.kind === "err");

  return (
    <>
      <PageIntro title={<>A <em>bounded</em> risk agent</>}>
        The agent trades the vault&apos;s exchange subaccount through a scoped, expiring, spend-capped grant. The model proposes and explains; hard limits in code decide. Every decision is hashed on-chain.
      </PageIntro>
      <div className="vd-grid c23">
        <div className="vd-stack">
          <Card title="Status" icon={<Cpu />} right={<Pill tone={agent.online ? "ok" : offline ? "bad" : undefined} live={!!agent.online}>{agent.online ? (st?.busy ? "thinking" : "online") : offline ? "offline" : "checking"}</Pill>}>
            {st ? (
              <KV rows={[
                ["Address", <Hash key="a" value={st.address} kind="address" />],
                ["Model", <span key="m" className="v-mono">{st.model}</span>],
                ["Weekday max leverage", fmtLev(st.policy.weekdayMaxLeverage)],
                ["Weekend gap assumed", `${st.policy.gapSigmas}σ × ${(st.policy.weekendGapSigma * 100).toFixed(1)}%`],
                ["Gap-safe leverage", fmtLev(st.policy.gapSafeLeverage)],
                ["Current leverage", state?.position.open ? fmtLev(state.position.leverage) : "flat"],
              ]} />
            ) : (
              <Empty icon={<Bot />} title={offline ? "Risk agent is offline" : "Connecting…"}>{offline && "Run npm run dev from the repo root; the rest of the app keeps working."}</Empty>
            )}
          </Card>
          <Card title="Controls" icon={<ShieldAlert />}>
            <div className="vd-form">
              <Btn variant="primary" block pending={tick.pending} disabled={offline} onClick={() => tick.run()}><Play />Run agent now</Btn>
              <p className="vd-hint" style={{ margin: 0 }}>It also checks the book on its own every few seconds. The two buttons below make it step outside its mandate on purpose.</p>
              <Btn variant="danger" block pending={over.pending} disabled={offline} onClick={() => over.run()}>Attempt an over-limit order</Btn>
              <Btn variant="danger" block pending={wd.pending} disabled={offline} onClick={() => wd.run()}>Attempt a withdrawal</Btn>
              {tick.result?.kind === "ok" && !tick.result.value.decision && <Note>Nothing to do: leverage is already within the limit for this session.</Note>}
              {lastErr?.kind === "err" && <Note tone="err" title="Agent error">{lastErr.message}</Note>}
            </div>
          </Card>
        </div>
        <Card title="Decision log" icon={<ScrollText />} right={<span className="v-mono" style={{ fontSize: 11 }}>{agent.decisions.length} on-chain</span>} flush>
          {agent.decisions.length ? <div className="vd-feed">{agent.decisions.map((d) => <Decision key={d.id} d={d} />)}</div>
            : <Empty icon={<ScrollText />} title="No decisions yet">Deposit into the vault and the agent will open the hedge.</Empty>}
        </Card>
      </div>
    </>
  );
}
