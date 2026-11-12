"use client";

import * as React from "react";
import Link from "next/link";
import { isAddress, type Address } from "viem";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Droplets, Send, Wallet } from "lucide-react";
import { deposit, faucet, transfer, withdraw, type WalletId } from "@/lib/veil/client";
import { useVeil } from "@/components/veil/provider";
import { track } from "@/lib/veil/track";
import { fmtSharePrice, fmtUsd, isPositiveAmount } from "@/components/veil/format";
import { ConnectGate } from "@/components/veil/shell";
import { Btn, Card, Field, Hash, Note, PageIntro, Pill, Seg, TxNote, useAction } from "@/components/veil/ui";

function WalletCard({ id, title }: { id: WalletId; title: string }) {
  const { wallets, state, credentials } = useVeil();
  const w = wallets?.[id];
  const s = state?.wallets[id];
  const drip = useAction(async () => { const r = await faucet(w!.address); track("faucet", { wallet: id }); return r; }, { success: "10,000 test USDT sent" });
  if (!w) return null;
  return (
    <Card title={title} icon={<Wallet />} right={<Pill tone={s?.verified ? "ok" : "warn"}>{s?.verified ? "verified" : "unverified"}</Pill>}>
      <div className="vd-wallet">
        <div className="vd-wallet-top">
          <i className="vd-avatar" style={{ fontStyle: "normal" }}>{(credentials[id]?.name ?? (id === "you" ? "Y" : "F")).slice(0, 1)}</i>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: 13 }}>{credentials[id]?.name ?? w.label}</strong>
            <Hash value={w.address} kind="address" />
          </div>
          <Btn size="sm" pending={drip.pending} onClick={() => drip.run()}><Droplets />Faucet</Btn>
        </div>
        <div className="vd-bal">
          <div><span>USDT</span><b>{fmtUsd(s?.usdt)}</b></div>
          <div><span>vRWA</span><b>{fmtUsd(s?.vrwa)}</b></div>
          <div><span>INJ (gas)</span><b>{s ? s.inj.toFixed(3) : "—"}</b></div>
        </div>
      </div>
    </Card>
  );
}

function Amount({ value, onChange, unit, max }: { value: string; onChange: (v: string) => void; unit: string; max?: number }) {
  return (
    <div className="vd-row" style={{ flexWrap: "nowrap" }}>
      <div className="vd-affix" style={{ flex: 1 }}>
        <input className="v-input" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" />
        <span>{unit}</span>
      </div>
      {max !== undefined && <Btn size="sm" onClick={() => onChange(String(Math.floor(max * 100) / 100))}>Max</Btn>}
    </div>
  );
}

export default function WalletPage() {
  const { account, wallets, state, withWallet } = useVeil();
  const you = state?.wallets.you;
  const [tab, setTab] = React.useState<"deposit" | "redeem" | "transfer">("deposit");
  const [dep, setDep] = React.useState("2500");
  const [red, setRed] = React.useState("");
  const [token, setToken] = React.useState<"vrwa" | "usdt">("vrwa");
  const [toFriend, setToFriend] = React.useState(true);
  const [custom, setCustom] = React.useState("");
  const [amt, setAmt] = React.useState("100");

  const quiet = { quietError: true } as const;
  const doDeposit = useAction(async () => { const r = await withWallet("you", () => deposit(account!, dep)); track("deposit"); return r; }, quiet);
  const doRedeem = useAction(async () => { const r = await withWallet("you", () => withdraw(account!, red)); track("redeem"); return r; }, quiet);
  const recipient = (toFriend ? wallets?.friend.address : custom.trim()) as Address | undefined;
  const doTransfer = useAction(async () => {
    try { const r = await withWallet("you", () => transfer(account!, token, recipient!, amt)); track("transfer", { token }); return r; }
    catch (e) { track("transfer-blocked", { token }); throw e; }
  }, quiet);
  const sp = state?.vault.sharePrice ?? 1;

  return (
    <ConnectGate>
      <PageIntro title={<>Invest &amp; <em>transfer</em></>}>
        Every action here is a transaction signed by your wallet. vRWA only moves between wallets that hold a valid ZK credential; the chain refuses anything else.
      </PageIntro>
      <div className="vd-grid c23">
        <div className="vd-stack">
          <WalletCard id="you" title="Your wallet" />
          <WalletCard id="friend" title="Friend's wallet" />
        </div>
        <Card title="Move money" icon={<ArrowLeftRight />}>
          <div className="vd-form">
            <Seg block value={tab} onChange={setTab} options={[{ value: "deposit", label: "Deposit" }, { value: "redeem", label: "Redeem" }, { value: "transfer", label: "Transfer" }]} />

            {tab === "deposit" && (
              <>
                {!you?.verified && <Note tone="warn" title="Wallet not verified">The vault only accepts deposits from wallets with a ZK credential. <Link href="/dashboard/identity" style={{ textDecoration: "underline" }}>Verify first</Link>, or try anyway to see the revert.</Note>}
                <Field label="Amount to deposit" hint={isPositiveAmount(dep) ? `You receive about ${fmtUsd(Number(dep) / sp)} vRWA at ${fmtSharePrice(sp)} USDT per share. 60% goes to T-bills, 30% to exchange margin, 10% stays idle.` : "Use the faucet for test USDT."}>
                  <Amount value={dep} onChange={setDep} unit="USDT" max={you?.usdt} />
                </Field>
                {you && isPositiveAmount(dep) && Number(dep) > you.usdt && <Note tone="warn" title="Not enough USDT">This wallet holds {fmtUsd(you.usdt)} USDT. Click <b>Faucet</b> on your wallet card for 10,000 test USDT.</Note>}
                <Btn variant="primary" block pending={doDeposit.pending} disabled={!isPositiveAmount(dep)} onClick={() => doDeposit.run()}><ArrowDownToLine />Deposit</Btn>
                <TxNote result={doDeposit.result} ok="Deposited. vRWA minted to your wallet." />
              </>
            )}

            {tab === "redeem" && (
              <>
                <Field label="Shares to redeem" hint={isPositiveAmount(red) ? `You receive about ${fmtUsd(Number(red) * sp)} USDT. Paid from idle cash, then T-bills, then free margin.` : `You hold ${fmtUsd(you?.vrwa)} vRWA.`}>
                  <Amount value={red} onChange={setRed} unit="vRWA" max={you?.vrwa} />
                </Field>
                <Btn variant="primary" block pending={doRedeem.pending} disabled={!isPositiveAmount(red)} onClick={() => doRedeem.run()}><ArrowUpFromLine />Redeem</Btn>
                <TxNote result={doRedeem.result} ok="Redeemed. USDT returned to your wallet." />
              </>
            )}

            {tab === "transfer" && (
              <>
                <Field label="Token"><Seg value={token} onChange={setToken} options={[{ value: "vrwa", label: "vRWA (permissioned)" }, { value: "usdt", label: "USDT" }]} /></Field>
                <Field label="Recipient">
                  <Seg value={toFriend ? "friend" : "custom"} onChange={(v) => setToFriend(v === "friend")} options={[{ value: "friend", label: "Friend's wallet" }, { value: "custom", label: "Any address" }]} />
                  {toFriend
                    ? <p className="vd-hint"><Hash value={wallets?.friend.address} kind="address" /> · {state?.wallets.friend.verified ? "verified" : "not verified, so a vRWA transfer will be rejected"}</p>
                    : <input className="v-input is-mono" style={{ marginTop: 8 }} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="0x…" />}
                </Field>
                <Field label="Amount"><Amount value={amt} onChange={setAmt} unit={token === "vrwa" ? "vRWA" : "USDT"} max={token === "vrwa" ? you?.vrwa : you?.usdt} /></Field>
                <Btn variant="primary" block pending={doTransfer.pending} disabled={!isPositiveAmount(amt) || !recipient || !isAddress(recipient)} onClick={() => doTransfer.run()}><Send />Send</Btn>
                <TxNote result={doTransfer.result} ok="Transfer confirmed." rejectedTitle="The chain rejected this transfer" />
              </>
            )}
          </div>
        </Card>
      </div>
    </ConnectGate>
  );
}
