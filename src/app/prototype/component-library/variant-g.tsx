// PROTOTYPE ONLY — variant G, "alive controls". Identical grid, palette, and
// dark-acrylic visuals to variant F; the difference is micro-interaction on
// the elements themselves: buttons lift on hover and squash on press, icon
// buttons pop their glyph, switch thumbs travel on a spring, checks draw in,
// radio dots pop, progress shimmers. Nothing page-level animates. Element
// components live in ./variant-g-kit; everything else is shared D kit.
"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Command,
  Download,
  Ellipsis,
  FileMusic,
  Heart,
  Library,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
import type { PaletteSection as PaletteSectionName } from "@/components/CommandPalette/command-palette";

import { SPECIMEN_COMMANDS } from "./fixtures";
import type { SpecimenState } from "./page";
import {
  DAIScore,
  DAlert,
  DCard,
  DCommandFooter,
  DCommandPanel,
  DCommandRow,
  DCommandSection,
  DField,
  DKbd,
  DPageButton,
  DSelect,
  DStatusBadge,
  DSurface,
  DTag,
  DTooltipBubble,
} from "./variant-d-kit";
import {
  GButton,
  GCheckbox,
  GIconButton,
  GKeyframes,
  GProgress,
  GRadio,
  GSwitch,
} from "./variant-g-kit";

const SECTION_ICONS: Record<PaletteSectionName, React.ReactNode> = {
  view: <Library />,
  transport: <Play />,
  sound: <AudioLines />,
  tool: <Sparkles />,
  file: <FileMusic />,
};

function SectionedRows({
  query,
  activeIndex,
  onHover,
  onSelect,
  emptyText,
  listbox = false,
}: {
  query: string;
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (index: number) => void;
  emptyText: string;
  /** Overlay only: expose listbox semantics. The card preview is illustrative. */
  listbox?: boolean;
}) {
  const filtered = SPECIMEN_COMMANDS.filter((entry) =>
    entry.label.toLowerCase().includes(query.toLowerCase()),
  );
  if (filtered.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-zinc-500">{emptyText}</p>;
  }
  return (
    <>
      {filtered.map((entry, index) => {
        const newSection = index === 0 || filtered[index - 1].section !== entry.section;
        return (
          <div key={entry.id}>
            {newSection ? <DCommandSection>{entry.section}</DCommandSection> : null}
            <DCommandRow
              id={listbox ? `command-palette-entry-g-${index}` : undefined}
              role={listbox ? "option" : undefined}
              aria-selected={listbox ? index === activeIndex : undefined}
              active={index === activeIndex}
              icon={SECTION_ICONS[entry.section]}
              onClick={() => onSelect(index)}
              onMouseEnter={() => onHover(index)}
            >
              {entry.label}
            </DCommandRow>
          </div>
        );
      })}
    </>
  );
}

export function VariantG({ settings, onToggleSetting }: SpecimenState) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [filter, setFilter] = useState("untagged");
  const [tagFilter, setTagFilter] = useState("all");
  const [semantic, setSemantic] = useState(true);
  const [page, setPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = SPECIMEN_COMMANDS.filter((entry) =>
    entry.label.toLowerCase().includes(query.toLowerCase()),
  );
  const activeIndex = Math.min(active, Math.max(0, filtered.length - 1));

  const openPalette = () => {
    setPaletteOpen(true);
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    if (!paletteOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPaletteOpen(false);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => Math.min(index + 1, filtered.length - 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter" && filtered[activeIndex]) setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, filtered, paletteOpen]);

  return (
    <DSurface className="relative min-h-full overflow-x-clip bg-[#0a0a0e]">
      <GKeyframes />
      {/* Faint red ambience at the frame edges, as in the mockup. */}
      <span aria-hidden className="pointer-events-none absolute -left-24 top-1/3 size-72 rounded-full bg-[color-mix(in_oklab,var(--accent-fill)_7%,transparent)] blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -right-24 top-0 size-80 rounded-full bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] blur-3xl" />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4 pb-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent-text">
              Foleyard / Components
            </p>
            <h1 className="mt-1.5 text-[32px] font-semibold leading-tight tracking-tight text-zinc-50">
              Component library
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Variant G — F&rsquo;s grid with alive controls. Press the buttons,
              flip the switches: the motion is in the elements.
            </p>
          </div>
          <GButton tone="secondary" onClick={openPalette}>
            <DKbd>
              <Command />
            </DKbd>
            Open command palette
          </GButton>
        </header>

        <div className="grid grid-cols-12 gap-4">
          <DCard
            title="Buttons"
            sub="Primary, secondary, and ghost buttons."
            glow="tl"
            className="col-span-12 lg:col-span-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <GButton tone="primary">
                <AudioLines />
                Analyze with CLAP
              </GButton>
              <GButton tone="secondary">
                <Workflow />
                Filename rules
              </GButton>
              <GButton tone="secondary" size="icon" aria-label="Download model">
                <Download />
              </GButton>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <GButton tone="secondary">
                <Download />
                Download model
              </GButton>
              <GButton tone="secondary">Cancel</GButton>
              <GButton tone="danger">Delete</GButton>
            </div>
          </DCard>

          <DCard
            title="Button States"
            sub="Default, hover, active, disabled, loading."
            glow="tr"
            className="col-span-12 lg:col-span-8"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  { label: "Default", look: "default" as const, caption: "Default" },
                  { label: "Hover", look: "hover" as const, caption: "Hover" },
                  { label: "Active", look: "active" as const, caption: "Active" },
                ] as const
              ).map((state) => (
                <div key={state.label} className="flex flex-col items-center gap-2">
                  <GButton tone="primary" look={state.look} className="w-full">
                    <AudioLines />
                    Analyze with CLAP
                  </GButton>
                  <span className="text-xs text-zinc-500">{state.caption}</span>
                </div>
              ))}
              <div className="flex flex-col items-center gap-2">
                <GButton tone="primary" loading className="w-full">
                  Analyzing…
                </GButton>
                <span className="text-xs text-zinc-500">Loading</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <GButton tone="primary" disabled className="w-full">
                  <AudioLines />
                  Analyze with CLAP
                </GButton>
                <span className="text-xs text-zinc-500">Disabled</span>
              </div>
            </div>
          </DCard>

          <DCard title="Input Fields" sub="Text inputs, search, and selects." className="col-span-12 md:col-span-6 lg:col-span-4">
            <div className="grid gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <DField className="pl-9 pr-16" placeholder="Search sounds by name, tag, or format…" aria-label="Search sounds" />
                <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
                  <DKbd>
                    <Command />
                  </DKbd>
                  <DKbd>K</DKbd>
                </span>
              </div>
              <DField placeholder="Invalid path" aria-invalid aria-label="Invalid path" defaultValue="Invalid path" />
              <DSelect
                label="Tag filter"
                value={tagFilter}
                onChange={setTagFilter}
                options={[
                  { value: "all", label: "All tags" },
                  { value: "weather", label: "Weather" },
                  { value: "impact", label: "Impact" },
                ]}
                menuClassName="[animation:g-menu-in_0.14s_ease-out] motion-reduce:[animation:none]"
              />
            </div>
          </DCard>

          <DCard title="Toggles & Switches" sub="Switch, checkbox, and radio inputs." className="col-span-12 md:col-span-6 lg:col-span-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="grid gap-3">
                <span className="flex items-center gap-2.5">
                  <GSwitch label="Auto-tag new files" checked={settings.autoTag} onCheckedChange={() => onToggleSetting("autoTag")} />
                  <span className="text-[13px] text-zinc-300">Auto-tag new files</span>
                </span>
                <span className="flex items-center gap-2.5">
                  <GSwitch label="Folder Janitor" checked={settings.janitor} onCheckedChange={() => onToggleSetting("janitor")} />
                  <span className="text-[13px] text-zinc-300">Folder Janitor</span>
                </span>
                <GCheckbox label="Enable semantic tagging" checked={semantic} onChange={setSemantic} />
                <GCheckbox label="Show waveform previews" checked={false} onChange={() => {}} />
              </div>
              <div className="grid content-start gap-3">
                <GRadio name="g-filter" label="All files" checked={filter === "all"} onChange={() => setFilter("all")} />
                <GRadio name="g-filter" label="Untagged only" checked={filter === "untagged"} onChange={() => setFilter("untagged")} />
                <GRadio name="g-filter" label="Custom filter" checked={filter === "custom"} onChange={() => setFilter("custom")} />
              </div>
            </div>
          </DCard>

          <DCard title="Badges" sub="Status and category badges." className="col-span-12 lg:col-span-4">
            <div className="flex flex-wrap gap-2">
              <DStatusBadge status="Ready" tone="ready" />
              <DStatusBadge status="Processing" tone="processing" />
              <DStatusBadge status="Unavailable" tone="unavailable" />
              <DStatusBadge status="Error" tone="error" />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <DTag>#thunder</DTag>
              <DTag>#weather</DTag>
              <DTag>#impact</DTag>
              <DAIScore>AI 0.92</DAIScore>
            </div>
          </DCard>

          <DCard title="Icon Buttons" sub="Common actions." className="col-span-12 sm:col-span-4 lg:col-span-2">
            <div className="grid max-w-40 grid-cols-3 gap-2">
              <GIconButton label="Play">
                <Play />
              </GIconButton>
              <GIconButton label="Favorite">
                <Heart />
              </GIconButton>
              <GIconButton label="More actions">
                <Ellipsis />
              </GIconButton>
              <GIconButton label="Download">
                <Download />
              </GIconButton>
              <GIconButton label="Adjust">
                <SlidersHorizontal />
              </GIconButton>
              <GIconButton label="Delete" tone="danger">
                <Trash2 />
              </GIconButton>
            </div>
          </DCard>

          <DCard title="File Row" sub="List item example." className="col-span-12 sm:col-span-8 lg:col-span-6">
            <div className="flex items-center gap-3 rounded-lg border border-[var(--d-edge)] bg-black/25 p-3 shadow-[var(--d-lift)]">
              <GButton tone="secondary" size="icon" aria-label="Play rain_hit_deep_stereo_04.wav">
                <Play />
              </GButton>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">
                  rain_hit_deep_stereo_04.wav
                </p>
                <p className="mt-1 font-mono text-[11px] text-zinc-500">WAV · 00:04 · 48 kHz</p>
              </div>
              <div className="hidden flex-wrap justify-end gap-1.5 min-[420px]:flex">
                <DTag>#weather</DTag>
                <DAIScore>#impact</DAIScore>
                <DTag>#thunder</DTag>
                <DAIScore>AI 0.92</DAIScore>
              </div>
              <GButton tone="ghost" size="icon" aria-label="More actions">
                <Ellipsis />
              </GButton>
            </div>
          </DCard>

          <DCard title="Dropdown / Command" sub="Sectioned palette with shortcut footer." className="col-span-12 lg:col-span-4">
            <DCommandPanel>
              <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-3">
                <Search className="size-4 shrink-0 text-zinc-500" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  placeholder="Type a command or sound…"
                  aria-label="Type a command or sound"
                  className="h-10 w-full bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <DKbd>esc</DKbd>
              </div>
              <div className="grid max-h-64 gap-0.5 overflow-y-auto p-1.5">
                <SectionedRows
                  query={query}
                  activeIndex={activeIndex}
                  onHover={setActive}
                  onSelect={setActive}
                  emptyText="No matches."
                />
              </div>
              <DCommandFooter count={filtered.length} />
            </DCommandPanel>
          </DCard>

          <DCard title="Progress" sub="Progress bar and stats." className="col-span-12 sm:col-span-5 lg:col-span-3">
            <GProgress percent={5} top="Tagging progress" bottom="785/16,032 tagged · 15,247 to go" />
          </DCard>

          <DCard title="Alerts" sub="Info, success, warning, error." className="col-span-12 sm:col-span-7 lg:col-span-4">
            <div className="grid gap-2">
              <DAlert
                tone="warning"
                monoTitle
                title="What changed — queue collapsed, origins tab removed"
                body="Queue: one summary (23) with the top 3 and a Show all expander."
              />
              <DAlert
                tone="error"
                title="Invalid path"
                body="The specified directory could not be found."
              />
            </div>
          </DCard>

          <DCard title="Pagination" sub="Simple pagination." className="col-span-12 sm:col-span-7 lg:col-span-3">
            <div className="flex items-center gap-1.5">
              <GButton tone="secondary" size="icon" className="size-8" aria-label="Previous page" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="size-3.5" />
              </GButton>
              {[1, 2, 3].map((n) => (
                <DPageButton key={n} label={String(n)} active={n === page} onClick={() => setPage(n)} />
              ))}
              <span className="px-0.5 font-mono text-xs text-zinc-600">…</span>
              <DPageButton label="24" active={page === 24} onClick={() => setPage(24)} />
              <GButton tone="secondary" size="icon" className="size-8" aria-label="Next page" onClick={() => setPage((p) => (p >= 3 ? 24 : p + 1))}>
                <ChevronRight className="size-3.5" />
              </GButton>
            </div>
          </DCard>

          <DCard title="Tooltip" sub="Hover info." className="col-span-12 flex flex-col sm:col-span-5 lg:col-span-2">
            <div className="flex flex-1 flex-col items-center justify-end gap-0 pb-1 pt-6">
              <DTooltipBubble>Run filename rules</DTooltipBubble>
              <GIconButton label="Run filename rules">
                <SlidersHorizontal />
              </GIconButton>
            </div>
          </DCard>
        </div>
      </div>

      {paletteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setPaletteOpen(false)}
        >
          <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <DCommandPanel>
              <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4">
                <Search className="size-4 shrink-0 text-zinc-500" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  placeholder="Type a command or sound…"
                  aria-label="Type a command or sound"
                  aria-controls="command-palette-results-g"
                  aria-activedescendant={
                    activeIndex >= 0 ? `command-palette-entry-g-${activeIndex}` : undefined
                  }
                  className="h-12 w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <DKbd>esc</DKbd>
              </div>
              <div
                id="command-palette-results-g"
                role="listbox"
                aria-label="Command results"
                className="grid max-h-80 gap-0.5 overflow-y-auto p-1.5"
              >
                <SectionedRows
                  query={query}
                  activeIndex={activeIndex}
                  onHover={setActive}
                  onSelect={() => setPaletteOpen(false)}
                  emptyText="No matches."
                  listbox
                />
              </div>
              <DCommandFooter count={filtered.length} />
            </DCommandPanel>
          </div>
        </div>
      ) : null}
    </DSurface>
  );
}
