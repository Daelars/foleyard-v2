// PROTOTYPE ONLY — throwaway `/prototype/auto-tag` route (sub-shape B).
// Three faces of the auto-tag v2 extension, switchable via `?variant=`.
// The extension content renders inside the real app chrome: IconRail, the
// library search header, and the production AudioPlayerShell on mock data.
"use client";

import { Suspense, useState } from "react";
import { Search } from "lucide-react";
import { AudioPlayerShell } from "@/components/AudioPlayer/player-shell";
import type { AudioPlayerFileRecord } from "@/components/AudioPlayer/types";
import { IconRail } from "@/components/IconRail";
import { PrototypeSwitcher, usePrototypeVariant } from "@/components/PrototypeSwitcher";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ARRIVAL_BATCH, INITIAL_FILES, INITIAL_RULES, withAutoTags } from "./data";
import type { MockFile, TagRule } from "./data";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";

const VARIANTS = [
  { key: "A", name: "Rules engine" },
  { key: "B", name: "Coverage board" },
  { key: "C", name: "Real v2 sidebar panel" },
];

const MOCK_PLAYER_FILE: AudioPlayerFileRecord = {
  id: "f10",
  filename: "whoosh_large_01.wav",
  path: "/mock-library/whoosh_large_01.wav",
  format: "wav",
  duration: 3.2,
  fileSize: 1024,
  isFavorite: false,
  tags: [{ id: "t-whoosh", name: "whoosh" }],
};

const MOCK_PEAKS: number[] = Array.from({ length: 180 }, (_, i) => 0.15 + 0.75 * Math.abs(Math.sin(i * 0.35)));

const noop = () => {};
const noopAsync = () => Promise.resolve();

function AutoTagContent() {
  const current = usePrototypeVariant(VARIANTS);
  const [files, setFiles] = useState<MockFile[]>(INITIAL_FILES);
  const [rules, setRules] = useState<TagRule[]>(INITIAL_RULES);
  const [autoOn, setAutoOn] = useState(true);
  const [scanned, setScanned] = useState(false);
  const [query, setQuery] = useState("");

  const simulateScan = () => {
    if (scanned) return;
    const ids = new Set(ARRIVAL_BATCH.map((file) => file.id));
    const landed = [...files, ...ARRIVAL_BATCH];
    setFiles(autoOn ? withAutoTags(landed, rules, ids) : landed);
    setScanned(true);
  };

  const addRule = (tok: string, tags: string[]) => {
    const cleanTok = tok.trim().toLowerCase();
    const cleanTags = tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
    if (!cleanTok || cleanTags.length === 0) return;
    setRules((prev) =>
      prev.some((rule) => rule.tok === cleanTok) ? prev : [...prev, { tok: cleanTok, tags: cleanTags }],
    );
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-canvas font-sans">
      <p className="relative border-b border-white/10 bg-black/40 px-4 py-1.5 text-center font-mono text-[11px] text-accent-text">
        PROTOTYPE — throwaway auto-tag v2 surfaces in the real app shell. Fake library data. Nothing here changes the app.
      </p>
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
          <header className="shrink-0 px-4 pt-4 md:px-5">
            <div className="flex items-center gap-3">
              <div className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 transition-all focus-within:border-accent-fill/60 focus-within:bg-white/[0.06] focus-within:shadow-glow-accent">
                <Search className="size-4 shrink-0 text-zinc-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search sounds by name, tag, or format..."
                  aria-label="Search sounds"
                  className="w-full bg-transparent py-2.5 text-[15px] font-medium text-zinc-50 placeholder:font-normal placeholder:text-zinc-600 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="shrink-0 rounded-md px-2 py-1 font-mono text-[11px] text-zinc-500 hover:text-zinc-100"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </header>

          <div className="px-4 pt-4 md:px-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">Auto tag</h1>
              <span className="flex-1" />
              <span className="font-mono text-[11px] text-zinc-500">
                {files.length} files · {rules.length} rules
              </span>
            </div>
            <p className="mt-1.5 text-sm font-medium text-zinc-400">
              Filename rules tag new arrivals while the switch is on. The board counts what the
              rules actually covered. The search box filters the rules below.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <Switch checked={autoOn} onCheckedChange={setAutoOn} aria-label="Auto-tag new files" />
              <span className="text-sm font-semibold text-zinc-100">
                {autoOn ? "Auto-tag on" : "Auto-tag off"}
              </span>
              <span className="flex-1" />
              <Button variant="outline" size="sm" onClick={simulateScan} disabled={scanned}>
                {scanned ? "Scan simulated" : "Simulate new scan (4 files)"}
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
            {current === "A" ? (
              <VariantA files={files} rules={rules} autoOn={autoOn} query={query} onAddRule={addRule} />
            ) : current === "B" ? (
              <VariantB files={files} rules={rules} query={query} />
            ) : (
              <VariantC files={files} rules={rules} />
            )}
          </div>
        </main>
      </div>

      <AudioPlayerShell
        collections={[]}
        currentTime={0}
        effectiveDuration={MOCK_PLAYER_FILE.duration ?? 0}
        file={MOCK_PLAYER_FILE}
        isMuted={false}
        isPlaying={false}
        autoplay={false}
        nextTitle={null}
        onAddToCollection={noopAsync}
        onClose={noop}
        onNext={noop}
        onPrev={noop}
        onSeek={noop}
        onToggleAutoplay={noop}
        onToggleFavorite={noopAsync}
        onToggleMuted={noop}
        onTogglePlayback={noop}
        onVolumeChange={noop}
        title={MOCK_PLAYER_FILE.filename}
        volume={0.8}
        waveformData={MOCK_PEAKS}
      />

      <PrototypeSwitcher variants={VARIANTS} current={current} />
    </div>
  );
}

export default function AutoTagPage() {
  return (
    <Suspense>
      <AutoTagContent />
    </Suspense>
  );
}
