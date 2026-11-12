"use client";

import * as React from "react";
import { BadgeCheck, EyeOff, Fingerprint, KeyRound, UserRound, Users } from "lucide-react";
import { JURISDICTIONS, proveAndRegister, reconnectInjected, requestCredential, type Credential, type ProofResult, type WalletId } from "@/lib/veil/client";
import { useVeil } from "@/components/veil/provider";
import { track } from "@/lib/veil/track";
import { fmtDate, truncate } from "@/components/veil/format";
import { ConnectGate } from "@/components/veil/shell";
import { Btn, Card, Field, Hash, KV, Note, PageIntro, Pill, useAction } from "@/components/veil/ui";

const country = (code: string) => JURISDICTIONS.find((j) => j.code === code)?.name ?? code;

function CredentialFlow({ id, compact }: { id: WalletId; compact?: boolean }) {
  const { wallets, credentials, state, reloadCredentials, withWallet, connect } = useVeil();
  const wallet = wallets?.[id] ?? null;
  const cred = credentials[id];
  const verified = !!state?.wallets[id]?.verified;
  const [name, setName] = React.useState("");
  const [jurisdiction, setJurisdiction] = React.useState<string>(id === "you" ? "356" : "702");
  const [accredited, setAccredited] = React.useState(true);
  const [stage, setStage] = React.useState<"proving" | "submitting" | null>(null);
  const [editing, setEditing] = React.useState(false);

  const issue = useAction(async () => {
    const c = await requestCredential(id, { name: name.trim(), jurisdiction, accredited });
    reloadCredentials();
    setEditing(false);
    track("credential-issued", { wallet: id });
    return c;
  }, { success: "Credential issued" });
  const prove = useAction(async (c: Credential): Promise<ProofResult> => {
    try {
      const r = await withWallet(id, () => proveAndRegister(wallet!, c, setStage));
      track("proof-registered", { wallet: id, seconds: Math.round(r.proveMs / 1000) });
      return r;
    } catch (e) {
      track("proof-failed", { wallet: id });
      throw e;
    }
    finally { setStage(null); }
  }, { success: "Proof verified on-chain", quietError: true });

  const reconnect = useAction(async () => { await reconnectInjected(); await connect("injected"); }, { success: "Wallet reconnected. Try the proof again." });
  if (!wallet) return null;
  const showForm = !cred || editing;

  return (
    <div className="vd-form">
      {showForm ? (
        <>
          <Field label="Full name" hint={compact ? undefined : "Used for the mock KYC check. It is hashed into the credential and never sent on-chain."}>
            <input className="v-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={id === "you" ? "e.g. nisarg" : "e.g. priya"} autoComplete="off" />
          </Field>
          <Field label="Jurisdiction">
            <select className="v-input" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
              {JURISDICTIONS.map((j) => <option key={j.code} value={j.code}>{j.name}</option>)}
            </select>
          </Field>
          <label className="vd-check"><input type="checkbox" checked={accredited} onChange={(e) => setAccredited(e.target.checked)} />Accredited investor</label>
          <Btn variant="primary" block pending={issue.pending} disabled={!name.trim()} onClick={() => issue.run()}><KeyRound />Get credential (mock KYC)</Btn>
        </>
      ) : (
        <>
          <KV rows={[
            ["Name", cred.name],
            ["Jurisdiction", country(cred.jurisdiction)],
            ["Accredited", cred.accredited === "1" ? "Yes" : "No"],
            ["Valid until", fmtDate(Number(cred.expiry))],
            ["Issuer signature", <span key="s" className="v-mono">{truncate(cred.sigS, 8, 6)}</span>],
          ]} />
          {verified ? (
            <Note tone="ok" title="Verified on-chain">
              {prove.result?.kind === "ok" ? (
                <>Proof built in {(prove.result.value.proveMs / 1000).toFixed(1)}s · nullifier <span className="v-mono">{truncate(prove.result.value.nullifier, 8, 6)}</span> · tx <Hash value={prove.result.value.hash} /></>
              ) : <>The registry holds a nullifier and an expiry for this wallet, nothing else.</>}
            </Note>
          ) : (
            <>
              <Btn variant="primary" block pending={prove.pending} onClick={() => prove.run(cred)}>
                <Fingerprint />{stage === "proving" ? "Building proof in your browser…" : stage === "submitting" ? "Registering on-chain…" : "Generate ZK proof & register"}
              </Btn>
              {prove.result?.kind === "err" && <Note tone="err" title={prove.result.name ?? "Could not register the proof"}>{prove.result.message}</Note>}
              {prove.result?.kind === "err" && wallet.kind === "injected" && /refused|authoris|authoriz/i.test(`${prove.result.name} ${prove.result.message}`) && (
                <Btn block pending={reconnect.pending} onClick={() => reconnect.run()}>Reconnect wallet (re-approve this site)</Btn>
              )}
              <Btn size="sm" onClick={() => { setEditing(true); prove.clear(); }}>Request a different credential</Btn>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function IdentityPage() {
  const { account, wallets, state, credentials } = useVeil();
  const you = state?.wallets.you;
  const cred = credentials.you;
  return (
    <ConnectGate>
      <PageIntro title={<>Prove it <em>without</em> showing it</>}>
        Instead of a public KYC allowlist, your wallet proves in zero knowledge that an approved issuer vouched for you. The proof is built in this browser and checked by a Groth16 verifier contract.
      </PageIntro>
      <div className="vd-grid c2">
        <Card title="Your credential" icon={<UserRound />} right={<Pill tone={you?.verified ? "ok" : "warn"}>{you?.verified ? "verified" : "not verified"}</Pill>}>
          <CredentialFlow id="you" />
        </Card>
        <div className="vd-stack">
          <Card title="What the chain sees" icon={<EyeOff />} flush>
            <div className="vd-compare">
              <div>
                <h3>Public, on-chain</h3>
                <ul>
                  <li><span>Wallet</span><b className="v-mono">{truncate(account?.address, 6, 4)}</b></li>
                  <li><span>Nullifier</span><b>{you?.verified ? "stored" : "—"}</b></li>
                  <li><span>Expiry</span><b>{you?.verified ? fmtDate(you.verifiedUntil) : "—"}</b></li>
                </ul>
              </div>
              <div className="is-private">
                <h3>Private, this browser</h3>
                <ul>
                  <li><span>Name</span><b>{cred?.name ?? "—"}</b></li>
                  <li><span>Jurisdiction</span><b>{cred ? country(cred.jurisdiction) : "—"}</b></li>
                  <li><span>Accredited</span><b>{cred ? (cred.accredited === "1" ? "Yes" : "No") : "—"}</b></li>
                </ul>
              </div>
            </div>
          </Card>
          <Card title="Verify a friend's wallet" icon={<Users />} right={<Pill tone={state?.wallets.friend.verified ? "ok" : "warn"}>{state?.wallets.friend.verified ? "verified" : "not verified"}</Pill>}>
            <p className="vd-hint" style={{ margin: "0 0 14px" }}>
              A second wallet (<span className="v-mono">{truncate(wallets?.friend.address, 6, 4)}</span>) to receive vRWA. Leave it unverified first to see a transfer get blocked.
            </p>
            <CredentialFlow id="friend" compact />
          </Card>
        </div>
      </div>
      {!you?.verified && cred && <div style={{ marginTop: 14 }}><Note><BadgeCheck style={{ display: "none" }} />Try a blocked jurisdiction or untick “accredited”: no proof can be produced, so the wallet can never be registered.</Note></div>}
    </ConnectGate>
  );
}
