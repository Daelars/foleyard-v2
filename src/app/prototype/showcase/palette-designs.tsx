"use client";

import { useState } from "react";
import {
  Archive,
  CornerDownLeft,
  Heart,
  Layers,
  Library,
  ListMusic,
  Music,
  Pause,
  Repeat,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  Star,
} from "lucide-react";

import { DEMO_SOUNDS, VariantFrame } from "./data";

type DemoRow = {
  label: string;
  group: string;
  tile: React.ReactNode;
  meta?: string;
};

const TILE = "flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-fill/12 text-accent-text";

const VIEW_ROWS: DemoRow[] = [
  { label: "Go to Library", group: "Views", tile: <span className={TILE}><Library className="size-4" /></span> },
  { label: "Go to Favorites", group: "Views", tile: <span className={TILE}><Star className="size-4" /></span> },
  { label: "Go to Shelf", group: "Views", tile: <span className={TILE}><ListMusic className="size-4" /></span> },
  { label: "Go to Extensions", group: "Views", tile: <span className={TILE}><Layers className="size-4" /></span> },
  { label: "Open settings", group: "Views", tile: <span className={TILE}><Settings className="size-4" /></span> },
];

const TRANSPORT_ROWS: DemoRow[] = [
  { label: "Pause", group: "Transport", tile: <span className={TILE}><Pause className="size-4" /></span> },
  { label: "Next in queue", group: "Transport", tile: <span className={TILE}><SkipForward className="size-4" /></span> },
  { label: "Previous in queue", group: "Transport", tile: <span className={TILE}><SkipBack className="size-4" /></span> },
  { label: "Autoplay on", group: "Transport", tile: <span className={TILE}><Repeat className="size-4" /></span> },
];

const FILE_ROWS: DemoRow[] = [
  { label: "Save current", group: "File", tile: <span className={TILE}><Heart className="size-4" /></span> },
  { label: "Add current file to shelf", group: "File", tile: <span className={TILE}><Archive className="size-4" /></span> },
];

const TOOL_ROWS: DemoRow[] = [
  { label: "Scan library", group: "Tools", tile: <span className={`${TILE} text-xs font-bold`}>FO</span> },
  { label: "Gather library", group: "Tools", tile: <span className={`${TILE} text-xs font-bold`}>LI</span> },
];

const SOUND_ROWS: DemoRow[] = DEMO_SOUNDS.slice(0, 4).map((sound) => ({
  label: sound.filename,
  group: "Sounds",
  meta: `${sound.format} · ${sound.duration}`,
  tile: (
    <span className={TILE}>
      <Music className="size-4" />
    </span>
  ),
}));

const ALL_ROWS = [...VIEW_ROWS, ...TRANSPORT_ROWS, ...FILE_ROWS, ...TOOL_ROWS, ...SOUND_ROWS];

function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/10 px-4">
      <Search className="size-4 shrink-0 text-zinc-500" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type a command or sound..."
        aria-label="Type a command or sound"
        className="w-full bg-transparent py-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
      />
      <kbd className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
        esc
      </kbd>
    </div>
  );
}

function FooterHints() {
  return (
    <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2 font-mono text-[10px] text-zinc-600">
      <span className="flex items-center gap-1.5">
        <kbd className="rounded border border-white/10 bg-white/5 px-1">↑↓</kbd> navigate
      </span>
      <span className="flex items-center gap-1.5">
        <kbd className="rounded border border-white/10 bg-white/5 px-1">↵</kbd> run
      </span>
      <span className="flex items-center gap-1.5">
        <kbd className="rounded border border-white/10 bg-white/5 px-1">esc</kbd> close
      </span>
    </div>
  );
}

function FlatRows({ rows, active }: { rows: DemoRow[]; active: number }) {
  return (
    <>
      {rows.map((row, i) => (
        <button
          key={row.label}
          type="button"
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${i === active ? "bg-accent-fill/15 text-accent-text" : "text-zinc-200"}`}
        >
          <span className="min-w-0 flex-1 truncate">{row.label}</span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            {row.meta ?? row.group}
          </span>
          {i === active ? <CornerDownLeft className="size-3.5 shrink-0" /> : null}
        </button>
      ))}
    </>
  );
}

function GroupedRows({ rows, active }: { rows: DemoRow[]; active: number }) {
  const withHeaders = rows.map((row, i) => ({
    row,
    header: i === 0 || rows[i - 1].group !== row.group ? row.group : null,
  }));
  return (
    <>
      {withHeaders.map(({ row, header }, i) => {
        return (
          <div key={row.label}>
            {header ? (
              <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                {header}
              </p>
            ) : null}
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors ${i === active ? "bg-accent-fill/15 text-accent-text" : "text-zinc-200"}`}
            >
              {row.tile}
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              {i === active ? <CornerDownLeft className="size-3.5 shrink-0" /> : null}
            </button>
          </div>
        );
      })}
    </>
  );
}

export function PaletteDesigns() {
  const [queryC, setQueryC] = useState("");
  const [activeC, setActiveC] = useState(1);
  const [activeE, setActiveE] = useState(0);
  const filteredC = ALL_ROWS.filter((row) =>
    row.label.toLowerCase().includes(queryC.trim().toLowerCase()),
  );
  const detailE = filteredC[Math.min(activeE, Math.max(0, filteredC.length - 1))];

  return (
    <div className="space-y-4">
      <VariantFrame id="P-A" name="Prototype flat list" note="Baseline: dense rows, mono hint tags, no icons.">
        <div className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-accent-fill/30 bg-shell/95 shadow-glow-overlay backdrop-blur-2xl">
          <SearchInput value="" onChange={() => {}} />
          <div className="max-h-80 overflow-y-auto p-1.5">
            <FlatRows rows={ALL_ROWS.slice(0, 9)} active={2} />
          </div>
        </div>
      </VariantFrame>

      <VariantFrame id="P-B" name="Tiles + sections" note="Current app direction: icon tiles, group headers, no hints.">
        <div className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-accent-fill/30 bg-shell/95 shadow-glow-overlay backdrop-blur-2xl">
          <SearchInput value="" onChange={() => {}} />
          <div className="max-h-80 overflow-y-auto p-1.5">
            <GroupedRows rows={ALL_ROWS.slice(0, 11)} active={0} />
          </div>
          <FooterHints />
        </div>
      </VariantFrame>

      <VariantFrame id="P-C" name="Two-pane browser" note="Live filter demo: groups left with counts, results right. Try typing.">
        <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-shell/95 shadow-2xl backdrop-blur-2xl">
          <SearchInput value={queryC} onChange={(value) => { setQueryC(value); setActiveC(0); }} />
          <div className="flex max-h-80">
            <div className="w-40 shrink-0 space-y-0.5 overflow-y-auto border-r border-white/10 p-1.5">
              {["Views", "Transport", "File", "Tools", "Sounds"].map((group) => {
                const count = filteredC.filter((row) => row.group === group).length;
                return (
                  <div
                    key={group}
                    className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-400"
                  >
                    {group}
                    <span className="font-mono text-[10px] tabular-nums text-zinc-600">{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto p-1.5">
              {filteredC.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-zinc-500">No matches.</p>
              ) : (
                filteredC.slice(0, 8).map((row, i) => (
                  <button
                    key={row.label}
                    type="button"
                    onMouseEnter={() => setActiveC(i)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors ${i === activeC ? "bg-accent-fill/15 text-accent-text" : "text-zinc-200"}`}
                  >
                    {row.tile}
                    <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <FooterHints />
        </div>
      </VariantFrame>

      <VariantFrame id="P-D" name="Quiet minimal" note="No accent chrome until selection: hairline border, calm rows, kbd run hint.">
        <div className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-shell/95 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center gap-3 border-b border-white/10 px-5">
            <Search className="size-4 shrink-0 text-zinc-500" />
            <input
              placeholder="Type a command or sound..."
              aria-label="Type a command or sound"
              className="w-full bg-transparent py-4 text-[15px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {ALL_ROWS.slice(0, 7).map((row, i) => (
              <button
                key={row.label}
                type="button"
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${i === 2 ? "bg-white/[0.07] text-zinc-50 ring-1 ring-inset ring-white/10" : "text-zinc-300 hover:bg-white/[0.04]"}`}
              >
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                {i === 2 ? (
                  <kbd className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                    ↵
                  </kbd>
                ) : (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                    {row.group}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </VariantFrame>

      <VariantFrame id="P-E" name="Result preview" note="Right detail card explains the highlighted command before running.">
        <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-accent-fill/30 bg-shell/95 shadow-glow-overlay backdrop-blur-2xl">
          <SearchInput value="" onChange={() => {}} />
          <div className="flex max-h-80">
            <div className="min-w-0 flex-1 overflow-y-auto p-1.5">
              {ALL_ROWS.slice(0, 7).map((row, i) => (
                <button
                  key={row.label}
                  type="button"
                  onMouseEnter={() => setActiveE(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors ${i === activeE ? "bg-accent-fill/15 text-accent-text" : "text-zinc-200"}`}
                >
                  {row.tile}
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                </button>
              ))}
            </div>
            <div className="hidden w-56 shrink-0 flex-col border-l border-white/10 p-4 sm:flex">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                {detailE?.group}
              </span>
              <p className="mt-1 text-sm font-semibold text-zinc-100">{detailE?.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Runs immediately on select. Hover another row to preview it here first.
              </p>
              <span className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-accent-fill px-3 py-2 text-xs font-semibold text-white">
                Run command <CornerDownLeft className="size-3.5" />
              </span>
            </div>
          </div>
          <FooterHints />
        </div>
      </VariantFrame>
    </div>
  );
}
