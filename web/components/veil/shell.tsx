"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { Bot, ChevronsUpDown, Fingerprint, FlaskConical, LayoutGrid, Landmark, LogOut, RotateCcw, Wallet, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { chooseWallet, injected, listWallets, resetDemo } from "@/lib/veil/client";
import { VeilProvider, useVeil } from "@/components/veil/provider";
import { track } from "@/lib/veil/track";
import { SESSION_LABEL, fmtPrice, truncate } from "@/components/veil/format";
import { Btn, Note, Pill, VeilMark } from "@/components/veil/ui";

const NAV = [
  { group: "Account", items: [
    { href: "/dashboard", label: "Overview", icon: LayoutGrid },
    { href: "/dashboard/identity", label: "Identity", icon: Fingerprint },
    { href: "/dashboard/wallet", label: "Invest & transfer", icon: WalletCards },
  ] },
  { group: "Protocol", items: [
    { href: "/dashboard/vault", label: "Vault", icon: Landmark },
    { href: "/dashboard/agent", label: "Risk agent", icon: Bot },
    { href: "/dashboard/simulator", label: "Market simulator", icon: FlaskConical },
  ] },
];
const TITLES: Record<string, string> = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.href, i.label])));

export function useConnect() {
  const { connect } = useVeil();
  const [pending, setPending] = React.useState<"injected" | "demo" | null>(null);
  const go = async (kind: "injected" | "demo") => {
    setPending(kind);
    try { await connect(kind); track("wallet-connected", { kind }); toast.success(kind === "injected" ? "Wallet connected" : "Demo wallet ready"); }
    catch (e) { toast.error("Could not connect", { description: (e as Error).message }); }
    finally { setPending(null); }
  };
  return { go, pending };
}

/** Shown in place of a page that needs a wallet. */
export function ConnectGate({ children }: { children: React.ReactNode }) {
  const { account, ready } = useVeil();
  const { go, pending } = useConnect();
  const [picked, setPicked] = React.useState<string | null>(null);
  if (!ready) return null;
  const hasWallet = !!injected(); // safe: `ready` is only true in the browser
  // MetaMask first, then whatever else announced itself
  const found = listWallets().sort((a, b) => Number(b.rdns === "io.metamask") - Number(a.rdns === "io.metamask"));
  if (account) return <>{children}</>;
  return (
    <div className="vd-gate">
      <section className="vd-card vd-gate-card">
        <div className="vd-inner" style={{ padding: "30px 26px" }}>
          <span className="vd-brand-mark" style={{ margin: "0 auto", width: 42, height: 42, borderRadius: 11 }}><VeilMark size={24} /></span>
          <h2>Connect a <em>wallet</em></h2>
          <p>Veil talks to the contracts from your wallet. Nothing about your identity is sent with it.</p>
          <div className="vd-form">
            {found.length > 0 ? found.map((w, i) => (
              <Btn key={w.rdns} variant={i === 0 ? "primary" : undefined} size="lg" block pending={pending === "injected" && picked === w.rdns} disabled={pending !== null} onClick={() => { chooseWallet(w.rdns); setPicked(w.rdns); void go("injected"); }}><Wallet />Connect {w.name}</Btn>
            )) : (
              <Btn variant="primary" size="lg" block pending={pending === "injected"} disabled={!hasWallet || pending !== null} onClick={() => go("injected")}><Wallet />Connect browser wallet</Btn>
            )}
            <Btn size="lg" block pending={pending === "demo"} disabled={pending !== null} onClick={() => go("demo")}>Continue with a demo wallet</Btn>
          </div>
          <p className="vd-hint" style={{ marginTop: 14 }}>
            {hasWallet ? (found.length > 1 ? "Several wallets are installed. Pick the one you want to sign with; Veil adds the network for you." : "Veil adds the network to your wallet for you.") : "No browser wallet detected. The demo wallet is a throwaway key kept in this browser."}
          </p>
        </div>
      </section>
    </div>
  );
}

function AccountMenu({ trigger }: { trigger: React.ReactNode }) {
  const { account, disconnect, config } = useVeil();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="vd-menu" align="end" sideOffset={8}>
          <p>{account ? account.label : "Not connected"}</p>
          {account && <div style={{ padding: "0 6px 6px" }} className="v-mono">{truncate(account.address, 10, 8)}</div>}
          <p style={{ marginTop: 8 }}>{config ? `${config.networkName} · ${config.chainId}` : "Network"}</p>
          <div className="vd-menu-sep" />
          <DropdownMenu.Item className="vd-menu-item" onSelect={() => { resetDemo(); window.location.reload(); }}><RotateCcw />Reset demo data</DropdownMenu.Item>
          {account && <DropdownMenu.Item className="vd-menu-item is-danger" onSelect={disconnect}><LogOut />Disconnect</DropdownMenu.Item>}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { account, state, userName, configError, stateError, agent, ready } = useVeil();
  const { go, pending } = useConnect();
  const session = state?.oracle.sessionName;
  const done: Record<string, boolean> = {
    "/dashboard/identity": !!state?.wallets.you?.verified,
    "/dashboard/wallet": (state?.wallets.you?.vrwa ?? 0) > 0,
  };
  return (
    <div className="vd">
      <aside className="vd-side">
        <Link href="/" className="vd-brand"><span className="vd-brand-mark"><VeilMark /></span>Veil<small>TESTNET</small></Link>
        <nav className="vd-nav">
          {NAV.map((g) => (
            <div key={g.group}>
              <p>{g.group}</p>
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} className={`vd-nav-link${path === i.href ? " is-active" : ""}`}>
                  <i.icon /><span>{i.label}</span>
                  {i.href === "/dashboard/agent" ? <em className={agent.online ? "is-done" : ""}>{agent.online ? "live" : agent.online === false ? "off" : ""}</em> : done[i.href] ? <em className="is-done">done</em> : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <AccountMenu trigger={
          <button className="vd-account">
            <i className="vd-avatar" style={{ fontStyle: "normal" }}>{(userName ?? "G").slice(0, 1)}</i>
            <span><strong>{userName ?? "Guest"}</strong><small>{account ? truncate(account.address, 6, 4) : "no wallet connected"}</small></span>
            <ChevronsUpDown size={14} color="#a4aea9" />
          </button>
        } />
      </aside>
      <div className="vd-main">
        <div className="vd-top">
          <div className="vd-crumb"><Link href="/">Veil</Link><b>/</b><strong>{TITLES[path] ?? "Dashboard"}</strong></div>
          <div className="vd-top-right">
            {state && <span className="vd-mark">TSLA <strong>${fmtPrice(state.oracle.price)}</strong></span>}
            {session && <Pill tone={session === "Open" ? "ok" : session === "PreClose" ? "warn" : "bad"} live={session === "Open"}>{SESSION_LABEL[session]}</Pill>}
            {!ready ? null : account ? (
              <AccountMenu trigger={<button className="v-btn is-sm"><Wallet /><span className="v-mono">{truncate(account.address, 6, 4)}</span></button>} />
            ) : (
              <Btn variant="primary" size="sm" pending={pending !== null} onClick={() => go(injected() ? "injected" : "demo")}><Wallet />Connect wallet</Btn>
            )}
          </div>
        </div>
        <main className="vd-content" key={path}>
          {(configError || stateError) && (
            <div style={{ marginBottom: 14 }}>
              <Note tone="err" title="Cannot reach the chain">{configError ?? stateError} Start everything with <span className="v-mono">npm run dev</span> from the repo root.</Note>
            </div>
          )}
          {children}
          <p className="vd-foot">Testnet demo. USDT, T-bill, oracle and the exchange precompile are mocks; the ZK proof, contracts and agent are real.</p>
        </main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return <VeilProvider><Shell>{children}</Shell></VeilProvider>;
}
