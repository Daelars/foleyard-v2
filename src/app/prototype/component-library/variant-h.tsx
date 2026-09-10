// PROTOTYPE ONLY — variant H, "the rest of the app". G's full grid plus the
// production components G never showed: tabs, sliders, dialog, menu, toasts,
// icon rail, transport waveform, and accordion. Same dark-acrylic language,
// same element motion. New pieces live in ./variant-h-kit.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Command,
  Copy,
  Download,
  Ellipsis,
  FileMusic,
  FolderOpen,
  FolderPlus,
  Heart,
  Layers,
  Library,
  ListMusic,
  Monitor,
  Pause,
  Play,
  Plus,
  Repeat,
  Search,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  Workflow,
  X,
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
import {
  HAccordion,
  HKeyframes,
  HMenu,
  HMenuItem,
  HMenuSeparator,
  HRail,
  HScrubber,
  HSlider,
  HTabPanel,
  HTabs,
  HToast,
} from "./variant-h-kit";

const SECTION_ICONS: Record<PaletteSectionName, React.ReactNode> = {
  view: <Library />,
  transport: <Play />,
  sound: <AudioLines />,
  tool: <Sparkles />,
  file: <FileMusic />,
};

const PEAKS: ReadonlyArray<number> = Array.from({ length: 64 }, (_, i) =>
  Math.min(1, 0.22 + 0.72 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23))),
);

function fmtTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type QueueTrack = { filename: string; meta: string; duration: number };

const QUEUE: QueueTrack[] = [
  { filename: "rain_hit_deep_stereo_04.wav", meta: "WAV · 48 kHz", duration: 4 },
  { filename: "whoosh_large_01.wav", meta: "WAV · 48 kHz", duration: 3 },
  { filename: "foley_cloth_rustle_take12.wav", meta: "WAV · 96 kHz", duration: 6 },
];

const SHELF_COLLECTIONS = [
  { id: "c-rain", name: "Rain & weather", fileCount: 48 },
  { id: "c-ui", name: "UI clicks", fileCount: 112 },
  { id: "c-untagged", name: "Untagged", smart: true },
];

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
              id={listbox ? `command-palette-entry-h-${index}` : undefined}
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

type ToastSpec = { id: string; tone: "success" | "error" | "info"; title: string; message: string };

const INITIAL_TOASTS: ToastSpec[] = [
  {
    id: "t-scan",
    tone: "success",
    title: "Filename rules finished",
    message: "Tagged 12 files with 98% confidence.",
  },
  {
    id: "t-locked",
    tone: "error",
    title: "Failed to load library",
    message: "foleyard.sqlite is locked by another process.",
  },
  { id: "t-started", tone: "info", title: "Scan started", message: "Watching 3 roots for new sounds." },
];

export function VariantH({ settings, onToggleSetting }: SpecimenState) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [filter, setFilter] = useState("untagged");
  const [tagFilter, setTagFilter] = useState("all");
  const [semantic, setSemantic] = useState(true);
  const [page, setPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  // H-only specimen state.
  const [tabValue, setTabValue] = useState("library");
  const [extensionsOn, setExtensionsOn] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuFav, setMenuFav] = useState(true);
  const [toasts, setToasts] = useState<ToastSpec[]>(INITIAL_TOASTS);
  const [railView, setRailView] = useState("library");
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(1.2);
  const [trackIdx, setTrackIdx] = useState(0);
  const [favs, setFavs] = useState<Record<number, boolean>>({ 0: true });
  const [autoplay, setAutoplay] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [collOpen, setCollOpen] = useState(false);
  const [collPos, setCollPos] = useState<{ top: number; left: number } | null>(null);
  const collTriggerRef = useRef<HTMLButtonElement>(null);
  const collMenuRef = useRef<HTMLDivElement>(null);

  const track: QueueTrack = QUEUE[trackIdx] ?? QUEUE[0] ?? {
    filename: "rain_hit_deep_stereo_04.wav",
    meta: "WAV · 48 kHz",
    duration: 4,
  };
  const nextTrack: QueueTrack | undefined = QUEUE[(trackIdx + 1) % QUEUE.length];
  const trackFav = favs[trackIdx] ?? false;
  const peaks = PEAKS.map((_, i) => PEAKS[(i + trackIdx * 11) % PEAKS.length] ?? 0.3);

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

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setElapsed((value) =>
        value + 0.1 >= track.duration ? 0 : +(value + 0.1).toFixed(2),
      );
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, track.duration]);

  const stepTrack = (delta: 1 | -1) => {
    setTrackIdx((index) => (index + delta + QUEUE.length) % QUEUE.length);
    setElapsed(0);
  };

  const measureCollMenu = useCallback(() => {
    const trigger = collTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setCollPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 240) });
  }, []);

  useEffect(() => {
    if (!collOpen) return;
    measureCollMenu();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!collTriggerRef.current?.contains(target) && !collMenuRef.current?.contains(target)) {
        setCollOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCollOpen(false);
        collTriggerRef.current?.focus();
      }
    };
    const onReposition = () => measureCollMenu();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [collOpen, measureCollMenu]);

  return (
    <DSurface className="relative min-h-full overflow-x-clip bg-[#0a0a0e]">
      <GKeyframes />
      <HKeyframes />
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
              Variant H — G&rsquo;s grid plus the rest of the app: tabs, sliders,
              dialog, menu, toasts, rail, transport, accordion.
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
                <GRadio name="h-filter" label="All files" checked={filter === "all"} onChange={() => setFilter("all")} />
                <GRadio name="h-filter" label="Untagged only" checked={filter === "untagged"} onChange={() => setFilter("untagged")} />
                <GRadio name="h-filter" label="Custom filter" checked={filter === "custom"} onChange={() => setFilter("custom")} />
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

          <DCard title="Tabs" sub="Settings and board tab bars." className="col-span-12 lg:col-span-5">
            <HTabs
              label="Specimen tabs"
              value={tabValue}
              onChange={setTabValue}
              tabs={[
                { value: "library", label: "Library", icon: <FolderOpen /> },
                { value: "collections", label: "Collections", icon: <ListMusic /> },
                { value: "extensions", label: "Extensions", icon: <Layers /> },
              ]}
            />
            <div className="mt-3">
              {tabValue === "library" ? (
                <HTabPanel tabKey="library">
                  <p className="text-[13px] text-zinc-300">
                    8,900 files · 214 MB · 3 scan roots
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-zinc-500">
                    Last scan 2 min ago · 0 errors
                  </p>
                </HTabPanel>
              ) : null}
              {tabValue === "collections" ? (
                <HTabPanel tabKey="collections">
                  <div className="grid gap-1.5">
                    {[
                      ["Rain & weather", "48 sounds"],
                      ["UI clicks", "112 sounds"],
                    ].map(([name, count]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-md border border-[var(--d-edge)] bg-black/25 px-2.5 py-2"
                      >
                        <span className="text-[13px] text-zinc-200">{name}</span>
                        <span className="font-mono text-[11px] text-zinc-500">{count}</span>
                      </div>
                    ))}
                  </div>
                </HTabPanel>
              ) : null}
              {tabValue === "extensions" ? (
                <HTabPanel tabKey="extensions">
                  <span className="flex items-center justify-between gap-3 rounded-md border border-[var(--d-edge)] bg-black/25 px-2.5 py-2">
                    <span className="text-[13px] text-zinc-200">Auto-tag v2</span>
                    <GSwitch label="Auto-tag v2" checked={extensionsOn} onCheckedChange={setExtensionsOn} />
                  </span>
                </HTabPanel>
              ) : null}
            </div>
          </DCard>

          <DCard title="Sliders" sub="Volume and zoom controls." className="col-span-12 md:col-span-6 lg:col-span-4">
            <div className="grid gap-4">
              <div className="flex items-center gap-1">
                <GButton
                  tone="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={muted || volume === 0 ? "Unmute audio" : "Mute audio"}
                  onClick={() => setMuted((value) => !value)}
                >
                  {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
                </GButton>
                <div className="min-w-0 flex-1">
                  <HSlider
                    label="Volume"
                    value={muted ? 0 : volume}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(next) => {
                      setVolume(next);
                      if (next > 0) setMuted(false);
                    }}
                    formatValue={(next) => `${Math.round(next * 100)}%`}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Monitor aria-hidden className="size-4 shrink-0 text-zinc-500" />
                <div className="min-w-0 flex-1">
                  <HSlider
                    label="Interface zoom"
                    value={zoom}
                    min={50}
                    max={200}
                    step={5}
                    onChange={setZoom}
                    formatValue={(next) => `${Math.round(next)}%`}
                  />
                </div>
              </div>
              <p className="font-mono text-[10.5px] text-zinc-600">
                Drag, or focus and use ← → · Home · End
              </p>
            </div>
          </DCard>

          <DCard title="Icon Rail" sub="App navigation tiles." className="col-span-12 md:col-span-6 lg:col-span-3">
            <div className="flex justify-center">
              <HRail view={railView} onChange={setRailView} favorites={12} shelf={3} />
            </div>
          </DCard>

          <DCard title="Dialog" sub="Confirmation overlay." className="col-span-12 md:col-span-6 lg:col-span-4">
            <p className="text-[13px] leading-relaxed text-zinc-400">
              Removing a scan root drops its index entries. Files stay on disk.
            </p>
            <div className="mt-3">
              <GButton tone="danger" onClick={() => setDialogOpen(true)}>
                <Trash2 />
                Remove root…
              </GButton>
            </div>
          </DCard>

          <DCard title="Menu" sub="File-row context actions." className="col-span-12 md:col-span-6 lg:col-span-4">
            <HMenu label="rain_hit_deep_stereo_04.wav">
              <HMenuItem icon={<Copy />} onClick={() => {}}>
                Copy path
              </HMenuItem>
              <HMenuItem icon={<Heart />} checked={menuFav} onClick={() => setMenuFav((value) => !value)}>
                Favorite
              </HMenuItem>
              <HMenuItem icon={<ListMusic />} onClick={() => {}}>
                Add to Shelf
              </HMenuItem>
              <HMenuSeparator />
              <HMenuItem icon={<Trash2 />} danger onClick={() => {}}>
                Remove from library
              </HMenuItem>
            </HMenu>
          </DCard>

          <DCard title="Toasts" sub="Scan and collection feedback." className="col-span-12 lg:col-span-4">
            {toasts.length > 0 ? (
              <div className="grid gap-2">
                {toasts.map((toast) => (
                  <HToast
                    key={toast.id}
                    tone={toast.tone}
                    title={toast.title}
                    message={toast.message}
                    onDismiss={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-600">All caught up.</p>
                <GButton tone="secondary" size="sm" onClick={() => setToasts(INITIAL_TOASTS)}>
                  Replay
                </GButton>
              </div>
            )}
          </DCard>

          <DCard title="Transport" sub="Player shell, redesigned." className="col-span-12 lg:col-span-7">
            {dismissed ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--d-edge-hi)] px-3 py-2.5">
                <p className="font-mono text-[11px] text-zinc-600">Transport dismissed</p>
                <GButton tone="ghost" size="sm" onClick={() => setDismissed(false)}>
                  Reopen player
                </GButton>
              </div>
            ) : (
              <div className="rounded-[20px] border border-[var(--d-edge-hi)] bg-[#101014]/95 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_rgba(0,0,0,0.6),0_0_44px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)]">
                <div className="flex items-center gap-3">
                  <div className="flex shrink-0 items-center gap-1">
                  <GButton
                    tone="ghost"
                    size="icon"
                    className="size-8 rounded-full"
                    aria-label="Previous in queue"
                    onClick={() => stepTrack(-1)}
                  >
                      <SkipBack fill="currentColor" className="size-4" />
                    </GButton>
                    <button
                      type="button"
                      onClick={() => setPlaying((value) => !value)}
                      aria-label={playing ? `Pause ${track.filename}` : `Play ${track.filename}`}
                      className={[
                        "grid size-11 shrink-0 place-items-center rounded-full text-white outline-none",
                        "bg-[linear-gradient(180deg,var(--accent-fill-hover),var(--accent-fill))]",
                        "transition-[box-shadow,transform,filter] duration-150",
                        "hover:brightness-110 motion-safe:hover:-translate-y-px motion-safe:active:scale-95",
                        "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0e] motion-reduce:transition-none [&_svg]:size-[18px]",
                        playing
                          ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_34px_color-mix(in_oklab,var(--accent-fill)_55%,transparent)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_42px_color-mix(in_oklab,var(--accent-fill)_65%,transparent)]"
                          : "shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_22px_color-mix(in_oklab,var(--accent-fill)_35%,transparent)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_30px_color-mix(in_oklab,var(--accent-fill)_50%,transparent)]",
                      ].join(" ")}
                    >
                      {playing ? (
                        <Pause key="pause" fill="currentColor" className="motion-safe:[animation:g-pop_0.18s_ease-out] motion-reduce:[animation:none]" />
                      ) : (
                        <Play key="play" fill="currentColor" className="ml-0.5 motion-safe:[animation:g-pop_0.18s_ease-out] motion-reduce:[animation:none]" />
                      )}
                    </button>
                    <GButton
                      tone="ghost"
                      size="icon"
                      className="size-8 rounded-full"
                      aria-label="Next in queue"
                      onClick={() => stepTrack(1)}
                    >
                      <SkipForward fill="currentColor" className="size-4" />
                    </GButton>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-tight text-zinc-100">
                      {track.filename}
                      <span className="ml-2 font-mono text-[11px] font-normal text-zinc-500">
                        {track.meta}
                        {nextTrack ? ` · next: ${nextTrack.filename}` : null}
                      </span>
                    </p>
                    <HScrubber
                      peaks={peaks}
                      progress={elapsed / track.duration}
                      duration={track.duration}
                      onSeek={setElapsed}
                      label={`Seek through ${track.filename}`}
                    />
                  </div>

                  <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-zinc-400 min-[480px]:block">
                    {fmtTime(elapsed)} / {fmtTime(track.duration)}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-white/[0.06] pt-2.5">
                  <GIconButton
                    label={trackFav ? "Remove from favorites" : "Add to favorites"}
                    tone={trackFav ? "danger" : "secondary"}
                    aria-pressed={trackFav}
                    onClick={() =>
                      setFavs((prev) => ({ ...prev, [trackIdx]: !prev[trackIdx] }))
                    }
                    className="size-9 rounded-full"
                  >
                    <Heart
                      fill={trackFav ? "currentColor" : "none"}
                      className={trackFav ? "text-accent-text" : undefined}
                    />
                  </GIconButton>
                  <button
                    ref={collTriggerRef}
                    type="button"
                    aria-label="Add to collection"
                    aria-haspopup="menu"
                    aria-expanded={collOpen}
                    title="Add to collection"
                    onClick={() => {
                      if (collOpen) setCollOpen(false);
                      else {
                        measureCollMenu();
                        setCollOpen(true);
                      }
                    }}
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-transparent text-zinc-400 outline-none transition-[background-color,border-color,box-shadow,color,transform] duration-150 hover:border-[var(--d-edge)] hover:bg-white/[0.06] hover:text-zinc-100 motion-safe:hover:-translate-y-px motion-safe:active:scale-95 focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] motion-reduce:transition-none [&_svg]:size-4"
                  >
                    <FolderPlus />
                  </button>
                  <div className="flex w-28 shrink-0 items-center gap-1">
                    <GButton
                      tone="ghost"
                      size="icon"
                      className="size-8 rounded-full"
                      aria-label={muted || volume === 0 ? "Unmute audio" : "Mute audio"}
                      onClick={() => setMuted((value) => !value)}
                    >
                      {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
                    </GButton>
                    <div className="min-w-0 flex-1">
                      <HSlider
                        label="Volume"
                        value={muted ? 0 : volume}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(next) => {
                          setVolume(next);
                          if (next > 0) setMuted(false);
                        }}
                        formatValue={(next) => `${Math.round(next * 100)}%`}
                      />
                    </div>
                  </div>
                  <GButton
                    tone="ghost"
                    size="icon"
                    className="size-8 rounded-full"
                    aria-label={autoplay ? "Turn autoplay off" : "Turn autoplay on"}
                    aria-pressed={autoplay}
                    title={autoplay ? "Autoplay on" : "Autoplay off"}
                    onClick={() => setAutoplay((value) => !value)}
                  >
                    <Repeat className={autoplay ? "text-accent-text" : undefined} />
                  </GButton>
                  <span className="flex-1" />
                  {autoplay ? (
                    <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-accent-text min-[560px]:block">
                      Auto
                    </span>
                  ) : null}
                  <GButton
                    tone="ghost"
                    size="icon"
                    className="size-8 rounded-full [&_svg]:size-3.5"
                    aria-label="Close player"
                    onClick={() => {
                      setDismissed(true);
                      setPlaying(false);
                    }}
                  >
                    <X />
                  </GButton>
                </div>
              </div>
            )}
          </DCard>

          <DCard title="Accordion" sub="Folder-janitor disclosures." className="col-span-12 lg:col-span-5">
            <HAccordion
              items={[
                {
                  title: "Stale folders",
                  meta: "4 found",
                  body: "Indexed folders that no longer exist on disk. Cleaning removes the entries only.",
                },
                {
                  title: "Empty folders",
                  meta: "11 found",
                  body: "Folders under your scan roots with no sounds left in them.",
                },
                {
                  title: "Orphaned previews",
                  meta: "2 found",
                  body: "Cached waveforms whose source files were deleted outside Foleyard.",
                },
              ]}
            />
          </DCard>
        </div>
      </div>

      {collOpen && collPos ? (
        <div
          ref={collMenuRef}
          role="menu"
          aria-label="Collections"
          style={{ top: collPos.top, left: collPos.left }}
          className="fixed z-[70] w-60 [animation:g-menu-in_0.14s_ease-out] motion-reduce:[animation:none]"
        >
          <HMenu label="Collections">
            {SHELF_COLLECTIONS.map((collection) => (
              <HMenuItem
                key={collection.id}
                icon={collection.smart ? <Sparkles /> : <ListMusic />}
                meta={"fileCount" in collection ? collection.fileCount : "Smart"}
                onClick={() => setCollOpen(false)}
              >
                {collection.name}
              </HMenuItem>
            ))}
            <HMenuSeparator />
            <HMenuItem icon={<Plus />} onClick={() => setCollOpen(false)}>
              New collection…
            </HMenuItem>
          </HMenu>
        </div>
      ) : null}

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
                  aria-controls="command-palette-results-h"
                  aria-activedescendant={
                    activeIndex >= 0 ? `command-palette-entry-h-${activeIndex}` : undefined
                  }
                  className="h-12 w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <DKbd>esc</DKbd>
              </div>
              <div
                id="command-palette-results-h"
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

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setDialogOpen(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="variant-h-dialog-title"
            aria-describedby="variant-h-dialog-desc"
            className="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--d-edge-hi)] bg-[#101014]/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_rgba(0,0,0,0.65),0_0_40px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="variant-h-dialog-title" className="text-[15px] font-semibold text-zinc-50">
              Remove scan root?
            </h2>
            <p id="variant-h-dialog-desc" className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
              C:/Sound Library/SFX and its 8,900 indexed files will leave the library. Files
              stay on disk.
            </p>
            <div aria-hidden className="my-4 h-px bg-[var(--d-edge)]" />
            <div className="flex justify-end gap-2">
              <GButton autoFocus tone="secondary" size="sm" onClick={() => setDialogOpen(false)}>
                Cancel
              </GButton>
              <GButton tone="danger" size="sm" onClick={() => setDialogOpen(false)}>
                <Trash2 />
                Remove
              </GButton>
            </div>
          </div>
        </div>
      ) : null}
    </DSurface>
  );
}
