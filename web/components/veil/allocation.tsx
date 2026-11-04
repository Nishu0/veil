"use client";

import { useVeil } from "@/components/veil/provider";
import { fmtUsd } from "@/components/veil/format";

/** Proportional bar + legend of the vault's three sleeves. */
export function Allocation() {
  const { state } = useVeil();
  const v = state?.vault;
  const parts = [
    { label: "Tokenized T-bills", value: v?.tbillValue ?? 0, color: "#1e3a2b" },
    { label: "Exchange margin & hedge equity", value: v?.subaccountEquity ?? 0, color: "#35b07a" },
    { label: "Idle USDT for redemptions", value: v?.idleUsdt ?? 0, color: "#b9d9c5" },
  ];
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div>
      <div className="vd-bar" aria-hidden>
        {total > 0 && parts.map((p) => <i key={p.label} style={{ flexBasis: `${(p.value / total) * 100}%`, background: p.color }} />)}
      </div>
      <div className="vd-legend">
        {parts.map((p) => (
          <div key={p.label}>
            <i style={{ background: p.color }} /><span>{p.label}</span>
            <b>{fmtUsd(p.value)}</b><small>{total > 0 ? `${((p.value / total) * 100).toFixed(0)}%` : "—"}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
