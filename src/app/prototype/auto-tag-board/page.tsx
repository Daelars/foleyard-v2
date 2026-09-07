// PROTOTYPE ONLY — throwaway `/prototype/auto-tag-board` route.
// The coverage board as a shipped-looking surface: no captions, no counters
// in the chrome, just the board. Reuses the auto-tag mock data.
"use client";

import { Suspense, useState } from "react";
import { IconRail } from "@/components/IconRail";
import { PrototypeSwitcher, usePrototypeVariant } from "@/components/PrototypeSwitcher";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  ARRIVAL_BATCH,
  INITIAL_FILES,
  INITIAL_RULES,
  withAutoTags,
} from "../auto-tag/data";
import type { MockFile, TagRule } from "../auto-tag/data";
import { VariantConsole } from "./variant-console";
import { VariantOrigins } from "./variant-origins";

const VARIANTS = [
  { key: "board", name: "Coverage board" },
  { key: "origins", name: "Tag origins" },
];

const noop = () => {};

function BoardContent() {
  const current = usePrototypeVariant(VARIANTS);
  const [files, setFiles] = useState<MockFile[]>(INITIAL_FILES);
  const [rules] = useState<TagRule[]>(INITIAL_RULES);
  const [autoOn, setAutoOn] = useState(true);
  const [scanned, setScanned] = useState(false);
  const [postScanTotals, setPostScanTotals] = useState<number[]>([]);

  const simulateScan = () => {
    if (scanned) return;
    const ids = new Set(ARRIVAL_BATCH.map((file) => file.id));
    const landed = [...files, ...ARRIVAL_BATCH];
    const next = autoOn ? withAutoTags(landed, rules, ids) : landed;
    setFiles(next);
    setPostScanTotals([next.filter((file) => file.tags.length > 0).length]);
    setScanned(true);
  };

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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-50">Coverage</h1>
              <span className="flex-1" />
              <label className="flex items-center gap-2 text-[12px] text-zinc-400">
                Auto-tag new files
                <Switch checked={autoOn} onCheckedChange={setAutoOn} aria-label="Auto-tag new files" />
              </label>
              <Button variant="outline" size="sm" onClick={simulateScan} disabled={scanned}>
                {scanned ? "Scan simulated" : "Simulate scan"}
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
            {current === "origins" ? (
              <VariantOrigins files={files} rules={rules} />
            ) : (
              <VariantConsole files={files} rules={rules} extraTotals={postScanTotals} />
            )}
          </div>
        </main>
      </div>
      <PrototypeSwitcher variants={VARIANTS} current={current} />
    </div>
  );
}

export default function AutoTagBoardPage() {
  return (
    <Suspense>
      <BoardContent />
    </Suspense>
  );
}
