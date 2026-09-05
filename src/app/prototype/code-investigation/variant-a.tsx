// PROTOTYPE ONLY — VariantA: dense findings ledger. Throwaway.
"use client";

import { BASELINE, FINDINGS } from "./data";

export function VariantA() {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Prod LOC", String(BASELINE.prodLoc)],
          ["Files", String(BASELINE.prodFiles)],
          ["Prototype", String(BASELINE.prototypeLoc)],
          ["Target", `${BASELINE.expectedLow}–${BASELINE.expectedHigh}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="font-mono text-2xl font-bold tabular-nums text-zinc-50">{value}</p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
        <div className="grid grid-cols-[3rem_1fr_6rem_7rem] gap-2 border-b border-white/10 bg-black/40 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500 max-sm:grid-cols-[2.5rem_1fr_5rem]">
          <span>ID</span>
          <span>Finding</span>
          <span className="text-right">LOC</span>
          <span className="max-sm:hidden">Confidence</span>
        </div>
        {FINDINGS.map((finding) => (
          <div
            key={finding.id}
            className="grid grid-cols-[3rem_1fr_6rem_7rem] gap-2 border-b border-white/5 px-4 py-2.5 last:border-0 hover:bg-white/[0.02] max-sm:grid-cols-[2.5rem_1fr_5rem]"
          >
            <span className="font-mono text-[11px] font-bold text-accent-text">{finding.id}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-zinc-100">{finding.title}</span>
              <span className="block truncate font-mono text-[11px] text-zinc-500">{finding.files[0]}</span>
            </span>
            <span className="text-right font-mono text-[12px] tabular-nums text-zinc-300">{finding.loc}</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 max-sm:hidden">
              {finding.confidence}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[11px] text-zinc-600">
        A — Ledger: every finding in one scan. Full text lives in docs/code-reduction-modularisation-audit.md.
      </p>
    </div>
  );
}
