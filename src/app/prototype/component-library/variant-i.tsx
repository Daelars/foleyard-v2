// PROTOTYPE ONLY — variant I, "everything else". H's full grid plus the
// production components H never showed: bulk bar, scan stats, extension
// cards, shortcut capture, drop offer, candidate queue, validation messages,
// and empty states. Same dark-acrylic language, same element motion. I-only
// compositions live at the bottom of this file.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Command,
  Copy,
  Download,
  Ellipsis,
  FileMusic,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  Heart,
  Info,
  Keyboard,
  Layers,
  Library,
  ListMusic,
  ListPlus,
  Monitor,
  Pause,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Repeat,
  Search,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Trash2,
  Volume2,
  VolumeX,
  Workflow,
  X,
} from "lucide-react";
import type { PaletteSection as PaletteSectionName } from "@/components/CommandPalette/command-palette";

import { SPECIMEN_COMMANDS } from "./fixtures";
import type { SpecimenState } from "./page";
import { TagOriginMark } from "@/components/FileTable/tag-origin-mark";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import type { TagOrigin } from "@yard-core";
import { ITEM_COLOR_PRESETS, onColorText } from "@/lib/item-colors";
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
import { cn } from "@/lib/utils";

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
              id={listbox ? `command-palette-entry-i-${index}` : undefined}
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

// ---------------------------------------------------------------------------
// I-only compositions.
// ---------------------------------------------------------------------------

function ScanStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "error";
}) {
  return (
    <div className="rounded-lg border border-[var(--d-edge)] bg-black/25 p-2.5 transition-colors hover:border-[var(--d-edge-hi)]">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate font-mono text-lg font-bold tabular-nums",
          tone === "success" && "text-emerald-300",
          tone === "error" && "text-accent-text",
          tone === "default" && "text-zinc-100",
        )}
      >
        {value}
      </p>
    </div>
  );
}

const SHORTCUT_LABELS: Record<string, string> = {
  "play-pause": "Play / pause",
  "go-library": "Go to Library",
  palette: "Open command palette",
};

function ShortcutRow({
  action,
  binding,
  rebinding,
  onStart,
  onCancel,
}: {
  action: string;
  binding: string;
  rebinding: boolean;
  onStart: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-100">
        {SHORTCUT_LABELS[action] ?? action}
      </p>
      <DKbd>
        <span className={cn("px-1", rebinding && "animate-pulse text-accent-text")}>
          {rebinding ? "Press a key…" : binding === "Space" ? "Space" : binding.toUpperCase()}
        </span>
      </DKbd>
      <GButton tone="ghost" size="sm" onClick={() => (rebinding ? onCancel() : onStart())}>
        {rebinding ? "Cancel" : "Change"}
      </GButton>
    </div>
  );
}

function ExtensionRow({
  monogram,
  name,
  version,
  settingsCount,
  description,
  enabled,
  onToggle,
}: {
  monogram: string;
  name: string;
  version: string;
  settingsCount?: number;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--d-edge)] bg-black/25 px-3 py-2.5 transition-colors hover:border-[var(--d-edge-hi)]">
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] text-[15px] font-bold text-accent-text"
      >
        {monogram}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-zinc-100">{name}</span>
          <span className="shrink-0 rounded border border-[var(--d-edge)] px-1 font-mono text-[10px] text-zinc-500">
            v{version}
          </span>
          {typeof settingsCount === "number" ? (
            <span className="hidden shrink-0 rounded border border-[var(--d-edge)] bg-white/[0.03] px-1 font-mono text-[10px] text-zinc-500 min-[420px]:block">
              {settingsCount} settings
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-zinc-500">{description}</span>
      </span>
      <GSwitch label={`Toggle ${name}`} checked={enabled} onCheckedChange={onToggle} />
    </div>
  );
}

function ValidationMsg({ valid }: { valid: boolean }) {
  return (
    <div
      role={valid ? "status" : "alert"}
      className={cn(
        "flex gap-3 rounded-lg border p-3.5",
        valid
          ? "border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_7%,transparent)]"
          : "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full [&_svg]:size-4",
          valid
            ? "bg-[color-mix(in_oklab,var(--accent-fill)_18%,transparent)] text-accent-text"
            : "bg-[color-mix(in_oklab,var(--accent-fill)_20%,transparent)] text-accent-text",
        )}
      >
        {valid ? <CheckCircle2 /> : <AlertCircle />}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[13px] font-semibold", valid ? "text-zinc-100" : "text-accent-text")}>
          {valid ? "Path verified" : "Invalid folder"}
        </span>
        <span className="mt-0.5 block text-xs text-zinc-400">
          {valid ? "Found 214 supported audio files." : "The path does not exist or is not readable."}
        </span>
        {valid ? (
          <span className="mt-2 block truncate rounded-md border border-[var(--d-edge)] bg-black/30 px-2 py-1.5 font-mono text-[10px] text-zinc-400">
            C:/Sound Library/SFX
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function VariantI({ settings, onToggleSetting }: SpecimenState) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [filter, setFilter] = useState("untagged");
  const [tagFilter, setTagFilter] = useState("all");
  const [semantic, setSemantic] = useState(true);
  const [page, setPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  // H specimen state (carried over so the grid matches).
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

  // I-only specimen state.
  const [scanning, setScanning] = useState(true);
  const [discovered, setDiscovered] = useState(1204);
  const [indexed, setIndexed] = useState(860);
  const [extJanitor, setExtJanitor] = useState(true);
  const [extPack, setExtPack] = useState(false);
  const [bindings, setBindings] = useState<Record<string, string>>({
    "play-pause": "Space",
    "go-library": "g",
    palette: "k",
  });
  const [rebinding, setRebinding] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [queueWords, setQueueWords] = useState([
    { word: "thunder", files: 12 },
    { word: "rumble", files: 9 },
    { word: "night", files: 7 },
    { word: "rain", files: 6 },
    { word: "drone", files: 5 },
    { word: "wash", files: 4 },
    { word: "metallic", files: 3 },
    { word: "thud", files: 2 },
  ]);
  const [queuePage, setQueuePage] = useState(0);
  const [coverageSel, setCoverageSel] = useState("thunder");
  const [packSource, setPackSource] = useState("selection");
  const [packFormat, setPackFormat] = useState("folder");
  const [stepIdx, setStepIdx] = useState(1);
  const [crumbs, setCrumbs] = useState(["Library", "SFX"]);
  const [orgTags, setOrgTags] = useState([
    { id: "g1", name: "rain", color: ITEM_COLOR_PRESETS[3] ?? "#5ad1e6" },
    { id: "g2", name: "thunder", color: ITEM_COLOR_PRESETS[0] ?? "#f0503c" },
    { id: "g3", name: "night", color: ITEM_COLOR_PRESETS[5] ?? "#d3a6ff" },
  ]);
  const [selTagId, setSelTagId] = useState<string | null>("g2");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [tagColorDraft, setTagColorDraft] = useState(ITEM_COLOR_PRESETS[3] ?? "#5ad1e6");
  const [delArmedId, setDelArmedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [compName, setCompName] = useState("");
  const [compColor, setCompColor] = useState(ITEM_COLOR_PRESETS[4] ?? "#7ab8ff");
  const [packName, setPackName] = useState("rain-pack");
  const [packNameError, setPackNameError] = useState<string | null>(null);
  const [packFormatSetting, setPackFormatSetting] = useState("folder");
  const [notifyOn, setNotifyOn] = useState(true);
  const [tools, setTools] = useState([
    {
      id: "make-pack-v2",
      mono: "MA",
      name: "Make Pack v2",
      version: "1.0.0",
      description: "Turn selected sounds into a clean folder or ZIP pack.",
      enabled: false,
      perms: ["library:read", "files:write"],
      approved: false,
      canRun: true,
    },
    {
      id: "folder-janitor",
      mono: "FJ",
      name: "Folder Janitor",
      version: "0.2.0",
      description: "Find stale and empty folders.",
      enabled: true,
      perms: ["library:read"],
      approved: true,
      canRun: false,
    },
  ]);
  const [toolInfoId, setToolInfoId] = useState<string | null>(null);

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

  // Shortcut capture: mirrors shortcuts-tab (Escape cancels, Tab ignored,
  // modifiers ignored, single chars lowercase, Space stays "Space").
  useEffect(() => {
    if (!rebinding) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRebinding(null);
        return;
      }
      if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) return;
      const key =
        event.key === " " ? "Space" : event.key.length === 1 ? event.key.toLowerCase() : event.key;
      setBindings((prev) => ({ ...prev, [rebinding]: key }));
      setRebinding(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [rebinding]);

  // Scan stat ticker.
  useEffect(() => {
    if (!scanning) return;
    const timer = window.setInterval(() => {
      setDiscovered((value) => value + 23);
      setIndexed((value) => value + 19);
    }, 600);
    return () => window.clearInterval(timer);
  }, [scanning]);

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
              Variant I — H&rsquo;s grid plus everything else: bulk bar, scan job,
              extensions, shortcuts, drop offer, queue, validation, empty states.
            </p>
          </div>
          <GButton tone="secondary" onClick={openPalette}>
            <DKbd>
              <Command />
            </DKbd>
            Open command palette
          </GButton>
        </header>

        {/* Cards hug their content: no stretch-blank in short cards. */}
        <div className="grid grid-cols-12 items-start gap-4">
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
                <GRadio name="i-filter" label="All files" checked={filter === "all"} onChange={() => setFilter("all")} />
                <GRadio name="i-filter" label="Untagged only" checked={filter === "untagged"} onChange={() => setFilter("untagged")} />
                <GRadio name="i-filter" label="Custom filter" checked={filter === "custom"} onChange={() => setFilter("custom")} />
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

          <DCard title="Bulk Bar" sub="Multi-selection actions." className="col-span-12">
            <BulkBar />
          </DCard>

          <DCard title="Scan Job" sub="Live sync status and stats." className="col-span-12 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <RefreshCw
                  aria-hidden
                  className={cn("size-4 text-accent-text", scanning && "animate-spin motion-reduce:[animation:none]")}
                />
                <p className="text-sm font-medium text-zinc-200">Library sync</p>
                {scanning ? (
                  <DStatusBadge status="Indexing" tone="processing" />
                ) : (
                  <DStatusBadge status="Idle" tone="unavailable" />
                )}
              </div>
              <GButton
                tone={scanning ? "secondary" : "primary"}
                size="sm"
                loading={scanning}
                onClick={() => setScanning((value) => !value)}
              >
                {scanning ? "Scanning…" : "Start Full Scan"}
              </GButton>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ScanStat label="Phase" value={scanning ? "Indexing" : "Idle"} />
              <ScanStat label="Discovered" value={discovered.toLocaleString()} />
              <ScanStat label="Indexed" value={indexed.toLocaleString()} />
              <ScanStat label="Added" value="+12" tone="success" />
              <ScanStat label="Removed" value="−3" tone="error" />
              <ScanStat label="Roots" value="3" />
            </div>
          </DCard>

          <DCard title="Extensions" sub="Installed workflow tools." className="col-span-12 lg:col-span-5">
            <div className="grid gap-2">
              <ExtensionRow
                monogram="F"
                name="Folder Janitor"
                version="0.2.0"
                settingsCount={3}
                description="Find stale and empty folders."
                enabled={extJanitor}
                onToggle={setExtJanitor}
              />
              <ExtensionRow
                monogram="M"
                name="Make Pack"
                version="1.0.0"
                description="Turn selected sounds into a clean folder or ZIP pack."
                enabled={extPack}
                onToggle={setExtPack}
              />
            </div>
          </DCard>

          <DCard title="Shortcuts" sub="Press-to-rebind keys." className="col-span-12 md:col-span-6 lg:col-span-5">
            <div className="divide-y divide-white/[0.06]">
              {Object.keys(SHORTCUT_LABELS).map((action) => (
                <ShortcutRow
                  key={action}
                  action={action}
                  binding={bindings[action] ?? "?"}
                  rebinding={rebinding === action}
                  onStart={() => setRebinding(action)}
                  onCancel={() => setRebinding(null)}
                />
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-600">
              <Keyboard aria-hidden className="size-3.5" />
              Select Change, then press a key. Escape cancels.
            </p>
          </DCard>

          <DCard title="Candidate Queue" sub="Words awaiting review." className="col-span-12 md:col-span-6 lg:col-span-7">
            <QueueCard words={queueWords} page={queuePage} onPage={setQueuePage} onDismiss={(word) => {
              setQueueWords((items) => items.filter((item) => item.word !== word));
              setQueuePage(0);
            }} />
          </DCard>

          <DCard title="Drop Offer" sub="Extension drop target." className="col-span-12 md:col-span-6 lg:col-span-4">
            <button
              type="button"
              aria-pressed={dropActive}
              onClick={() => setDropActive((value) => !value)}
              className={cn(
                "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 outline-none transition-[border-color,background-color,box-shadow] duration-150",
                "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]",
                dropActive
                  ? "border-[color-mix(in_oklab,var(--accent-fill)_65%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] shadow-[0_0_28px_color-mix(in_oklab,var(--accent-fill)_14%,transparent)]"
                  : "border-[var(--d-edge-hi)] bg-white/[0.015] hover:border-[color-mix(in_oklab,var(--accent-fill)_40%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent-fill)_4%,transparent)]",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-10 place-items-center rounded-full border [&_svg]:size-5",
                  dropActive
                    ? "border-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_14%,transparent)] text-accent-text"
                    : "border-[var(--d-edge)] bg-white/[0.03] text-zinc-400",
                )}
              >
                <FileUp />
              </span>
              <span className="text-[13px] font-medium text-zinc-100">
                {dropActive ? "Release to run on 4 files" : "Drop audio files here"}
              </span>
              <span className="font-mono text-[11px] text-zinc-500">
                Make Pack · Folder Janitor accept drops
              </span>
            </button>
            <p className="mt-2 text-center font-mono text-[10.5px] text-zinc-600">
              Toggle the preview state by pressing the panel.
            </p>
          </DCard>

          <DCard title="Validation" sub="Path check results." className="col-span-12 md:col-span-6 lg:col-span-4">
            <div className="grid gap-2">
              <ValidationMsg valid />
              <ValidationMsg valid={false} />
            </div>
          </DCard>

          <DCard title="Empty State" sub="No-results placeholder." className="col-span-12 lg:col-span-4">
            <div className="flex flex-col items-center px-4 py-6 text-center">
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-xl border border-[var(--d-edge)] bg-white/[0.03] text-zinc-500 shadow-[var(--d-lift)] [&_svg]:size-5"
              >
                <Search />
              </span>
              <p className="mt-3 text-sm font-medium text-zinc-100">No sounds match</p>
              <p className="mt-1 max-w-56 text-xs leading-relaxed text-zinc-500">
                Try clearing filters or searching for something else.
              </p>
              <GButton tone="ghost" size="sm" className="mt-3" onClick={() => {}}>
                Clear search
              </GButton>
            </div>
          </DCard>

          <DCard title="Coverage Rail" sub="Board tag progress." className="col-span-12 lg:col-span-7">
            <ul className="overflow-hidden rounded-lg border border-[var(--d-edge)]">
              {[
                { tag: "thunder", delta: 3, count: 47 },
                { tag: "rain", delta: 0, count: 50 },
                { tag: "drone", delta: 1, count: 12 },
                { tag: "wash", delta: 0, count: 0 },
              ].map((row) => (
                <CoverRow
                  key={row.tag}
                  tag={row.tag}
                  delta={row.delta}
                  count={row.count}
                  goal={50}
                  active={coverageSel === row.tag}
                  onSelect={() => setCoverageSel(row.tag)}
                />
              ))}
            </ul>
          </DCard>

          <DCard title="Provenance" sub="Tag origin marks." className="col-span-12 lg:col-span-5">
            <div className="flex flex-wrap gap-1.5">
              <ProvTag name="impact" selected provenance="manual" />
              <ProvTag name="weather" provenance="deterministic" />
              <ProvTag name="thunder" provenance="semantic_ai" confidence={0.92} />
              <ProvTag name="rumble" provenance="semantic_ai" confidence={0.41} />
              <ProvTag name="foley" />
            </div>
            <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-zinc-600">
              M added by hand · D fired by a filename rule · AI suggested with confidence
            </p>
          </DCard>

          <DCard title="Pack Options" sub="Make-pack source and format." className="col-span-12 md:col-span-6 lg:col-span-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Source</p>
            <div className="mt-1.5 grid gap-1.5" role="radiogroup" aria-label="Pack source">
              {[
                ["selection", "Current selection", "3 sounds selected in the library"],
                ["shelf", "Sound Shelf", "Everything on your shelf"],
                ["recent", "Recently previewed", "Last 20 auditions"],
              ].map(([value, label, desc]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={packSource === value}
                  onClick={() => setPackSource(value)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left outline-none transition-[border-color,background-color] duration-150",
                    "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]",
                    packSource === value
                      ? "border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)]"
                      : "border-[var(--d-edge)] bg-black/25 hover:border-[var(--d-edge-hi)]",
                  )}
                >
                  <GRadio
                    name="i-pack-source"
                    label={label}
                    checked={packSource === value}
                    onChange={() => setPackSource(value)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-zinc-100">{label}</span>
                    <span className="block truncate text-xs text-zinc-500">{desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Format</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Pack format">
              {["folder", "zip"].map((format) => (
                <button
                  key={format}
                  type="button"
                  role="radio"
                  aria-checked={packFormat === format}
                  onClick={() => setPackFormat(format)}
                  className={cn(
                    "rounded-lg border px-3 py-2 font-mono text-xs outline-none transition-[border-color,background-color,color] duration-150",
                    "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]",
                    packFormat === format
                      ? "border-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] font-bold text-accent-text"
                      : "border-[var(--d-edge)] bg-black/25 text-zinc-400 hover:border-[var(--d-edge-hi)] hover:text-zinc-200",
                  )}
                >
                  {format === "folder" ? "Folder" : "ZIP archive"}
                </button>
              ))}
            </div>
          </DCard>

          <DCard title="Onboarding Steps" sub="First-run stepper." className="col-span-12 md:col-span-6 lg:col-span-3">
            <ol className="flex items-center">
              {["Welcome", "Folder", "Scan"].map((step, index) => (
                <li key={step} className="flex items-center last:flex-none">
                  <button
                    type="button"
                    onClick={() => setStepIdx(index)}
                    aria-label={`Go to step ${step}`}
                    aria-current={stepIdx === index ? "step" : undefined}
                    className="group flex flex-col items-center gap-1.5 outline-none"
                  >
                    <StepDot active={stepIdx === index} completed={stepIdx > index} />
                    <span
                      className={cn(
                        "font-mono text-[10px]",
                        stepIdx === index ? "text-zinc-100" : "text-zinc-600 group-hover:text-zinc-400",
                      )}
                    >
                      {step}
                    </span>
                  </button>
                  {index < 2 ? <StepLine active={stepIdx > index} /> : null}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              {stepIdx === 0
                ? "Meet Foleyard, the local-first sound library."
                : stepIdx === 1
                  ? "Point Foleyard at your sound folders."
                  : "Index everything and start browsing."}
            </p>
          </DCard>

          <DCard title="Skeleton Tiles" sub="Loading placeholders." className="col-span-12 lg:col-span-4">
            <div className="grid gap-2" aria-hidden>
              {[0, 1].map((skeleton) => (
                <div
                  key={skeleton}
                  className="flex animate-pulse items-center gap-3 rounded-lg border border-[var(--d-edge)] bg-black/25 px-3 py-2.5 motion-reduce:animate-none"
                >
                  <span className="size-10 shrink-0 rounded-lg bg-white/[0.06]" />
                  <span className="min-w-0 flex-1">
                    <span className="block h-3 w-2/3 rounded bg-white/[0.07]" />
                    <span className="mt-1.5 block h-2.5 w-1/2 rounded bg-white/[0.05]" />
                  </span>
                  <span className="h-[18px] w-[34px] shrink-0 rounded-full bg-white/[0.06]" />
                </div>
              ))}
            </div>
          </DCard>

          <DCard title="Dot-Matrix Status" sub="Service glyph and phase." className="col-span-12 md:col-span-6 lg:col-span-4">
            <div className="flex items-center gap-3 rounded-lg border border-[var(--d-edge)] bg-black/25 p-3">
              <DotmSquare3
                size={20}
                dotSize={3}
                speed={1.2}
                animated={scanning}
                pattern="full"
                className={scanning ? "text-accent-text" : "text-zinc-500"}
              />
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                  Status
                </p>
                <p className="truncate text-xs font-medium text-zinc-200">
                  {scanning ? "Indexing… 1,204 of 8,900" : "Service Online"}
                </p>
              </div>
              <span className="flex-1" />
              <GSwitch label="Simulate scan" checked={scanning} onCheckedChange={setScanning} />
            </div>
            <p className="mt-2 font-mono text-[10.5px] text-zinc-600">
              The glyph animates while a job runs. Flip the switch.
            </p>
          </DCard>

          <DCard title="Directories" sub="Folder browser rows." className="col-span-12 md:col-span-6 lg:col-span-8">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
              {crumbs.map((crumb, index) => (
                <span key={`${index}-${crumb}`} className="flex items-center gap-1">
                  {index > 0 ? <ChevronRight aria-hidden className="size-3 text-zinc-700" /> : null}
                  <button
                    type="button"
                    onClick={() => setCrumbs(crumbs.slice(0, index + 1))}
                    aria-current={index === crumbs.length - 1 ? "page" : undefined}
                    className={cn(
                      "rounded px-1 py-0.5 outline-none transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]",
                      index === crumbs.length - 1
                        ? "text-zinc-100"
                        : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200",
                    )}
                  >
                    {crumb}
                  </button>
                </span>
              ))}
            </nav>
            <div className="mt-2 overflow-hidden rounded-lg border border-[var(--d-edge)]">
              {[
                ["field-recordings", "18 sounds · 2 folders"],
                ["rain", "6 sounds · 0 folders"],
                ["urban", "24 sounds · 1 folder"],
              ].map(([label, subtitle]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setCrumbs((path) => [...path, label])}
                  className="group flex w-full items-center gap-3 border-b border-[var(--d-edge)] px-3 py-2.5 text-left outline-none transition-colors last:border-b-0 hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--d-edge)] bg-white/[0.03] text-zinc-500 transition-colors group-hover:border-[var(--d-edge-hi)] group-hover:text-zinc-300 [&_svg]:size-4">
                    <Folder />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-zinc-100">{label}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-500">{subtitle}</span>
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-zinc-600 transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-300 motion-reduce:transition-none"
                  />
                </button>
              ))}
            </div>
          </DCard>
          <DCard title="Organize Tags" sub="Color chips, editor, composer." className="col-span-12 lg:col-span-7">
            <div className="flex items-center gap-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Tags
              </p>
              <button
                type="button"
                onClick={() => setComposerOpen((value) => !value)}
                aria-label="New tag"
                aria-expanded={composerOpen}
                className="grid size-5 place-items-center rounded-full border border-dashed border-white/20 text-zinc-500 outline-none transition-[border-color,color,transform] duration-150 hover:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] hover:text-accent-text motion-safe:active:scale-90 focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] [&_svg]:size-3"
              >
                <Plus />
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
              {orgTags.map((tag) => {
                if (editingId === tag.id) {
                  const armed = delArmedId === tag.id;
                  return (
                    <span
                      key={tag.id}
                      className="w-full max-w-md rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_7%,transparent)] p-2"
                    >
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: tagColorDraft }} />
                        <input
                          autoFocus
                          value={tagDraft}
                          onChange={(event) => setTagDraft(event.target.value)}
                          onBlur={() => {
                            if (tagDraft.trim()) {
                              setOrgTags((items) =>
                                items.map((item) =>
                                  item.id === tag.id
                                    ? { ...item, name: tagDraft.trim(), color: tagColorDraft }
                                    : item,
                                ),
                              );
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") setEditingId(null);
                            if (event.key === "Escape") {
                              setEditingId(null);
                              setDelArmedId(null);
                            }
                          }}
                          aria-label="Rename tag"
                          className="min-w-0 flex-1 rounded-md border border-[var(--d-edge)] bg-[rgba(0,0,0,0.38)] px-2 py-1 text-xs font-semibold text-zinc-100 outline-none focus:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)]"
                        />
                        {armed ? (
                          <>
                            <GButton
                              tone="danger"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => {
                                setOrgTags((items) => items.filter((item) => item.id !== tag.id));
                                setEditingId(null);
                                setDelArmedId(null);
                              }}
                            >
                              Sure?
                            </GButton>
                            <GButton
                              tone="ghost"
                              size="icon"
                              className="size-6 [&_svg]:size-3"
                              aria-label="Cancel delete"
                              onClick={() => setDelArmedId(null)}
                            >
                              <X />
                            </GButton>
                          </>
                        ) : (
                          <>
                            <GButton
                              tone="ghost"
                              size="icon"
                              className="size-6 [&_svg]:size-3"
                              aria-label={`Delete tag ${tag.name}`}
                              onClick={() => setDelArmedId(tag.id)}
                            >
                              <Trash2 />
                            </GButton>
                            <GButton
                              tone="ghost"
                              size="icon"
                              className="size-6 [&_svg]:size-3"
                              aria-label="Done editing"
                              onClick={() => setEditingId(null)}
                            >
                              <X />
                            </GButton>
                          </>
                        )}
                      </span>
                      <span className="mt-1.5 flex items-center gap-1.5 px-1 pb-0.5">
                        {ITEM_COLOR_PRESETS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setTagColorDraft(color)}
                            aria-label={`Pick ${color}`}
                            aria-pressed={tagColorDraft === color}
                            style={{ backgroundColor: color }}
                            className={cn(
                              "size-5 rounded-full outline-none transition-[transform,opacity] duration-150 motion-safe:hover:scale-110 motion-safe:active:scale-95",
                              "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                              tagColorDraft === color
                                ? "ring-2 ring-white ring-offset-2 ring-offset-black"
                                : "opacity-70 hover:opacity-100",
                            )}
                          />
                        ))}
                      </span>
                    </span>
                  );
                }
                const chipActive = selTagId === tag.id;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setSelTagId(chipActive ? null : tag.id)}
                    onDoubleClick={() => {
                      setEditingId(tag.id);
                      setTagDraft(tag.name);
                      setTagColorDraft(tag.color);
                      setDelArmedId(null);
                    }}
                    title="Click to filter · double-click to edit"
                    aria-pressed={chipActive}
                    style={
                      chipActive
                        ? { borderColor: `${tag.color}80`, backgroundColor: `${tag.color}14` }
                        : undefined
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold outline-none transition-[background-color,border-color,transform] duration-150 motion-safe:active:scale-95",
                      "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]",
                      chipActive
                        ? "text-zinc-100"
                        : "border-[var(--d-edge)] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.06]",
                    )}
                  >
                    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </button>
                );
              })}
            </div>
            {composerOpen ? (
              <div className="mt-2 max-w-md rounded-lg border border-dashed border-[var(--d-edge-hi)] p-3">
                <div className="flex items-center gap-3">
                  <input
                    autoFocus
                    value={compName}
                    onChange={(event) => setCompName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && compName.trim()) {
                        setOrgTags((items) => [
                          ...items,
                          { id: `g-${Date.now()}`, name: compName.trim(), color: compColor },
                        ]);
                        setCompName("");
                        setComposerOpen(false);
                      }
                      if (event.key === "Escape") setComposerOpen(false);
                    }}
                    placeholder="Tag name…"
                    aria-label="New tag name"
                    className="min-w-0 flex-1 rounded-md border border-[var(--d-edge)] bg-[rgba(0,0,0,0.38)] px-2.5 py-1.5 text-[13px] font-semibold text-zinc-100 outline-none placeholder:font-normal placeholder:text-zinc-600 focus:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)]"
                  />
                  <span className="flex shrink-0 items-center gap-1.5">
                    {ITEM_COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setCompColor(color)}
                        aria-label={`Pick ${color}`}
                        aria-pressed={compColor === color}
                        style={{ backgroundColor: color }}
                        className={cn(
                          "size-5 rounded-full outline-none transition-[transform,opacity] duration-150 motion-safe:hover:scale-110 motion-safe:active:scale-95",
                          "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                          compColor === color
                            ? "ring-2 ring-white ring-offset-2 ring-offset-black"
                            : "opacity-70 hover:opacity-100",
                        )}
                      />
                    ))}
                  </span>
                </div>
                <div className="mt-2.5 flex justify-end gap-2">
                  <GButton tone="ghost" size="sm" onClick={() => setComposerOpen(false)}>
                    Cancel
                  </GButton>
                  <button
                    type="button"
                    disabled={!compName.trim()}
                    onClick={() => {
                      setOrgTags((items) => [
                        ...items,
                        { id: `g-${Date.now()}`, name: compName.trim(), color: compColor },
                      ]);
                      setCompName("");
                      setComposerOpen(false);
                    }}
                    style={{ backgroundColor: compColor, color: onColorText(compColor) }}
                    className="rounded-md px-3.5 py-1.5 text-xs font-semibold outline-none transition-[transform,opacity,filter] duration-150 hover:brightness-110 motion-safe:active:scale-95 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
                  >
                    Add tag
                  </button>
                </div>
              </div>
            ) : null}
          </DCard>

          <DCard title="Setting Rows" sub="Validated extension settings." className="col-span-12 lg:col-span-5">
            <div className="grid gap-1">
              <div className="rounded-lg border border-[var(--d-edge)] px-3 py-2.5">
                <p className="text-[13px] font-medium text-zinc-100">Output format</p>
                <p className="mt-0.5 text-xs text-zinc-500">Folder keeps files loose; ZIP packs them.</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">Default: folder</p>
                <div className="mt-2">
                  <DSelect
                    label="Output format"
                    value={packFormatSetting}
                    onChange={setPackFormatSetting}
                    options={[
                      { value: "folder", label: "Folder" },
                      { value: "zip", label: "ZIP archive" },
                    ]}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--d-edge)] px-3 py-2.5">
                <p className="text-[13px] font-medium text-zinc-100">Pack name</p>
                <p className="mt-0.5 text-xs text-zinc-500">Used for the output folder or file.</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">Default: untitled-pack</p>
                <DField
                  aria-label="Pack name"
                  value={packName}
                  aria-invalid={packNameError !== null}
                  onChange={(event) => {
                    setPackName(event.target.value);
                    if (packNameError) setPackNameError(null);
                  }}
                  onBlur={() => {
                    if (!packName.trim()) setPackNameError("Name is required.");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !packName.trim()) setPackNameError("Name is required.");
                  }}
                  className="mt-2"
                />
                {packNameError ? (
                  <p role="alert" className="mt-1.5 text-xs text-accent-text">
                    {packNameError}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--d-edge)] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-zinc-100">Notify when done</p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">Default: on</p>
                </div>
                <GSwitch label="Notify when done" checked={notifyOn} onCheckedChange={setNotifyOn} />
              </div>
            </div>
          </DCard>

          <DCard title="Tool Cards" sub="Extension tools grid." className="col-span-12">
            <div className="grid gap-2 md:grid-cols-2">
              {tools.map((tool) => {
                const expanded = toolInfoId === tool.id;
                return (
                  <div
                    key={tool.id}
                    className="rounded-lg border border-[var(--d-edge)] bg-black/25 p-3 transition-colors hover:border-[var(--d-edge-hi)]"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="grid size-11 shrink-0 place-items-center rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] text-[15px] font-bold text-accent-text"
                      >
                        {tool.mono}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-zinc-50">
                          {tool.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-zinc-500">
                          {tool.description}
                        </span>
                        <span className="mt-1 block font-mono text-[10px] text-zinc-600">
                          v{tool.version} · {tool.perms.length} permission{tool.perms.length === 1 ? "" : "s"} · v2
                        </span>
                      </span>
                      {tool.canRun ? (
                        <GButton tone="secondary" size="sm" onClick={() => {}}>
                          <ArrowUpRight />
                          Make pack
                        </GButton>
                      ) : null}
                      <GButton
                        tone="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`View ${tool.name} details`}
                        aria-expanded={expanded}
                        onClick={() => setToolInfoId(expanded ? null : tool.id)}
                      >
                        <Info />
                      </GButton>
                      <GSwitch
                        label={`Toggle ${tool.name}`}
                        checked={tool.enabled}
                        onCheckedChange={(checked) =>
                          setTools((items) =>
                            items.map((item) => (item.id === tool.id ? { ...item, enabled: checked } : item)),
                          )
                        }
                      />
                    </div>
                    {expanded ? (
                      <div className="mt-2.5 border-t border-[var(--d-edge)] pt-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {tool.perms.map((perm) => (
                            <span
                              key={perm}
                              className={cn(
                                "rounded border px-1.5 py-0.5 font-mono text-[10.5px]",
                                tool.approved
                                  ? "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-200"
                                  : "border-[var(--d-edge)] bg-white/[0.03] text-zinc-400",
                              )}
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="font-mono text-[10.5px] text-zinc-600">
                            {tool.approved ? "Approved for this device" : "Needs approval"}
                          </p>
                          {tool.approved ? null : (
                            <GButton
                              tone="secondary"
                              size="sm"
                              onClick={() =>
                                setTools((items) =>
                                  items.map((item) =>
                                    item.id === tool.id ? { ...item, approved: true } : item,
                                  ),
                                )
                              }
                            >
                              Approve
                            </GButton>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
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
                  aria-controls="command-palette-results-i"
                  aria-activedescendant={
                    activeIndex >= 0 ? `command-palette-entry-i-${activeIndex}` : undefined
                  }
                  className="h-12 w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <DKbd>esc</DKbd>
              </div>
              <div
                id="command-palette-results-i"
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
            aria-labelledby="variant-i-dialog-title"
            aria-describedby="variant-i-dialog-desc"
            className="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--d-edge-hi)] bg-[#101014]/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_rgba(0,0,0,0.65),0_0_40px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="variant-i-dialog-title" className="text-[15px] font-semibold text-zinc-50">
              Remove scan root?
            </h2>
            <p id="variant-i-dialog-desc" className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
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

type RemoveStage = null | "choose" | { confirm: "library" | "disk" };

function BulkBar() {
  const [stage, setStage] = useState<RemoveStage>(null);
  const removeDefault: "library" | "disk" = "library";

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions for 3 selected sounds"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_40%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] px-3 py-2 shadow-[0_0_24px_color-mix(in_oklab,var(--accent-fill)_10%,transparent),inset_0_1px_0_rgba(255,255,255,0.05)]"
    >
      <span className="font-mono text-xs font-semibold tabular-nums text-accent-text">
        3 selected
      </span>
      <span className="flex-1" />
      <GButton tone="secondary" size="sm" onClick={() => {}}>
        <Heart />
        Save all
      </GButton>
      <GButton tone="secondary" size="sm" onClick={() => {}}>
        <ListPlus />
        Add to queue
      </GButton>
      <GButton tone="secondary" size="sm" onClick={() => {}}>
        <Puzzle />
        Add to Shelf
      </GButton>
      <GButton tone="secondary" size="sm" onClick={() => {}}>
        <Tags />
        Tag
      </GButton>
      {stage === null ? (
        <GButton tone="secondary" size="sm" onClick={() => setStage("choose")}>
          <Trash2 />
          Remove
        </GButton>
      ) : stage === "choose" ? (
        <>
          {(["library", "disk"] as const).map((choice) => (
            <GButton
              key={choice}
              tone="danger"
              size="sm"
              onClick={() => setStage({ confirm: choice })}
            >
              <Trash2 />
              {choice === "library" ? "From library" : "From disk"}
              {removeDefault === choice ? (
                <span className="rounded-full border border-[var(--d-edge)] bg-black/30 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-400">
                  Default
                </span>
              ) : null}
            </GButton>
          ))}
          <GButton tone="ghost" size="sm" aria-label="Cancel remove" onClick={() => setStage(null)}>
            <X />
          </GButton>
        </>
      ) : (
        <>
          <GButton tone="danger" size="sm" onClick={() => setStage(null)}>
            Sure?
          </GButton>
          <GButton tone="ghost" size="sm" aria-label="Cancel remove" onClick={() => setStage(null)}>
            <X />
          </GButton>
        </>
      )}
      <GButton tone="ghost" size="sm" onClick={() => {}}>
        <X />
        Clear
      </GButton>
    </div>
  );
}

const QUEUE_PAGE_SIZE = 5;

function CoverRow({
  tag,
  delta,
  count,
  goal,
  active,
  onSelect,
}: {
  tag: string;
  delta: number;
  count: number;
  goal: number;
  active: boolean;
  onSelect: () => void;
}) {
  const pct = Math.min(1, count / goal);
  const done = count >= goal;
  const empty = count === 0;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          "relative flex w-full flex-col gap-1.5 border-b border-[var(--d-edge)] px-3 py-2.5 text-left outline-none transition-colors last:border-b-0 hover:bg-white/[0.03]",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]",
          active && "bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
        )}
      >
        {active ? (
          <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent-fill shadow-[0_0_12px_color-mix(in_oklab,var(--accent-fill)_40%,transparent)]" />
        ) : null}
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold text-zinc-100">
            #{tag}
          </span>
          {delta > 0 ? (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-emerald-300">
              +{delta}
            </span>
          ) : null}
          <span
            className={cn(
              "shrink-0 font-mono text-xs tabular-nums",
              done ? "text-emerald-300" : empty ? "text-zinc-600" : "text-zinc-100",
            )}
          >
            {count}
            <span className="text-zinc-600">/{goal}</span>
          </span>
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <span
            className={cn(
              "block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
              done ? "bg-emerald-400" : empty ? "bg-transparent" : "bg-accent-fill",
            )}
            style={{ width: `${pct * 100}%` }}
          />
        </span>
      </button>
    </li>
  );
}

function ProvTag({
  name,
  selected = false,
  provenance,
  confidence,
}: {
  name: string;
  selected?: boolean;
  provenance?: TagOrigin | null;
  confidence?: number | null;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-[4px] border px-1.5 font-mono text-[11px] shadow-[var(--d-sink)]",
        selected
          ? "border-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_22%,transparent),color-mix(in_oklab,var(--accent-fill)_10%,transparent))] text-zinc-50"
          : "border-[var(--d-edge)] bg-[rgba(0,0,0,0.38)] text-zinc-300",
      )}
    >
      <span className="text-zinc-600">#</span>
      {name}
      {provenance ? <TagOriginMark origin={provenance} confidence={confidence} /> : null}
    </span>
  );
}

function StepDot({ active, completed }: { active: boolean; completed: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block size-2.5 rounded-full border border-white/15 bg-white/10 transition-colors",
        active && "border-accent-fill bg-accent-fill shadow-[0_0_10px_color-mix(in_oklab,var(--accent-fill)_50%,transparent)]",
        completed && "border-accent-fill/70 bg-accent-fill/70",
      )}
    />
  );
}

function StepLine({ active }: { active: boolean }) {
  return (
    <span aria-hidden className={cn("mx-1 h-px w-6 bg-white/10 sm:w-8", active && "bg-accent-fill/70")} />
  );
}

function QueueCard({
  words,
  page,
  onPage,
  onDismiss,
}: {
  words: Array<{ word: string; files: number }>;
  page: number;
  onPage: (page: number) => void;
  onDismiss: (word: string) => void;
}) {
  const maxPage = Math.max(0, Math.ceil(words.length / QUEUE_PAGE_SIZE) - 1);
  const safePage = Math.min(page, maxPage);
  const visible = words.slice(safePage * QUEUE_PAGE_SIZE, safePage * QUEUE_PAGE_SIZE + QUEUE_PAGE_SIZE);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-zinc-100">Candidate queue</h3>
        <p className="font-mono text-[11px] text-zinc-500">
          {words.length} word{words.length === 1 ? "" : "s"} need review
        </p>
      </div>
      {visible.length === 0 ? (
        <p className="py-3 text-[13px] text-zinc-500">Queue empty. Every word is covered.</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/[0.06] border-y border-[var(--d-edge)]">
          {visible.map((item) => (
            <li key={item.word} className="group flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">
                {item.word}
                <span className="ml-2 font-mono text-[11px] text-zinc-600">
                  {item.files} files
                </span>
              </span>
              <GButton
                tone="ghost"
                size="icon"
                className="size-7 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                aria-label={`Promote ${item.word} to a tag`}
                onClick={() => onDismiss(item.word)}
              >
                <Check />
              </GButton>
              <GButton
                tone="ghost"
                size="icon"
                className="size-7 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                aria-label={`Dismiss ${item.word}`}
                onClick={() => onDismiss(item.word)}
              >
                <X />
              </GButton>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between">
        <p className="font-mono text-[11px] text-zinc-600">
          Showing {words.length === 0 ? 0 : safePage * QUEUE_PAGE_SIZE + 1}–
          {Math.min(words.length, safePage * QUEUE_PAGE_SIZE + QUEUE_PAGE_SIZE)} of {words.length}
        </p>
        <div className="flex gap-1">
          <GButton
            tone="ghost"
            size="icon"
            className="size-7"
            aria-label="Previous queue page"
            disabled={safePage === 0}
            onClick={() => onPage(safePage - 1)}
          >
            <ChevronLeft />
          </GButton>
          <GButton
            tone="ghost"
            size="icon"
            className="size-7"
            aria-label="Next queue page"
            disabled={safePage >= maxPage}
            onClick={() => onPage(safePage + 1)}
          >
            <ChevronRight />
          </GButton>
        </div>
      </div>
    </div>
  );
}
