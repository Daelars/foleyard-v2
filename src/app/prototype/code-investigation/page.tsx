// PROTOTYPE ONLY — throwaway `/prototype/code-investigation` route (sub-shape B).
// Three variants of the code-reduction audit, switchable via `?variant=`.
// Durable record: docs/code-reduction-modularisation-audit.md.
"use client";

import { Suspense } from "react";
import { PrototypeSwitcher, usePrototypeVariant } from "@/components/PrototypeSwitcher";
import { BASELINE, FINDINGS } from "./data";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";

const VARIANTS = [
  { key: "A", name: "Ledger — every finding" },
  { key: "B", name: "Map — ownership before/after" },
  { key: "C", name: "Queue — work order" },
];

function CodeInvestigationContent() {
  const current = usePrototypeVariant(VARIANTS);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-canvas pb-24 font-sans text-zinc-100 antialiased">
      <p className="border-b border-white/10 bg-black/40 px-4 py-1.5 text-center font-mono text-[11px] text-accent-text">
        PROTOTYPE — throwaway code-investigation audit. Read-only. Nothing here changes the app.
      </p>

      <div className="mx-auto w-full max-w-5xl px-4 pt-8 md:px-6">
        <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">Code investigation</h1>
        <p className="mt-1.5 max-w-2xl text-sm font-medium text-zinc-400">
          {BASELINE.prodLoc.toLocaleString()} prod LOC across {BASELINE.prodFiles} files.{" "}
          {FINDINGS.length} findings. Realistic target{" "}
          {BASELINE.expectedLow.toLocaleString()}–{BASELINE.expectedHigh.toLocaleString()} (−9 to −13%).
          Full evidence in <code className="font-mono text-[12px] text-zinc-300">docs/code-reduction-modularisation-audit.md</code>.
        </p>

        <div className="mt-6">
          {current === "A" ? <VariantA /> : current === "B" ? <VariantB /> : <VariantC />}
        </div>
      </div>

      <PrototypeSwitcher variants={VARIANTS} current={current} />
    </div>
  );
}

export default function CodeInvestigationPage() {
  return (
    <Suspense>
      <CodeInvestigationContent />
    </Suspense>
  );
}
