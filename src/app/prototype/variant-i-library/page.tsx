// PROTOTYPE ONLY — `/prototype/variant-i-library`.
//
// Development-only validation aid: this route reproduces the variant I
// specimen (`/prototype/component-library?variant=I`) using ONLY the
// extracted `@/components/variant-i` library, so the two can be compared
// pixel for pixel. The original variant-i.tsx remains the independent
// reference. This route uses specimen fixtures and simulated state.
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
  Heart,
  Layers,
  Library,
  ListMusic,
  Monitor,
  Play,
  Plus,
  RefreshCw,
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
import {
  Accordion,
  AIScore,
  Alert,
  Breadcrumb,
  BulkBar,
  Button,
  Card,
  Checkbox,
  CommandFooter,
  CommandPanel,
  CommandRow,
  CommandSection,
  CoverRow,
  Dialog,
  DialogDescription,
  DialogDivider,
  DialogFooter,
  DialogTitle,
  DirectoryRow,
  DotMatrixStatus,
  DropOffer,
  EmptyState,
  ExtensionRow,
  Field,
  IconButton,
  Kbd,
  Menu,
  MenuItem,
  MenuSeparator,
  NewTagButton,
  OnboardingStepper,
  PackFormatOption,
  PackSourceOption,
  PageButton,
  PlayButton,
  Progress,
  ProvTag,
  QueueCard,
  Radio,
  Rail,
  ScanStat,
  Scrubber,
  Select,
  SettingRow,
  SettingSwitchRow,
  ShortcutHint,
  ShortcutRow,
  SkeletonRow,
  Slider,
  StatusBadge,
  Surface,
  Switch,
  TabPanel,
  Tabs,
  TagChip,
  TagComposer,
  TagEditor,
  Toast,
  ToolCard,
  TooltipBubble,
  TransportPanel,
  ValidationMsg,
  VariantIProvider,
} from "@/components/variant-i";
import type { RemoveStage } from "@/components/variant-i";
import { ITEM_COLOR_PRESETS } from "@/lib/item-colors";
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
            {newSection ? <CommandSection>{entry.section}</CommandSection> : null}
            <CommandRow
              id={listbox ? `command-palette-entry-i-${index}` : undefined}
              role={listbox ? "option" : undefined}
              aria-selected={listbox ? index === activeIndex : undefined}
              active={index === activeIndex}
              icon={SECTION_ICONS[entry.section]}
              onClick={() => onSelect(index)}
              onMouseEnter={() => onHover(index)}
            >
              {entry.label}
            </CommandRow>
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

const SHORTCUT_LABELS: Record<string, string> = {
  "play-pause": "Play / pause",
  "go-library": "Go to Library",
  palette: "Open command palette",
};

export default function VariantILibraryPage() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [filter, setFilter] = useState("untagged");
  const [tagFilter, setTagFilter] = useState("all");
  const [semantic, setSemantic] = useState(true);
  const [page, setPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<Record<string, boolean>>({
    autoTag: true,
    janitor: true,
    shelf: true,
    semantic: false,
  });

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
  const [bulkStage, setBulkStage] = useState<RemoveStage>(null);

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
    <VariantIProvider className="relative min-h-full overflow-x-clip bg-[#0a0a0e]">
      <Surface className="relative min-h-full">
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
            <Button tone="secondary" onClick={openPalette}>
              <Kbd>
                <Command />
              </Kbd>
              Open command palette
            </Button>
          </header>

          {/* Cards hug their content: no stretch-blank in short cards. */}
          <div className="grid grid-cols-12 items-start gap-4">
            <Card
              title="Buttons"
              sub="Primary, secondary, and ghost buttons."
              glow="tl"
              className="col-span-12 lg:col-span-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Button tone="primary">
                  <AudioLines />
                  Analyze with CLAP
                </Button>
                <Button tone="secondary">
                  <Workflow />
                  Filename rules
                </Button>
                <Button tone="secondary" size="icon" aria-label="Download model">
                  <Download />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button tone="secondary">
                  <Download />
                  Download model
                </Button>
                <Button tone="secondary">Cancel</Button>
                <Button tone="danger">Delete</Button>
              </div>
            </Card>

            <Card
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
                    <Button tone="primary" look={state.look} className="w-full">
                      <AudioLines />
                      Analyze with CLAP
                    </Button>
                    <span className="text-xs text-zinc-500">{state.caption}</span>
                  </div>
                ))}
                <div className="flex flex-col items-center gap-2">
                  <Button tone="primary" loading className="w-full">
                    Analyzing…
                  </Button>
                  <span className="text-xs text-zinc-500">Loading</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Button tone="primary" disabled className="w-full">
                    <AudioLines />
                    Analyze with CLAP
                  </Button>
                  <span className="text-xs text-zinc-500">Disabled</span>
                </div>
              </div>
            </Card>

            <Card title="Input Fields" sub="Text inputs, search, and selects." className="col-span-12 md:col-span-6 lg:col-span-4">
              <div className="grid gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                  <Field className="pl-9 pr-16" placeholder="Search sounds by name, tag, or format…" aria-label="Search sounds" />
                  <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <Kbd>
                      <Command />
                    </Kbd>
                    <Kbd>K</Kbd>
                  </span>
                </div>
                <Field placeholder="Invalid path" aria-invalid aria-label="Invalid path" defaultValue="Invalid path" />
                <Select
                  label="Tag filter"
                  value={tagFilter}
                  onChange={setTagFilter}
                  options={[
                    { value: "all", label: "All tags" },
                    { value: "weather", label: "Weather" },
                    { value: "impact", label: "Impact" },
                  ]}
                  menuClassName="[animation:vi-menu-in_0.14s_ease-out] motion-reduce:[animation:none]"
                />
              </div>
            </Card>

            <Card title="Toggles & Switches" sub="Switch, checkbox, and radio inputs." className="col-span-12 md:col-span-6 lg:col-span-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="grid gap-3">
                  <span className="flex items-center gap-2.5">
                    <Switch label="Auto-tag new files" checked={settings.autoTag} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, autoTag: checked }))} />
                    <span className="text-[13px] text-zinc-300">Auto-tag new files</span>
                  </span>
                  <span className="flex items-center gap-2.5">
                    <Switch label="Folder Janitor" checked={settings.janitor} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, janitor: checked }))} />
                    <span className="text-[13px] text-zinc-300">Folder Janitor</span>
                  </span>
                  <Checkbox label="Enable semantic tagging" checked={semantic} onChange={setSemantic} />
                  <Checkbox label="Show waveform previews" checked={false} onChange={() => {}} />
                </div>
                <div className="grid content-start gap-3">
                  <Radio name="i-filter" label="All files" checked={filter === "all"} onChange={() => setFilter("all")} />
                  <Radio name="i-filter" label="Untagged only" checked={filter === "untagged"} onChange={() => setFilter("untagged")} />
                  <Radio name="i-filter" label="Custom filter" checked={filter === "custom"} onChange={() => setFilter("custom")} />
                </div>
              </div>
            </Card>

            <Card title="Badges" sub="Status and category badges." className="col-span-12 lg:col-span-4">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status="Ready" tone="ready" />
                <StatusBadge status="Processing" tone="processing" />
                <StatusBadge status="Unavailable" tone="unavailable" />
                <StatusBadge status="Error" tone="error" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <TagChip>#thunder</TagChip>
                <TagChip>#weather</TagChip>
                <TagChip>#impact</TagChip>
                <AIScore>AI 0.92</AIScore>
              </div>
            </Card>

            <Card title="Icon Buttons" sub="Common actions." className="col-span-12 sm:col-span-4 lg:col-span-2">
              <div className="grid max-w-40 grid-cols-3 gap-2">
                <IconButton label="Play">
                  <Play />
                </IconButton>
                <IconButton label="Favorite">
                  <Heart />
                </IconButton>
                <IconButton label="More actions">
                  <Ellipsis />
                </IconButton>
                <IconButton label="Download">
                  <Download />
                </IconButton>
                <IconButton label="Adjust">
                  <SlidersHorizontal />
                </IconButton>
                <IconButton label="Delete" tone="danger">
                  <Trash2 />
                </IconButton>
              </div>
            </Card>

            <Card title="File Row" sub="List item example." className="col-span-12 sm:col-span-8 lg:col-span-6">
              <div className="flex items-center gap-3 rounded-lg border border-[var(--vi-edge)] bg-black/25 p-3 shadow-[var(--vi-lift)]">
                <Button tone="secondary" size="icon" aria-label="Play rain_hit_deep_stereo_04.wav">
                  <Play />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    rain_hit_deep_stereo_04.wav
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-zinc-500">WAV · 00:04 · 48 kHz</p>
                </div>
                <div className="hidden flex-wrap justify-end gap-1.5 min-[420px]:flex">
                  <TagChip>#weather</TagChip>
                  <AIScore>#impact</AIScore>
                  <TagChip>#thunder</TagChip>
                  <AIScore>AI 0.92</AIScore>
                </div>
                <Button tone="ghost" size="icon" aria-label="More actions">
                  <Ellipsis />
                </Button>
              </div>
            </Card>

            <Card title="Dropdown / Command" sub="Sectioned palette with shortcut footer." className="col-span-12 lg:col-span-4">
              <CommandPanel>
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
                  <Kbd>esc</Kbd>
                </div>
                <div className="vi-scroll grid max-h-64 gap-0.5 overflow-y-auto p-1.5">
                  <SectionedRows
                    query={query}
                    activeIndex={activeIndex}
                    onHover={setActive}
                    onSelect={setActive}
                    emptyText="No matches."
                  />
                </div>
                <CommandFooter count={filtered.length} />
              </CommandPanel>
            </Card>

            <Card title="Progress" sub="Progress bar and stats." className="col-span-12 sm:col-span-5 lg:col-span-3">
              <Progress percent={5} top="Tagging progress" bottom="785/16,032 tagged · 15,247 to go" />
            </Card>

            <Card title="Alerts" sub="Info, success, warning, error." className="col-span-12 sm:col-span-7 lg:col-span-4">
              <div className="grid gap-2">
                <Alert
                  tone="warning"
                  monoTitle
                  title="What changed — queue collapsed, origins tab removed"
                  body="Queue: one summary (23) with the top 3 and a Show all expander."
                />
                <Alert
                  tone="error"
                  title="Invalid path"
                  body="The specified directory could not be found."
                />
              </div>
            </Card>

            <Card title="Pagination" sub="Simple pagination." className="col-span-12 sm:col-span-7 lg:col-span-3">
              <div className="flex items-center gap-1.5">
                <Button tone="secondary" size="icon" className="size-8" aria-label="Previous page" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="size-3.5" />
                </Button>
                {[1, 2, 3].map((n) => (
                  <PageButton key={n} label={String(n)} active={n === page} onClick={() => setPage(n)} />
                ))}
                <span className="px-0.5 font-mono text-xs text-zinc-600">…</span>
                <PageButton label="24" active={page === 24} onClick={() => setPage(24)} />
                <Button tone="secondary" size="icon" className="size-8" aria-label="Next page" onClick={() => setPage((p) => (p >= 3 ? 24 : p + 1))}>
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </Card>

            <Card title="Tooltip" sub="Hover info." className="col-span-12 flex flex-col sm:col-span-5 lg:col-span-2">
              <div className="flex flex-1 flex-col items-center justify-end gap-0 pb-1 pt-6">
                <TooltipBubble>Run filename rules</TooltipBubble>
                <IconButton label="Run filename rules">
                  <SlidersHorizontal />
                </IconButton>
              </div>
            </Card>

            <Card title="Tabs" sub="Settings and board tab bars." className="col-span-12 lg:col-span-5">
              <Tabs
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
                  <TabPanel tabKey="library">
                    <p className="text-[13px] text-zinc-300">
                      8,900 files · 214 MB · 3 scan roots
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-zinc-500">
                      Last scan 2 min ago · 0 errors
                    </p>
                  </TabPanel>
                ) : null}
                {tabValue === "collections" ? (
                  <TabPanel tabKey="collections">
                    <div className="grid gap-1.5">
                      {[
                        ["Rain & weather", "48 sounds"],
                        ["UI clicks", "112 sounds"],
                      ].map(([name, count]) => (
                        <div
                          key={name}
                          className="flex items-center justify-between rounded-md border border-[var(--vi-edge)] bg-black/25 px-2.5 py-2"
                        >
                          <span className="text-[13px] text-zinc-200">{name}</span>
                          <span className="font-mono text-[11px] text-zinc-500">{count}</span>
                        </div>
                      ))}
                    </div>
                  </TabPanel>
                ) : null}
                {tabValue === "extensions" ? (
                  <TabPanel tabKey="extensions">
                    <span className="flex items-center justify-between gap-3 rounded-md border border-[var(--vi-edge)] bg-black/25 px-2.5 py-2">
                      <span className="text-[13px] text-zinc-200">Auto-tag v2</span>
                      <Switch label="Auto-tag v2" checked={extensionsOn} onCheckedChange={setExtensionsOn} />
                    </span>
                  </TabPanel>
                ) : null}
              </div>
            </Card>

            <Card title="Sliders" sub="Volume and zoom controls." className="col-span-12 md:col-span-6 lg:col-span-4">
              <div className="grid gap-4">
                <div className="flex items-center gap-1">
                  <Button
                    tone="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={muted || volume === 0 ? "Unmute audio" : "Mute audio"}
                    onClick={() => setMuted((value) => !value)}
                  >
                    {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
                  </Button>
                  <div className="min-w-0 flex-1">
                    <Slider
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
                    <Slider
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
            </Card>

            <Card title="Icon Rail" sub="App navigation tiles." className="col-span-12 md:col-span-6 lg:col-span-3">
              <div className="flex justify-center">
                <Rail view={railView} onChange={setRailView} favorites={12} shelf={3} />
              </div>
            </Card>

            <Card title="Dialog" sub="Confirmation overlay." className="col-span-12 md:col-span-6 lg:col-span-4">
              <p className="text-[13px] leading-relaxed text-zinc-400">
                Removing a scan root drops its index entries. Files stay on disk.
              </p>
              <div className="mt-3">
                <Button tone="danger" onClick={() => setDialogOpen(true)}>
                  <Trash2 />
                  Remove root…
                </Button>
              </div>
            </Card>

            <Card title="Menu" sub="File-row context actions." className="col-span-12 md:col-span-6 lg:col-span-4">
              <Menu label="rain_hit_deep_stereo_04.wav">
                <MenuItem icon={<Copy />} onClick={() => {}}>
                  Copy path
                </MenuItem>
                <MenuItem icon={<Heart />} checked={menuFav} onClick={() => setMenuFav((value) => !value)}>
                  Favorite
                </MenuItem>
                <MenuItem icon={<ListMusic />} onClick={() => {}}>
                  Add to Shelf
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Trash2 />} danger onClick={() => {}}>
                  Remove from library
                </MenuItem>
              </Menu>
            </Card>

            <Card title="Toasts" sub="Scan and collection feedback." className="col-span-12 lg:col-span-4">
              {toasts.length > 0 ? (
                <div className="grid gap-2">
                  {toasts.map((toast) => (
                    <Toast
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
                  <Button tone="secondary" size="sm" onClick={() => setToasts(INITIAL_TOASTS)}>
                    Replay
                  </Button>
                </div>
              )}
            </Card>

            <Card title="Transport" sub="Player shell, redesigned." className="col-span-12 lg:col-span-7">
              {dismissed ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--vi-edge-hi)] px-3 py-2.5">
                  <p className="font-mono text-[11px] text-zinc-600">Transport dismissed</p>
                  <Button tone="ghost" size="sm" onClick={() => setDismissed(false)}>
                    Reopen player
                  </Button>
                </div>
              ) : (
                <TransportPanel>
                  <div className="flex items-center gap-3">
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        tone="ghost"
                        size="icon"
                        className="size-8 rounded-full"
                        aria-label="Previous in queue"
                        onClick={() => stepTrack(-1)}
                      >
                        <SkipBack fill="currentColor" className="size-4" />
                      </Button>
                      <PlayButton
                        playing={playing}
                        label={playing ? `Pause ${track.filename}` : `Play ${track.filename}`}
                        onClick={() => setPlaying((value) => !value)}
                      />
                      <Button
                        tone="ghost"
                        size="icon"
                        className="size-8 rounded-full"
                        aria-label="Next in queue"
                        onClick={() => stepTrack(1)}
                      >
                        <SkipForward fill="currentColor" className="size-4" />
                      </Button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold leading-tight text-zinc-100">
                        {track.filename}
                        <span className="ml-2 font-mono text-[11px] font-normal text-zinc-500">
                          {track.meta}
                          {nextTrack ? ` · next: ${nextTrack.filename}` : null}
                        </span>
                      </p>
                      <Scrubber
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
                    <IconButton
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
                    </IconButton>
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
                      className="grid size-8 shrink-0 place-items-center rounded-full border border-transparent text-zinc-400 outline-none transition-[background-color,border-color,box-shadow,color,transform] duration-150 hover:border-[var(--vi-edge)] hover:bg-white/[0.06] hover:text-zinc-100 motion-safe:hover:-translate-y-px motion-safe:active:scale-95 focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] motion-reduce:transition-none [&_svg]:size-4"
                    >
                      <FolderOpen />
                    </button>
                    <div className="flex w-28 shrink-0 items-center gap-1">
                      <Button
                        tone="ghost"
                        size="icon"
                        className="size-8 rounded-full"
                        aria-label={muted || volume === 0 ? "Unmute audio" : "Mute audio"}
                        onClick={() => setMuted((value) => !value)}
                      >
                        {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
                      </Button>
                      <div className="min-w-0 flex-1">
                        <Slider
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
                    <Button
                      tone="ghost"
                      size="icon"
                      className="size-8 rounded-full"
                      aria-label={autoplay ? "Turn autoplay off" : "Turn autoplay on"}
                      aria-pressed={autoplay}
                      title={autoplay ? "Autoplay on" : "Autoplay off"}
                      onClick={() => setAutoplay((value) => !value)}
                    >
                      <Repeat className={autoplay ? "text-accent-text" : undefined} />
                    </Button>
                    <span className="flex-1" />
                    {autoplay ? (
                      <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-accent-text min-[560px]:block">
                        Auto
                      </span>
                    ) : null}
                    <Button
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
                    </Button>
                  </div>
                </TransportPanel>
              )}
            </Card>

            <Card title="Accordion" sub="Folder-janitor disclosures." className="col-span-12 lg:col-span-5">
              <Accordion
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
            </Card>

            <Card title="Bulk Bar" sub="Multi-selection actions." className="col-span-12">
              <BulkBar
                count={3}
                removeDefault="library"
                stage={bulkStage}
                onStageChange={setBulkStage}
                onSaveAll={() => {}}
                onAddToQueue={() => {}}
                onAddToShelf={() => {}}
                onTag={() => {}}
                onClear={() => {}}
              />
            </Card>

            <Card title="Scan Job" sub="Live sync status and stats." className="col-span-12 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <RefreshCw
                    aria-hidden
                    className={cn("size-4 text-accent-text", scanning && "animate-spin motion-reduce:[animation:none]")}
                  />
                  <p className="text-sm font-medium text-zinc-200">Library sync</p>
                  {scanning ? (
                    <StatusBadge status="Indexing" tone="processing" />
                  ) : (
                    <StatusBadge status="Idle" tone="unavailable" />
                  )}
                </div>
                <Button
                  tone={scanning ? "secondary" : "primary"}
                  size="sm"
                  loading={scanning}
                  onClick={() => setScanning((value) => !value)}
                >
                  {scanning ? "Scanning…" : "Start Full Scan"}
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <ScanStat label="Phase" value={scanning ? "Indexing" : "Idle"} />
                <ScanStat label="Discovered" value={discovered.toLocaleString()} />
                <ScanStat label="Indexed" value={indexed.toLocaleString()} />
                <ScanStat label="Added" value="+12" tone="success" />
                <ScanStat label="Removed" value="−3" tone="error" />
                <ScanStat label="Roots" value="3" />
              </div>
            </Card>

            <Card title="Extensions" sub="Installed workflow tools." className="col-span-12 lg:col-span-5">
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
            </Card>

            <Card title="Shortcuts" sub="Press-to-rebind keys." className="col-span-12 md:col-span-6 lg:col-span-5">
              <div className="divide-y divide-white/[0.06]">
                {Object.keys(SHORTCUT_LABELS).map((action) => (
                  <ShortcutRow
                    key={action}
                    label={SHORTCUT_LABELS[action] ?? action}
                    binding={bindings[action] ?? "?"}
                    rebinding={rebinding === action}
                    onStart={() => setRebinding(action)}
                    onCancel={() => setRebinding(null)}
                  />
                ))}
              </div>
              <ShortcutHint>
                Select Change, then press a key. Escape cancels.
              </ShortcutHint>
            </Card>

            <Card title="Candidate Queue" sub="Words awaiting review." className="col-span-12 md:col-span-6 lg:col-span-7">
              <QueueCard
                words={queueWords}
                page={queuePage}
                onPage={setQueuePage}
                onPromote={(word) => {
                  setQueueWords((items) => items.filter((item) => item.word !== word));
                  setQueuePage(0);
                }}
                onDismiss={(word) => {
                  setQueueWords((items) => items.filter((item) => item.word !== word));
                  setQueuePage(0);
                }}
              />
            </Card>

            <Card title="Drop Offer" sub="Extension drop target." className="col-span-12 md:col-span-6 lg:col-span-4">
              <DropOffer
                active={dropActive}
                title={dropActive ? "Release to run on 4 files" : "Drop audio files here"}
                subtitle="Make Pack · Folder Janitor accept drops"
                onClick={() => setDropActive((value) => !value)}
              />
              <p className="mt-2 text-center font-mono text-[10.5px] text-zinc-600">
                Toggle the preview state by pressing the panel.
              </p>
            </Card>

            <Card title="Validation" sub="Path check results." className="col-span-12 md:col-span-6 lg:col-span-4">
              <div className="grid gap-2">
                <ValidationMsg valid />
                <ValidationMsg valid={false} />
              </div>
            </Card>

            <Card title="Empty State" sub="No-results placeholder." className="col-span-12 lg:col-span-4">
              <EmptyState
                title="No sounds match"
                body="Try clearing filters or searching for something else."
                actionLabel="Clear search"
                onAction={() => {}}
              />
            </Card>

            <Card title="Coverage Rail" sub="Board tag progress." className="col-span-12 lg:col-span-7">
              <ul className="overflow-hidden rounded-lg border border-[var(--vi-edge)]">
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
            </Card>

            <Card title="Provenance" sub="Tag origin marks." className="col-span-12 lg:col-span-5">
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
            </Card>

            <Card title="Pack Options" sub="Make-pack source and format." className="col-span-12 md:col-span-6 lg:col-span-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Source</p>
              <div className="mt-1.5 grid gap-1.5" role="radiogroup" aria-label="Pack source">
                {[
                  ["selection", "Current selection", "3 sounds selected in the library"],
                  ["shelf", "Sound Shelf", "Everything on your shelf"],
                  ["recent", "Recently previewed", "Last 20 auditions"],
                ].map(([value, label, desc]) => (
                  <PackSourceOption
                    key={value}
                    value={value}
                    label={label}
                    description={desc}
                    selected={packSource === value}
                    onSelect={setPackSource}
                  />
                ))}
              </div>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Format</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Pack format">
                {["folder", "zip"].map((format) => (
                  <PackFormatOption
                    key={format}
                    value={format}
                    label={format === "folder" ? "Folder" : "ZIP archive"}
                    selected={packFormat === format}
                    onSelect={setPackFormat}
                  />
                ))}
              </div>
            </Card>

            <Card title="Onboarding Steps" sub="First-run stepper." className="col-span-12 md:col-span-6 lg:col-span-3">
              <OnboardingStepper
                steps={["Welcome", "Folder", "Scan"]}
                stepIndex={stepIdx}
                onSelect={setStepIdx}
              />
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                {stepIdx === 0
                  ? "Meet Foleyard, the local-first sound library."
                  : stepIdx === 1
                    ? "Point Foleyard at your sound folders."
                    : "Index everything and start browsing."}
              </p>
            </Card>

            <Card title="Skeleton Tiles" sub="Loading placeholders." className="col-span-12 lg:col-span-4">
              <div className="grid gap-2" aria-hidden>
                {[0, 1].map((skeleton) => (
                  <SkeletonRow key={skeleton} />
                ))}
              </div>
            </Card>

            <Card title="Dot-Matrix Status" sub="Service glyph and phase." className="col-span-12 md:col-span-6 lg:col-span-4">
              <DotMatrixStatus
                label="Status"
                detail={scanning ? "Indexing… 1,204 of 8,900" : "Service Online"}
                active={scanning}
                onToggle={setScanning}
                switchLabel="Simulate scan"
              />
              <p className="mt-2 font-mono text-[10.5px] text-zinc-600">
                The glyph animates while a job runs. Flip the switch.
              </p>
            </Card>

            <Card title="Directories" sub="Folder browser rows." className="col-span-12 md:col-span-6 lg:col-span-8">
              <Breadcrumb
                crumbs={crumbs}
                onNavigate={(index) => setCrumbs(crumbs.slice(0, index + 1))}
              />
              <div className="mt-2 overflow-hidden rounded-lg border border-[var(--vi-edge)]">
                {[
                  ["field-recordings", "18 sounds · 2 folders"],
                  ["rain", "6 sounds · 0 folders"],
                  ["urban", "24 sounds · 1 folder"],
                ].map(([label, subtitle]) => (
                  <DirectoryRow
                    key={label}
                    label={label}
                    subtitle={subtitle}
                    onClick={() => setCrumbs((path) => [...path, label])}
                  />
                ))}
              </div>
            </Card>

            <Card title="Organize Tags" sub="Color chips, editor, composer." className="col-span-12 lg:col-span-7">
              <div className="flex items-center gap-2">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Tags
                </p>
                <NewTagButton open={composerOpen} onClick={() => setComposerOpen((value) => !value)} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
                {orgTags.map((tag) => {
                  if (editingId === tag.id) {
                    const armed = delArmedId === tag.id;
                    return (
                      <TagEditor
                        key={tag.id}
                        name={tagDraft}
                        color={tagColorDraft}
                        armed={armed}
                        onNameChange={setTagDraft}
                        onColorChange={setTagColorDraft}
                        onCommit={() => {
                          if (tagDraft.trim()) {
                            setOrgTags((items) =>
                              items.map((item) =>
                                item.id === tag.id
                                  ? { ...item, name: tagDraft.trim(), color: tagColorDraft }
                                  : item,
                              ),
                            );
                          }
                          setEditingId(null);
                        }}
                        onCancel={() => setEditingId(null)}
                        onDelete={() => {
                          setOrgTags((items) => items.filter((item) => item.id !== tag.id));
                          setEditingId(null);
                          setDelArmedId(null);
                        }}
                        onArmDelete={() => setDelArmedId(tag.id)}
                        onDeleteCancel={() => setDelArmedId(null)}
                      />
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
                        "focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
                        chipActive
                          ? "text-zinc-100"
                          : "border-[var(--vi-edge)] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.06]",
                      )}
                    >
                      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
              {composerOpen ? (
                <TagComposer
                  name={compName}
                  color={compColor}
                  onNameChange={setCompName}
                  onColorChange={setCompColor}
                  onSubmit={() => {
                    if (compName.trim()) {
                      setOrgTags((items) => [
                        ...items,
                        { id: `g-${Date.now()}`, name: compName.trim(), color: compColor },
                      ]);
                      setCompName("");
                      setComposerOpen(false);
                    }
                  }}
                  onCancel={() => setComposerOpen(false)}
                />
              ) : null}
            </Card>

            <Card title="Setting Rows" sub="Validated extension settings." className="col-span-12 lg:col-span-5">
              <div className="grid gap-1">
                <SettingRow
                  title="Output format"
                  description={
                    <>
                      <p className="mt-0.5 text-xs text-zinc-500">Folder keeps files loose; ZIP packs them.</p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">Default: folder</p>
                    </>
                  }
                >
                  <Select
                    label="Output format"
                    value={packFormatSetting}
                    onChange={setPackFormatSetting}
                    options={[
                      { value: "folder", label: "Folder" },
                      { value: "zip", label: "ZIP archive" },
                    ]}
                  />
                </SettingRow>
                <SettingRow
                  title="Pack name"
                  description={
                    <>
                      <p className="mt-0.5 text-xs text-zinc-500">Used for the output folder or file.</p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">Default: untitled-pack</p>
                    </>
                  }
                >
                  <Field
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
                  />
                  {packNameError ? (
                    <p role="alert" className="mt-1.5 text-xs text-accent-text">
                      {packNameError}
                    </p>
                  ) : null}
                </SettingRow>
                <SettingSwitchRow
                  title="Notify when done"
                  description="Default: on"
                  checked={notifyOn}
                  onCheckedChange={setNotifyOn}
                  switchLabel="Notify when done"
                />
              </div>
            </Card>

            <Card title="Tool Cards" sub="Extension tools grid." className="col-span-12">
              <div className="grid gap-2 md:grid-cols-2">
                {tools.map((tool) => {
                  const expanded = toolInfoId === tool.id;
                  return (
                    <ToolCard
                      key={tool.id}
                      monogram={tool.mono}
                      name={tool.name}
                      version={tool.version}
                      description={tool.description}
                      perms={tool.perms}
                      approved={tool.approved}
                      enabled={tool.enabled}
                      canRun={tool.canRun}
                      runLabel={tool.name === "Make Pack v2" ? "Make pack" : undefined}
                      onRun={() => {}}
                      onToggle={(enabled) =>
                        setTools((items) =>
                          items.map((item) => (item.id === tool.id ? { ...item, enabled } : item)),
                        )
                      }
                      onToggleInfo={() => setToolInfoId(expanded ? null : tool.id)}
                      expanded={expanded}
                    />
                  );
                })}
              </div>
            </Card>
          </div>
        </div>

        {collOpen && collPos ? (
          <div
            ref={collMenuRef}
            role="menu"
            aria-label="Collections"
            style={{ top: collPos.top, left: collPos.left }}
            className="fixed z-[70] w-60 [animation:vi-menu-in_0.14s_ease-out] motion-reduce:[animation:none]"
          >
            <Menu label="Collections">
              {SHELF_COLLECTIONS.map((collection) => (
                <MenuItem
                  key={collection.id}
                  icon={collection.smart ? <Sparkles /> : <ListMusic />}
                  meta={"fileCount" in collection ? collection.fileCount : "Smart"}
                  onClick={() => setCollOpen(false)}
                >
                  {collection.name}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem icon={<Plus />} onClick={() => setCollOpen(false)}>
                New collection…
              </MenuItem>
            </Menu>
          </div>
        ) : null}

        {paletteOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
            onClick={() => setPaletteOpen(false)}
          >
            <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
              <CommandPanel>
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
                  <Kbd>esc</Kbd>
                </div>
                <div
                  id="command-palette-results-i"
                  role="listbox"
                  aria-label="Command results"
                  className="vi-scroll grid max-h-80 gap-0.5 overflow-y-auto p-1.5"
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
                <CommandFooter count={filtered.length} />
              </CommandPanel>
            </div>
          </div>
        ) : null}

        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          labelledBy="variant-i-dialog-title"
          describedBy="variant-i-dialog-desc"
        >
          <DialogTitle id="variant-i-dialog-title">Remove scan root?</DialogTitle>
          <DialogDescription id="variant-i-dialog-desc">
            C:/Sound Library/SFX and its 8,900 indexed files will leave the library. Files
            stay on disk.
          </DialogDescription>
          <DialogDivider />
          <DialogFooter>
            <Button autoFocus tone="secondary" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button tone="danger" size="sm" onClick={() => setDialogOpen(false)}>
              <Trash2 />
              Remove
            </Button>
          </DialogFooter>
        </Dialog>
      </Surface>
    </VariantIProvider>
  );
}