"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, Info, XCircle } from "lucide-react";
import { explainError, explorerLink } from "@/lib/veil/client";
import { useVeil } from "@/components/veil/provider";
import { truncate } from "@/components/veil/format";

// ---------------------------------------------------------------- actions

export type ActionResult<T> = { kind: "ok"; value: T } | { kind: "err"; name: string | null; message: string };

/** Async action with a pending flag, a guard against double submission, decoded errors and a state refresh. */
export function useAction<A extends unknown[], T>(fn: (...args: A) => Promise<T>, opts?: { success?: string; quietError?: boolean }) {
  const { refresh } = useVeil();
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<T> | null>(null);
  const running = React.useRef(false);
  const fnRef = React.useRef(fn);
  React.useEffect(() => { fnRef.current = fn; });

  const run = React.useCallback(async (...args: A): Promise<ActionResult<T> | null> => {
    if (running.current) return null;
    running.current = true;
    setPending(true);
    let r: ActionResult<T>;
    try {
      r = { kind: "ok", value: await fnRef.current(...args) };
      if (opts?.success) toast.success(opts.success);
    } catch (e) {
      const x = explainError(e);
      r = { kind: "err", name: x.name, message: x.message };
      if (!opts?.quietError) toast.error(x.name ?? "Failed", { description: x.message });
    } finally {
      running.current = false;
      setPending(false);
      refresh();
    }
    setResult(r);
    return r;
  }, [refresh, opts?.success, opts?.quietError]);

  return { run, pending, result, clear: React.useCallback(() => setResult(null), []) };
}

// ------------------------------------------------------------------ atoms

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger"; size?: "sm" | "lg"; block?: boolean; pending?: boolean };
export function Btn({ variant, size, block, pending, className = "", children, disabled, ...rest }: BtnProps) {
  const cls = ["v-btn", variant && `is-${variant}`, size && `is-${size}`, block && "is-block", className].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} disabled={disabled || pending} aria-busy={pending || undefined} {...rest}>
      {pending && <span className="v-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Pill({ tone, live, children }: { tone?: "ok" | "warn" | "bad"; live?: boolean; children: React.ReactNode }) {
  return <span className={["v-pill", tone && `is-${tone}`, live && "is-live"].filter(Boolean).join(" ")}><i />{children}</span>;
}

export function Card({ title, icon, right, children, flush, className = "" }: { title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`vd-card ${className}`}>
      <div className="vd-card-head"><h2>{icon}{title}</h2>{right}</div>
      <div className={`vd-inner${flush ? " is-flush" : ""}`}>{children}</div>
    </section>
  );
}

export function Metric({ title, icon, value, unit, children }: { title: string; icon?: React.ReactNode; value: string; unit?: string; children?: React.ReactNode }) {
  return (
    <section className="vd-card vd-metric">
      <div className="vd-card-head"><h2>{icon}{title}</h2></div>
      <div className="vd-inner"><strong>{value}{unit && <small>{unit}</small>}</strong><p>{children}</p></div>
    </section>
  );
}

export function KV({ rows }: { rows: [string, React.ReactNode, ("pos" | "neg")?][] }) {
  return <dl className="vd-kv">{rows.map(([k, v, tone]) => <div key={k}><dt>{k}</dt><dd className={tone}>{v}</dd></div>)}</dl>;
}

/** Truncated address / tx hash with copy and (when the network has one) an explorer link. */
export function Hash({ value, kind = "tx", head = 8, tail = 6 }: { value: string | null | undefined; kind?: "tx" | "address"; head?: number; tail?: number }) {
  const { config } = useVeil();
  const [copied, setCopied] = React.useState(false);
  if (!value) return <span className="vd-hash">—</span>;
  const link = config ? explorerLink(config, kind, value) : null;
  return (
    <span className="vd-hash" title={value}>
      {truncate(value, head, tail)}
      <button type="button" aria-label="Copy" onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
        {copied ? <Check /> : <Copy />}
      </button>
      {link && <a href={link} target="_blank" rel="noreferrer" aria-label="Open in explorer"><ExternalLink /></a>}
    </span>
  );
}

export function Note({ tone = "info", title, children }: { tone?: "ok" | "err" | "warn" | "info"; title?: string; children?: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "err" ? XCircle : tone === "warn" ? AlertTriangle : Info;
  return (
    <div className={`vd-note${tone === "info" ? "" : ` is-${tone}`}`} role={tone === "err" ? "alert" : "status"}>
      <Icon />
      <div>{title && <strong>{title}</strong>}{children}</div>
    </div>
  );
}

/** Standard rendering of a transaction action result. */
export function TxNote<T extends { hash: string }>({ result, ok, rejectedTitle = "The chain rejected this transaction" }: { result: ActionResult<T> | null; ok: string; rejectedTitle?: string }) {
  if (!result) return null;
  if (result.kind === "ok") return <Note tone="ok" title={ok}>Transaction <Hash value={result.value.hash} /></Note>;
  return <Note tone="err" title={result.name ? `${rejectedTitle}: ${result.name}` : "Something went wrong"}>{result.message}</Note>;
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return <div className="vd-empty">{icon}<strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label style={{ display: "block" }}><span className="vd-label">{label}</span>{children}{hint && <p className="vd-hint">{hint}</p>}</label>;
}

export function Seg<T extends string | number>({ value, onChange, options, block }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; block?: boolean }) {
  return (
    <div className={`v-seg${block ? " is-block" : ""}`} role="tablist">
      {options.map((o) => <button key={String(o.value)} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? "is-on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function PageIntro({ title, children, right }: { title: React.ReactNode; children?: React.ReactNode; right?: React.ReactNode }) {
  return <header className="vd-intro"><div><h1>{title}</h1>{children && <p>{children}</p>}</div>{right}</header>;
}

export function VeilMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6.5c2.6 1.4 5.3 2.1 8 2.1s5.4-.7 8-2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M5.5 6.9 12 19l6.5-12.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8.4 12 14l3-5.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
    </svg>
  );
}
