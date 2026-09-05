// PROTOTYPE ONLY — VariantC: ordered work queue (do this first → last). Throwaway.
"use client";

import { FINDINGS, ORDER } from "./data";

export function VariantC() {
  return (
    <div className="space-y-2">
      {ORDER.map((group) => (
        <section key={group.step} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-baseline gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-fill/15 font-mono text-[13px] font-bold text-accent-text">
              {group.step}
            </span>
            <h2 className="text-[15px] font-semibold text-zinc-50">{group.name}</h2>
          </div>
          <div className="mt-3 space-y-1.5 pl-10">
            {group.ids.map((id) => {
              const finding = FINDINGS.find((item) => item.id === id);
              if (!finding) return null;
              return (
                <div key={id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inline-flex size-5 items-center justify-center rounded border border-white/15 text-[11px] text-zinc-500">
                    ☐
                  </span>
                  <span className="font-mono text-[11px] font-bold text-accent-text">{finding.id}</span>
                  <span className="min-w-0 flex-1 text-[13px] text-zinc-200">{finding.title}</span>
                  <span className="font-mono text-[11px] tabular-nums text-zinc-400">{finding.loc}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
                      finding.confidence === "CONFIRMED"
                        ? "bg-emerald-400/10 text-emerald-300"
                        : "bg-white/5 text-zinc-500"
                    }`}
                  >
                    {finding.confidence}
                  </span>
                </div>
              );
            })}
          </div>
          {group.step === 1 ? (
            <p className="mt-2 pl-10 text-[12px] text-zinc-500">
              Start here: safe deletions, no behaviour change. Check the box when the diff lands.
            </p>
          ) : null}
        </section>
      ))}
      <p className="font-mono text-[11px] text-zinc-600">
        C — Queue: the audit&apos;s §Recommended Order of Work as a checklist. Dependencies: steps 2 before 5.
      </p>
    </div>
  );
}
