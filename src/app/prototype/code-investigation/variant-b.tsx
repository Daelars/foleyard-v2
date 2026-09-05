// PROTOTYPE ONLY — VariantB: module ownership map (before → after). Throwaway.
"use client";

const LANES = [
  {
    name: "App shell",
    before: ["page.tsx 2,492 — views, fetch, 74 handlers, 12 dialogs"],
    after: ["page.tsx ~350 shell", "_library / _collections / _shelf / _extensions hooks"],
  },
  {
    name: "Settings",
    before: ["SettingsDialog.tsx 1,828 — 6 tabs + drop-rules + extensions"],
    after: ["settings/ shell + 6 panels", "NamedEntityRow (3 confirm clones → 1)"],
  },
  {
    name: "API routes (29)",
    before: ["11 epilogues + 6 guards pasted per route"],
    after: ["extensions/_shared.ts: outcome + 4 guards", "routes call helpers"],
  },
  {
    name: "Data",
    before: ["5 file shapes · 4 KV stores · 2 DB wirings"],
    after: ["YardFile · settings-kv.ts · one wiring"],
  },
  {
    name: "yard-core",
    before: ["extensions/ 15 files, 7 one-liners, wildcard barrels"],
    after: ["extension-model.ts + 4 behavioural files", "explicit exports"],
  },
  {
    name: "Keep intact",
    before: ["scanner · FileTable/AudioPlayer splits · yard-tools/*"],
    after: ["No change — cohesive / load-bearing"],
  },
];

export function VariantB() {
  return (
    <div>
      <div className="grid gap-2 md:grid-cols-2">
        {LANES.map((lane) => (
          <div key={lane.name} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent-text">{lane.name}</p>
            <div className="mt-2 space-y-1.5">
              {lane.before.map((line) => (
                <p key={line} className="rounded-lg border border-red-400/20 bg-red-400/[0.06] px-2.5 py-1.5 text-[12px] leading-snug text-zinc-300">
                  <span className="mr-1.5 font-mono text-[10px] font-bold text-red-300">BEFORE</span>
                  {line}
                </p>
              ))}
              {lane.after.map((line) => (
                <p key={line} className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-1.5 text-[12px] leading-snug text-zinc-200">
                  <span className="mr-1.5 font-mono text-[10px] font-bold text-emerald-300">AFTER</span>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[11px] text-zinc-600">
        B — Map: where ownership moves. Real trees in the audit doc §Proposed Target Structure.
      </p>
    </div>
  );
}
