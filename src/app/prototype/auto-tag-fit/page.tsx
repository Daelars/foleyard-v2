// PROTOTYPE ONLY — throwaway `/prototype/auto-tag-fit` route.
// Question: the auto-tag board's origin-filter pills, queue promote/dismiss
// chips, and the filename-rules / semantic run panels don't fit the rest of
// the page — what should they look like?
// Four variants, switchable via ?variant= : "current" reproduces the shipped
// UI with numbered findings; "system", "passes", "command", "compact",
// "pinned" and "minimal" are structurally different fixes. Static chrome, mock data, no mutations.
"use client";

import { Suspense } from "react";

import { IconRail } from "@/components/IconRail";
import { PrototypeSwitcher, usePrototypeVariant } from "@/components/PrototypeSwitcher";
import { VariantCommand } from "./variant-command";
import { VariantCompact } from "./variant-compact";
import { VariantCurrent } from "./variant-current";
import { VariantMinimal } from "./variant-minimal";
import { VariantPasses } from "./variant-passes";
import { VariantPinned } from "./variant-pinned";
import { VariantSystem } from "./variant-system";

const VARIANTS = [
  { key: "current", name: "Current — annotated findings" },
  { key: "system", name: "Quiet system" },
  { key: "passes", name: "Tagging passes" },
  { key: "command", name: "Command bar" },
  { key: "pinned", name: "Pinned bar under tabs" },
  { key: "minimal", name: "Minimal — collapsed queue, no origins tab" },
  { key: "compact", name: "Compact — one viewport" },
];

const noop = () => {};

function FitContent() {
  const current = usePrototypeVariant(VARIANTS);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-canvas font-sans">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--accent-fill)_13%,transparent),transparent_38%),radial-gradient(circle_at_bottom_right,color-mix(in_oklab,var(--accent-fill)_6%,transparent),transparent_40%)]" />
      <div className="relative flex min-h-0 flex-1">
        <IconRail
          className="hidden md:flex"
          activeView="library"
          favoritesCount={0}
          shelfCount={0}
          onSelectLibrary={noop}
          onSelectFavorites={noop}
          onSelectShelf={noop}
          onSelectExtensions={noop}
          onSelectOrganize={noop}
          onOpenSettings={noop}
        />

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
          <div className="px-4 pt-4 md:px-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-50">Auto Tag</h1>
              <span className="font-mono text-[11px] text-zinc-600">
                fit pass · static chrome · mock data
              </span>
            </div>
            {/* Each variant renders its own Coverage / Tag origins workspace
                tabs (the redesigns) or the live board's tabs (current). */}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-28 md:px-5">
            {current === "system" && <VariantSystem />}
            {current === "passes" && <VariantPasses />}
            {current === "command" && <VariantCommand />}
            {current === "pinned" && <VariantPinned />}
            {current === "minimal" && <VariantMinimal />}
            {current === "compact" && <VariantCompact />}
            {current === "current" && <VariantCurrent />}
          </div>
        </main>
      </div>
      <PrototypeSwitcher variants={VARIANTS} current={current} />
    </div>
  );
}

export default function AutoTagFitPage() {
  return (
    <Suspense>
      <FitContent />
    </Suspense>
  );
}
