// PROTOTYPE ONLY — variant J, "the app, new parts". The existing workspace UI
// with every element switched from current to the new component library: rail,
// search, origin tabs, sort select, breadcrumb + folders, file rows with
// provenance tags, bulk bar, and per view — shelf with pack options and drop
// offer, extensions with tool cards and janitor accordion, organize with color
// tags and composer, auto-tag with scan job, alerts, coverage rails and queue,
// settings with roots, validation, sliders, switches, shortcuts and stepper —
// plus the transport console, sectioned palette, toasts and dialogs. No stock
// UI components remain in this file; everything resolves to the D/G/H kits
// (plus the unstyled TagOriginMark, DotmSquare3 and item colors).
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  Command,
  Download,
  Ellipsis,
  FileMusic,
  FileUp,
  Folder,
  FolderPlus,
  Heart,
  Info,
  Keyboard,
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
import type { TagOrigin } from "@yard-core";

import { TagOriginMark } from "@/components/FileTable/tag-origin-mark";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import { ITEM_COLOR_PRESETS, onColorText } from "@/lib/item-colors";

import { SPECIMEN_COMMANDS } from "./fixtures";
import type { SpecimenState } from "./page";
import {
  DAlert,
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

type LibTag = { name: string; provenance?: TagOrigin | null; confidence?: number | null };
type LibFile = {
  filename: string;
  meta: string;
  dir: string;
  duration: number;
  current?: string;
  tags: LibTag[];
};

const LIB_FILES: LibFile[] = [
  {
    filename: "rain_hit_deep_stereo_04.wav",
    meta: "WAV · 00:04 · 48 kHz · 1.4 MB",
    dir: "rain",
    duration: 4,
    current: "impact",
    tags: [
      { name: "weather", provenance: "deterministic" },
      { name: "impact", provenance: "manual" },
      { name: "thunder", provenance: "semantic_ai", confidence: 0.92 },
    ],
  },
  {
    filename: "foley_cloth_rustle_light_take12_bounce_final.wav",
    meta: "WAV · 00:02 · 96 kHz · 2.1 MB",
    dir: "field-recordings",
    duration: 2,
    tags: [
      { name: "foley", provenance: "manual" },
      { name: "cloth", provenance: "deterministic" },
      { name: "movement", provenance: "semantic_ai", confidence: 0.41 },
    ],
  },
  {
    filename: "whoosh_large_01.wav",
    meta: "WAV · 00:03 · 48 kHz · 0.9 MB",
    dir: "urban",
    duration: 3,
    current: "whoosh",
    tags: [{ name: "whoosh", provenance: "deterministic" }],
  },
];

const FOLDERS: Array<{ name: string; subtitle: string }> = [
  { name: "field-recordings", subtitle: "1 sound · 0 folders" },
  { name: "rain", subtitle: "1 sound · 0 folders" },
  { name: "urban", subtitle: "1 sound · 0 folders" },
];

const PEAKS: ReadonlyArray<number> = Array.from({ length: 64 }, (_, i) =>
  Math.min(1, 0.22 + 0.72 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23))),
);

const SHELF_COLLECTIONS = [
  { id: "c-rain", name: "Rain & weather", fileCount: 48 },
  { id: "c-ui", name: "UI clicks", fileCount: 112 },
  { id: "c-untagged", name: "Untagged", smart: true },
];

const SHORTCUT_LABELS: Record<string, string> = {
  "play-pause": "Play / pause",
  "go-library": "Go to Library",
  palette: "Open command palette",
};

function fmtTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type RailView = "library" | "favorites" | "shelf" | "extensions" | "organize" | "auto-tag";

const VIEW_COPY: Record<RailView, { title: string; sub: string }> = {
  library: { title: "Library", sub: "8,900 sounds · 3 scan roots" },
  favorites: { title: "Favorites", sub: "Your starred sounds" },
  shelf: { title: "Shelf", sub: "Sounds under review" },
  extensions: { title: "Extensions", sub: "Optional workflows. Flip one on and it joins the workspace." },
  organize: { title: "Organize", sub: "Collections and tags in one place." },
  "auto-tag": { title: "Auto tag", sub: "Coverage, candidates, and similar sounds." },
};

const RAIL_ITEMS: Array<{ id: RailView; label: string; badge?: number }> = [
  { id: "library", label: "Library" },
  { id: "favorites", label: "Favor" },
  { id: "shelf", label: "Shelf" },
  { id: "extensions", label: "Ext" },
  { id: "organize", label: "Orgs" },
  { id: "auto-tag", label: "Tags" },
];

function RailGlyph({ id }: { id: string }) {
  if (id === "favorites") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    );
  }
  if (id === "shelf") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 12H3" />
        <path d="M16 8h-5" />
        <path d="M16 16h-5" />
        <path d="m19 10 2 2-2 2" />
      </svg>
    );
  }
  if (id === "extensions" || id === "organize") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m12 2 9 4.9v9.9L12 22l-9-5.1V6.9L12 2Z" />
      </svg>
    );
  }
  if (id === "auto-tag") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v3" />
        <path d="M18.4 5.6 16.3 7.7" />
        <path d="M21 12h-3" />
        <path d="M18.4 18.4l-2.1-2.1" />
        <path d="M12 18v3" />
        <path d="M7.7 16.3l-2.1 2.1" />
        <path d="M6 12H3" />
        <path d="M7.7 7.7 5.6 5.6" />
        <circle cx="12" cy="12" r="3.2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m16 6 4 14" />
      <path d="M12 6v14" />
      <path d="M8 8v12" />
      <path d="M4 4v16" />
    </svg>
  );
}

type ToastSpec = { id: string; tone: "success" | "error" | "info"; title: string; message: string };

function ProvChip({
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
  const ai = provenance === "semantic_ai" && (confidence ?? 0) >= 0.8;
  return (
    <span
      className={cn(
        "inline-flex h-[20px] items-center gap-1 rounded-[4px] border px-1.5 font-mono text-[11px] leading-none shadow-[var(--d-sink)]",
        selected
          ? "border-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_22%,transparent),color-mix(in_oklab,var(--accent-fill)_10%,transparent))] text-zinc-50"
          : ai
            ? "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[rgba(0,0,0,0.38)] text-accent-text"
            : "border-[var(--d-edge)] bg-[rgba(0,0,0,0.38)] text-zinc-300",
      )}
    >
      <span className={selected || ai ? "text-accent-text" : "text-zinc-600"}>#</span>
      {name}
      {provenance ? <TagOriginMark origin={provenance} confidence={confidence} /> : null}
    </span>
  );
}

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
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
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

export function VariantJ({ settings, onToggleSetting }: SpecimenState) {
  const [railView, setRailView] = useState<RailView>("library");
  const [viewLoading, setViewLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("all");
  const [sort, setSort] = useState("name");
  const [crumbs, setCrumbs] = useState<string[]>(["Library"]);
  const [selectedIds, setSelectedIds] = useState<string[]>([LIB_FILES[0]?.filename ?? ""]);
  const [favs, setFavs] = useState<Record<string, boolean>>({
    "rain_hit_deep_stereo_04.wav": true,
  });
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // Transport state.
  const [trackName, setTrackName] = useState(LIB_FILES[0]?.filename ?? "");
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [collOpen, setCollOpen] = useState(false);
  const [collPos, setCollPos] = useState<{ top: number; left: number } | null>(null);
  const collTriggerRef = useRef<HTMLButtonElement>(null);
  const collMenuRef = useRef<HTMLDivElement>(null);

  // Palette state.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-tag state.
  const [scanning, setScanning] = useState(true);
  const [discovered, setDiscovered] = useState(1204);
  const [indexed, setIndexed] = useState(860);
  const [toasts, setToasts] = useState<ToastSpec[]>([
    { id: "t-started", tone: "info", title: "Scan started", message: "Watching 3 roots for new sounds." },
  ]);
  const [coverageSel, setCoverageSel] = useState("thunder");
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
  const [page, setPage] = useState(1);

  // Organize state.
  const [orgTab, setOrgTab] = useState("tags");
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
  const [compName, setCompName] = useState("");
  const [compColor, setCompColor] = useState(ITEM_COLOR_PRESETS[4] ?? "#7ab8ff");
  const [collections, setCollections] = useState([
    { id: "c1", name: "Rain & weather", count: "48 sounds" },
    { id: "c2", name: "UI clicks", count: "112 sounds" },
  ]);
  const [collName, setCollName] = useState("");

  // Extensions state.
  const [extJanitor, setExtJanitor] = useState(true);
  const [extPack, setExtPack] = useState(false);
  const [permsApproved, setPermsApproved] = useState(false);
  const [toolInfoOpen, setToolInfoOpen] = useState(false);

  // Shelf + pack state.
  const [packSource, setPackSource] = useState("shelf");
  const [packFormat, setPackFormat] = useState("folder");
  const [dropActive, setDropActive] = useState(false);

  // Settings state.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("library");
  const [dialogRoot, setDialogRoot] = useState("");
  const [roots, setRoots] = useState(["C:/Sound Library/SFX"]);
  const [newRoot, setNewRoot] = useState("");
  const [rootMsg, setRootMsg] = useState<{ valid: boolean } | null>(null);
  const [zoom, setZoom] = useState(100);
  const [semantic, setSemantic] = useState(true);
  const [notifyOn, setNotifyOn] = useState(true);
  const [packName, setPackName] = useState("rain-pack");
  const [packNameError, setPackNameError] = useState<string | null>(null);
  const [bindings, setBindings] = useState<Record<string, string>>({
    "play-pause": "Space",
    "go-library": "g",
    palette: "k",
  });
  const [rebinding, setRebinding] = useState<string | null>(null);
  const [removeDefault, setRemoveDefault] = useState("library");
  const [stepIdx, setStepIdx] = useState(1);

  const track = LIB_FILES.find((file) => file.filename === trackName) ?? LIB_FILES[0];
  const trackIdx = Math.max(0, LIB_FILES.findIndex((file) => file.filename === trackName));
  const nextTrack = LIB_FILES[(trackIdx + 1) % LIB_FILES.length];
  const duration = track?.duration ?? 4;
  const peaks = PEAKS.map((_, i) => PEAKS[(i + trackIdx * 11) % PEAKS.length] ?? 0.3);
  const favCount = Object.values(favs).filter(Boolean).length;
  const railFavCount = favCount;
  const railShelfCount = selectedIds.length;

  const switchView = (view: RailView) => {
    setRailView(view);
    setViewLoading(true);
    window.setTimeout(() => setViewLoading(false), 450);
  };

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setElapsed((value) => (value + 0.1 >= duration ? 0 : +(value + 0.1).toFixed(2)));
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, duration]);

  useEffect(() => {
    if (!scanning) return;
    const timer = window.setInterval(() => {
      setDiscovered((value) => value + 23);
      setIndexed((value) => value + 19);
    }, 600);
    return () => window.clearInterval(timer);
  }, [scanning]);

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

  const openPalette = () => {
    setPaletteOpen(true);
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const filteredPalette = SPECIMEN_COMMANDS.filter((entry) =>
    entry.label.toLowerCase().includes(query.toLowerCase()),
  );
  const paletteIndex = Math.min(active, Math.max(0, filteredPalette.length - 1));

  useEffect(() => {
    if (!paletteOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPaletteOpen(false);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => Math.min(index + 1, filteredPalette.length - 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter" && filteredPalette[paletteIndex]) setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteIndex, filteredPalette, paletteOpen]);

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

  const inDir = crumbs.length > 1 ? crumbs[crumbs.length - 1] : null;
  const matchesSearch = (file: (typeof LIB_FILES)[number]) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      file.filename.toLowerCase().includes(q) ||
      file.tags.some((tag) => tag.name.includes(q))
    );
  };
  const matchesOrigin = (file: (typeof LIB_FILES)[number]) =>
    origin === "all" || file.tags.some((tag) => tag.provenance === origin);
  const matchesDir = (file: (typeof LIB_FILES)[number]) => !inDir || file.dir === inDir;
  let files = LIB_FILES.filter((file) => matchesSearch(file) && matchesOrigin(file) && matchesDir(file));
  if (sort === "longest") files = [...files].sort((a, b) => b.duration - a.duration);
  if (sort === "shortest") files = [...files].sort((a, b) => a.duration - b.duration);
  if (sort === "name") files = [...files].sort((a, b) => a.filename.localeCompare(b.filename));
  if (railView === "favorites") files = files.filter((file) => favs[file.filename]);
  const shelfFiles = LIB_FILES.filter((file) => selectedIds.includes(file.filename));

  const loadTrack = (filename: string) => {
    setTrackName(filename);
    setElapsed(0);
    setPlaying(true);
    setDismissed(false);
  };

  const stepTrack = (delta: 1 | -1) => {
    const next = (trackIdx + delta + LIB_FILES.length) % LIB_FILES.length;
    const row = LIB_FILES[next];
    if (!row) return;
    setTrackName(row.filename);
    setElapsed(0);
  };

  const copy = VIEW_COPY[railView];
  const maxQueuePage = Math.max(0, Math.ceil(queueWords.length / 5) - 1);
  const safeQueuePage = Math.min(queuePage, maxQueuePage);
  const visibleQueue = queueWords.slice(safeQueuePage * 5, safeQueuePage * 5 + 5);

  const pushToast = (toast: ToastSpec) =>
    setToasts((items) => (items.some((item) => item.id === toast.id) ? items : [...items, toast]));

  const fileRow = (file: (typeof LIB_FILES)[number]) => {
    const isCurrent = file.filename === trackName;
    return (
      <div
        key={file.filename}
        className={cn(
          "group flex items-center gap-2.5 rounded-lg border p-2.5 transition-[border-color,background-color] duration-150",
          isCurrent
            ? "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_7%,transparent)]"
            : "border-[var(--d-edge)] bg-black/25 hover:border-[var(--d-edge-hi)] hover:bg-white/[0.03]",
        )}
      >
        <GCheckbox
          label={`Select ${file.filename}`}
          checked={selectedIds.includes(file.filename)}
          onChange={(next) =>
            setSelectedIds((ids) =>
              next ? [...ids, file.filename] : ids.filter((id) => id !== file.filename),
            )
          }
        />
        <GButton
          tone="secondary"
          size="icon"
          className="size-7 [&_svg]:size-3.5"
          aria-label={`Play ${file.filename}`}
          onClick={() => {
            loadTrack(file.filename);
            setSelectedIds([file.filename]);
          }}
        >
          {isCurrent && playing ? <Pause /> : <Play />}
        </GButton>
        <button
          type="button"
          onClick={() => {
            loadTrack(file.filename);
            setSelectedIds([file.filename]);
          }}
          className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]"
        >
          <span className="block truncate text-[13px] font-medium text-zinc-100">{file.filename}</span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-500">{file.meta}</span>
        </button>
        <span className="hidden flex-wrap justify-end gap-1 min-[560px]:flex">
          {file.tags.map((tag) => (
            <ProvChip
              key={tag.name}
              name={tag.name}
              selected={file.current === tag.name}
              provenance={tag.provenance}
              confidence={tag.confidence}
            />
          ))}
        </span>
        <GButton
          tone="ghost"
          size="icon"
          className="size-7 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [&_svg]:size-3.5"
          aria-label={`More actions for ${file.filename}`}
          onClick={openPalette}
        >
          <Ellipsis />
        </GButton>
        <GIconButton
          label={favs[file.filename] ? `Remove ${file.filename} from favorites` : `Add ${file.filename} to favorites`}
          tone={favs[file.filename] ? "danger" : "secondary"}
          aria-pressed={!!favs[file.filename]}
          onClick={() => setFavs((prev) => ({ ...prev, [file.filename]: !prev[file.filename] }))}
          className="size-8 rounded-full"
        >
          <Heart fill={favs[file.filename] ? "currentColor" : "none"} className={favs[file.filename] ? "text-accent-text" : undefined} />
        </GIconButton>
      </div>
    );
  };

  const skeletonRows = (
    <div className="grid gap-2" aria-hidden>
      {[0, 1, 2].map((skeleton) => (
        <div
          key={skeleton}
          className="flex animate-pulse items-center gap-2.5 rounded-lg border border-[var(--d-edge)] bg-black/25 p-2.5 motion-reduce:animate-none"
        >
          <span className="size-4 shrink-0 rounded-[4px] bg-white/[0.07]" />
          <span className="size-7 shrink-0 rounded-md bg-white/[0.06]" />
          <span className="min-w-0 flex-1">
            <span className="block h-3 w-2/3 rounded bg-white/[0.07]" />
            <span className="mt-1.5 block h-2.5 w-1/3 rounded bg-white/[0.05]" />
          </span>
          <span className="size-8 shrink-0 rounded-full bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );

  const emptyState = (title: string, body: string, action?: React.ReactNode) => (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span aria-hidden className="grid size-11 place-items-center rounded-xl border border-[var(--d-edge)] bg-white/[0.03] text-zinc-500 shadow-[var(--d-lift)] [&_svg]:size-5">
        <Search />
      </span>
      <p className="mt-3 text-sm font-medium text-zinc-100">{title}</p>
      <p className="mt-1 max-w-56 text-xs leading-relaxed text-zinc-500">{body}</p>
      {action}
    </div>
  );

  return (
    <DSurface className="relative min-h-full overflow-x-clip bg-[#0a0a0e]">
      <GKeyframes />
      <HKeyframes />
      <span aria-hidden className="pointer-events-none absolute -left-24 top-0 size-72 rounded-full bg-[color-mix(in_oklab,var(--accent-fill)_7%,transparent)] blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -right-24 bottom-0 size-80 rounded-full bg-[color-mix(in_oklab,var(--accent-fill)_6%,transparent)] blur-3xl" />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent-text">
          Foleyard / Workspace
        </p>

        <div className="flex min-h-[640px] gap-3 overflow-hidden rounded-2xl border border-[var(--d-edge-hi)] bg-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_60px_rgba(0,0,0,0.55)]">
          <div className="hidden w-[76px] shrink-0 flex-col items-center gap-1.5 border-r border-[var(--d-edge)] p-2 sm:flex" role="tablist" aria-label="Views">
            {RAIL_ITEMS.map((item) => {
              const itemActive = item.id === railView;
              const badge = item.id === "favorites" ? railFavCount : item.id === "shelf" ? railShelfCount : undefined;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={itemActive}
                  onClick={() => switchView(item.id)}
                  className={cn(
                    "relative flex w-16 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[10px] font-semibold uppercase tracking-widest outline-none transition-[background-color,border-color,box-shadow,color,transform] duration-150",
                    "motion-safe:hover:-translate-y-px motion-safe:active:scale-[0.96]",
                    "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]",
                    itemActive
                      ? "border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_15%,transparent)] text-accent-text shadow-[0_0_18px_color-mix(in_oklab,var(--accent-fill)_16%,transparent)]"
                      : "border-transparent text-zinc-500 hover:border-[var(--d-edge)] hover:bg-white/[0.04] hover:text-zinc-200",
                    "[&_svg]:size-5",
                  )}
                >
                  {badge ? (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-accent-fill px-1 font-mono text-[9px] font-bold leading-tight text-white">
                      {badge}
                    </span>
                  ) : null}
                  <RailGlyph id={item.id} />
                  {item.label}
                </button>
              );
            })}
            <span className="flex-1" />
            <GIconButton label="Open settings" tone={dialogOpen ? "danger" : "secondary"} aria-expanded={dialogOpen} onClick={() => setDialogOpen(true)} className="size-10">
              <SlidersHorizontal />
            </GIconButton>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2.5 border-b border-[var(--d-edge)] px-4 py-3">
              <Search aria-hidden className="size-4 shrink-0 text-zinc-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search sounds by name, tag, or format…"
                aria-label="Search sounds"
                className="w-full bg-transparent text-[15px] font-medium text-zinc-50 outline-none placeholder:font-normal placeholder:text-zinc-600"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="shrink-0 rounded-md px-2 py-1 font-mono text-[11px] text-zinc-500 outline-none transition-colors hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]"
                >
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={openPalette}
                aria-label="Open command palette"
                title="Command palette (Ctrl+K)"
                className="hidden shrink-0 items-center gap-2 rounded-lg border border-[var(--d-edge)] bg-white/[0.04] px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 outline-none transition-colors hover:border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] sm:flex"
              >
                <DKbd>
                  <Command />
                </DKbd>
                K <span className="text-zinc-600">{files.length}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-4">
              <div>
                <h2 className="text-[28px] font-extrabold leading-none tracking-tighter text-zinc-50">
                  {copy.title}
                </h2>
                <p className="mt-1.5 text-[13px] font-medium text-zinc-500">{copy.sub}</p>
              </div>
              {railView === "library" ? (
                <div className="flex items-center gap-2">
                  <HTabs
                    label="Filter by tag origin"
                    value={origin}
                    onChange={setOrigin}
                    tabs={[
                      { value: "all", label: "All" },
                      { value: "manual", label: "Manual" },
                      { value: "deterministic", label: "Rules" },
                      { value: "semantic_ai", label: "AI" },
                    ]}
                  />
                  <DSelect
                    label="Sort order"
                    value={sort}
                    onChange={setSort}
                    options={[
                      { value: "name", label: "Name" },
                      { value: "longest", label: "Longest" },
                      { value: "shortest", label: "Shortest" },
                    ]}
                    className="w-28"
                  />
                </div>
              ) : null}
            </div>

            {selectedIds.length > 1 && (railView === "library" || railView === "favorites" || railView === "shelf") ? (
              <div className="px-4 pb-2">
                <div
                  role="toolbar"
                  aria-label={`Bulk actions for ${selectedIds.length} selected sounds`}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_40%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] px-3 py-2 shadow-[0_0_24px_color-mix(in_oklab,var(--accent-fill)_10%,transparent),inset_0_1px_0_rgba(255,255,255,0.05)]"
                >
                  <span className="font-mono text-xs font-semibold tabular-nums text-accent-text">
                    {selectedIds.length} selected
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
                  {confirmingRemove ? (
                    <>
                      <GButton tone="danger" size="sm" onClick={() => { setSelectedIds([]); setConfirmingRemove(false); }}>
                        Sure?
                      </GButton>
                      <GButton tone="ghost" size="sm" aria-label="Cancel remove" onClick={() => setConfirmingRemove(false)}>
                        <X />
                      </GButton>
                    </>
                  ) : (
                    <GButton tone="secondary" size="sm" onClick={() => setConfirmingRemove(true)}>
                      <Trash2 />
                      Remove
                    </GButton>
                  )}
                  <GButton tone="ghost" size="sm" onClick={() => { setSelectedIds([]); setConfirmingRemove(false); }}>
                    <X />
                    Clear
                  </GButton>
                </div>
              </div>
            ) : null}

            <div className="foleyard-library-scroll max-h-[380px] min-h-[280px] flex-1 overflow-y-auto px-4 pb-4">
              {viewLoading ? (
                skeletonRows
              ) : railView === "library" ? (
                <div className="grid gap-2">
                  <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 px-1 font-mono text-[11px]">
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
                  {crumbs.length === 1
                    ? FOLDERS.map((folder) => (
                        <button
                          key={folder.name}
                          type="button"
                          onClick={() => setCrumbs((path) => [...path, folder.name])}
                          className="group flex w-full items-center gap-3 rounded-lg border border-[var(--d-edge)] bg-black/25 px-3 py-2.5 text-left outline-none transition-colors hover:border-[var(--d-edge-hi)] hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--d-edge)] bg-white/[0.03] text-zinc-500 transition-colors group-hover:border-[var(--d-edge-hi)] group-hover:text-zinc-300 [&_svg]:size-4">
                            <Folder />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-zinc-100">{folder.name}</span>
                            <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-500">{folder.subtitle}</span>
                          </span>
                          <ChevronRight aria-hidden className="size-4 shrink-0 text-zinc-600 transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-300 motion-reduce:transition-none" />
                        </button>
                      ))
                    : null}
                  {files.length === 0
                    ? emptyState("No sounds match", "Try clearing filters or searching for something else.", (
                        <GButton tone="ghost" size="sm" className="mt-3" onClick={() => { setSearch(""); setOrigin("all"); }}>
                          Clear search
                        </GButton>
                      ))
                    : files.map(fileRow)}
                </div>
              ) : railView === "favorites" ? (
                <div className="grid gap-2">
                  {files.length === 0
                    ? emptyState("No favorites yet", "Star sounds to keep them here.", (
                        <GButton tone="secondary" size="sm" className="mt-3" onClick={() => setRailView("library")}>
                          Browse library
                        </GButton>
                      ))
                    : files.map(fileRow)}
                </div>
              ) : railView === "shelf" ? (
                <div className="grid gap-3">
                  {shelfFiles.length === 0 ? (
                    emptyState("Shelf is empty", "Shortlist sounds here while browsing, or drop files below.", (
                      <span className="group relative mt-3 inline-flex">
                        <GButton tone="secondary" size="sm" onClick={() => setRailView("library")}>
                          Browse library
                        </GButton>
                        <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
                          <DTooltipBubble>Your shortlist lives here</DTooltipBubble>
                        </span>
                      </span>
                    ))
                  ) : (
                    <div className="grid gap-2">{shelfFiles.map(fileRow)}</div>
                  )}
                  <div className="rounded-lg border border-[var(--d-edge)] bg-black/25 p-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Pack shelf</p>
                    <div className="mt-2 grid gap-1.5" role="radiogroup" aria-label="Pack source">
                      {[
                        ["shelf", "Shelf", `${shelfFiles.length} shortlisted sounds`],
                        ["selection", "Current selection", `${selectedIds.length} selected sounds`],
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
                          <GRadio name="j-pack-source" label={label} checked={packSource === value} onChange={() => setPackSource(value)} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-zinc-100">{label}</span>
                            <span className="block truncate text-xs text-zinc-500">{desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Pack format">
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
                    <div className="mt-2 flex gap-2">
                      <GButton tone="primary" size="sm" onClick={() => pushToast({ id: `pack-${Date.now()}`, tone: "success", title: "Pack started", message: `Packing ${packSource} as ${packFormat}.` })}>
                        <Download />
                        Make pack
                      </GButton>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-pressed={dropActive}
                    onClick={() => setDropActive((value) => !value)}
                    className={cn(
                      "flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-5 outline-none transition-[border-color,background-color,box-shadow] duration-150",
                      "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]",
                      dropActive
                        ? "border-[color-mix(in_oklab,var(--accent-fill)_65%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] shadow-[0_0_28px_color-mix(in_oklab,var(--accent-fill)_14%,transparent)]"
                        : "border-[var(--d-edge-hi)] bg-white/[0.015] hover:border-[color-mix(in_oklab,var(--accent-fill)_40%,transparent)]",
                    )}
                  >
                    <span aria-hidden className="grid size-9 place-items-center rounded-full border border-[var(--d-edge)] bg-white/[0.03] text-zinc-400 [&_svg]:size-4">
                      <FileUp />
                    </span>
                    <span className="text-[13px] font-medium text-zinc-100">
                      {dropActive ? "Release to add 4 files" : "Drop audio files here"}
                    </span>
                  </button>
                </div>
              ) : railView === "extensions" ? (
                <div className="grid gap-2">
                  {[
                    { mono: "FJ", name: "Folder Janitor", version: "0.2.0", desc: "Find stale and empty folders.", on: extJanitor, set: setExtJanitor },
                    { mono: "MP", name: "Make Pack", version: "1.0.0", desc: "Turn selected sounds into a clean folder or ZIP pack.", on: extPack, set: setExtPack },
                  ].map((tool) => (
                    <div key={tool.name}>
                      <div className="flex items-center gap-3 rounded-lg border border-[var(--d-edge)] bg-black/25 px-3 py-2.5 transition-colors hover:border-[var(--d-edge-hi)]">
                        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] text-[15px] font-bold text-accent-text">
                          {tool.mono}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-zinc-100">{tool.name}</span>
                            <span className="shrink-0 rounded border border-[var(--d-edge)] px-1 font-mono text-[10px] text-zinc-500">v{tool.version}</span>
                            {tool.mono === "MP" ? (
                              <GButton tone="ghost" size="sm" className="h-6 shrink-0 px-2 text-[11px]" aria-label={`About ${tool.name}`} aria-expanded={toolInfoOpen} onClick={() => setToolInfoOpen((value) => !value)}>
                                <Info />
                                Info
                              </GButton>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-zinc-500">{tool.desc}</span>
                        </span>
                        <GSwitch label={`Toggle ${tool.name}`} checked={tool.on} onCheckedChange={tool.set} />
                      </div>
                      {tool.mono === "MP" && toolInfoOpen ? (
                        <div className="mt-1.5 rounded-lg border border-[var(--d-edge)] bg-black/25 p-3">
                          <div className="flex flex-wrap gap-1.5">
                            {["library:read", "files:write"].map((perm) => (
                              <span key={perm} className={cn(
                                "rounded border px-1.5 py-0.5 font-mono text-[10.5px]",
                                permsApproved
                                  ? "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-200"
                                  : "border-[var(--d-edge)] bg-white/[0.03] text-zinc-400",
                              )}>
                                {perm}
                              </span>
                            ))}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <p className="font-mono text-[10.5px] text-zinc-600">
                              {permsApproved ? "Approved for this device" : "Needs approval"}
                            </p>
                            {permsApproved ? null : (
                              <GButton tone="secondary" size="sm" onClick={() => setPermsApproved(true)}>
                                Approve
                              </GButton>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <HAccordion
                    items={[
                      { title: "Stale folders", meta: "4 found", body: "Indexed folders that no longer exist on disk. Cleaning removes the entries only." },
                      { title: "Empty folders", meta: "11 found", body: "Folders under your scan roots with no sounds left in them." },
                    ]}
                  />
                </div>
              ) : railView === "organize" ? (
                <div className="grid gap-3">
                  <HTabs
                    label="Organize sections"
                    value={orgTab}
                    onChange={setOrgTab}
                    tabs={[
                      { value: "tags", label: "Tags" },
                      { value: "collections", label: "Collections" },
                    ]}
                  />
                  {orgTab === "tags" ? (
                    <HTabPanel tabKey="tags">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Tags</p>
                        <span className="font-mono text-[10px] text-zinc-600">{orgTags.length} total</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {orgTags.map((tag) => {
                          if (editingId === tag.id) {
                            const armed = delArmedId === tag.id;
                            return (
                              <span key={tag.id} className="w-full max-w-md rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_7%,transparent)] p-2">
                                <span className="flex items-center gap-2">
                                  <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: tagColorDraft }} />
                                  <input
                                    autoFocus
                                    value={tagDraft}
                                    onChange={(event) => setTagDraft(event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") setEditingId(null);
                                      if (event.key === "Escape") { setEditingId(null); setDelArmedId(null); }
                                    }}
                                    aria-label="Rename tag"
                                    className="min-w-0 flex-1 rounded-md border border-[var(--d-edge)] bg-[rgba(0,0,0,0.38)] px-2 py-1 text-xs font-semibold text-zinc-100 outline-none focus:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)]"
                                  />
                                  {armed ? (
                                    <GButton tone="danger" size="sm" className="h-6 px-2 text-[11px]" onClick={() => { setOrgTags((items) => items.filter((item) => item.id !== tag.id)); setEditingId(null); setDelArmedId(null); }}>
                                      Sure?
                                    </GButton>
                                  ) : (
                                    <GButton tone="ghost" size="icon" className="size-6 [&_svg]:size-3" aria-label={`Delete tag ${tag.name}`} onClick={() => setDelArmedId(tag.id)}>
                                      <Trash2 />
                                    </GButton>
                                  )}
                                </span>
                                <span className="mt-1.5 flex items-center gap-1.5 px-1 pb-0.5">
                                  {ITEM_COLOR_PRESETS.map((color) => (
                                    <button key={color} type="button" onClick={() => setTagColorDraft(color)} aria-label={`Pick ${color}`} aria-pressed={tagColorDraft === color} style={{ backgroundColor: color }}
                                      className={cn("size-5 rounded-full outline-none transition-[transform,opacity] duration-150 motion-safe:hover:scale-110 motion-safe:active:scale-95", "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black", tagColorDraft === color ? "ring-2 ring-white ring-offset-2 ring-offset-black" : "opacity-70 hover:opacity-100")} />
                                  ))}
                                </span>
                              </span>
                            );
                          }
                          const chipActive = selTagId === tag.id;
                          return (
                            <button key={tag.id} type="button" onClick={() => setSelTagId(chipActive ? null : tag.id)}
                              onDoubleClick={() => { setEditingId(tag.id); setTagDraft(tag.name); setTagColorDraft(tag.color); setDelArmedId(null); }}
                              title="Click to filter · double-click to edit" aria-pressed={chipActive}
                              style={chipActive ? { borderColor: `${tag.color}80`, backgroundColor: `${tag.color}14` } : undefined}
                              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold outline-none transition-[background-color,border-color,transform] duration-150 motion-safe:active:scale-95", "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]", chipActive ? "text-zinc-100" : "border-[var(--d-edge)] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.06]")}>
                              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input value={compName} onChange={(event) => setCompName(event.target.value)}
                          onKeyDown={(event) => { if (event.key === "Enter" && compName.trim()) { setOrgTags((items) => [...items, { id: `g-${Date.now()}`, name: compName.trim(), color: compColor }]); setCompName(""); } }}
                          placeholder="New tag…" aria-label="New tag name"
                          className="h-8 min-w-0 flex-1 rounded-md border border-[var(--d-edge)] bg-[rgba(0,0,0,0.38)] px-2.5 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)]" />
                        <span className="flex shrink-0 items-center gap-1">
                          {ITEM_COLOR_PRESETS.slice(0, 5).map((color) => (
                            <button key={color} type="button" onClick={() => setCompColor(color)} aria-label={`Pick ${color}`} aria-pressed={compColor === color} style={{ backgroundColor: color }}
                              className={cn("size-5 rounded-full outline-none transition-[transform,opacity] duration-150 motion-safe:hover:scale-110", "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black", compColor === color ? "ring-2 ring-white ring-offset-2 ring-offset-black" : "opacity-70 hover:opacity-100")} />
                          ))}
                        </span>
                        <button type="button" disabled={!compName.trim()}
                          onClick={() => { setOrgTags((items) => [...items, { id: `g-${Date.now()}`, name: compName.trim(), color: compColor }]); setCompName(""); }}
                          style={{ backgroundColor: compColor, color: onColorText(compColor) }}
                          className="h-8 shrink-0 rounded-md px-3 text-xs font-semibold outline-none transition-[transform,opacity,filter] duration-150 hover:brightness-110 motion-safe:active:scale-95 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none">
                          Add
                        </button>
                      </div>
                    </HTabPanel>
                  ) : (
                    <HTabPanel tabKey="collections">
                      <div className="grid gap-1.5">
                        {collections.map((collection) => (
                          <div key={collection.id} className="flex items-center justify-between rounded-md border border-[var(--d-edge)] bg-black/25 px-2.5 py-2">
                            <span className="text-[13px] text-zinc-200">{collection.name}</span>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-zinc-500">{collection.count}</span>
                              <GButton tone="ghost" size="icon" className="size-6 [&_svg]:size-3" aria-label={`Delete ${collection.name}`} onClick={() => setCollections((items) => items.filter((item) => item.id !== collection.id))}>
                                <Trash2 />
                              </GButton>
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input value={collName} onChange={(event) => setCollName(event.target.value)}
                          onKeyDown={(event) => { if (event.key === "Enter" && collName.trim()) { setCollections((items) => [...items, { id: `c-${Date.now()}`, name: collName.trim(), count: "0 sounds" }]); setCollName(""); } }}
                          placeholder="New collection…" aria-label="New collection name"
                          className="h-8 min-w-0 flex-1 rounded-md border border-[var(--d-edge)] bg-[rgba(0,0,0,0.38)] px-2.5 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)]" />
                        <GButton tone="secondary" size="sm" disabled={!collName.trim()} onClick={() => { setCollections((items) => [...items, { id: `c-${Date.now()}`, name: collName.trim(), count: "0 sounds" }]); setCollName(""); }}>
                          <Plus />
                          Add
                        </GButton>
                      </div>
                    </HTabPanel>
                  )}
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <GButton tone="primary" size="sm" loading={scanning && false} onClick={() => {}}>
                      <AudioLines />
                      Analyze with CLAP
                    </GButton>
                    <GButton tone="secondary" size="sm" onClick={() => {}}>
                      <Workflow />
                      Filename rules
                    </GButton>
                    <span className="flex-1" />
                    <GButton tone={scanning ? "secondary" : "primary"} size="sm" loading={scanning} onClick={() => {
                      if (scanning) { setScanning(false); return; }
                      setScanning(true);
                      pushToast({ id: `scan-${Date.now()}`, tone: "info", title: "Scan started", message: "Watching 3 roots for new sounds." });
                    }}>
                      {scanning ? "Scanning…" : "Start Full Scan"}
                    </GButton>
                  </div>
                  <div className="rounded-lg border border-[var(--d-edge)] bg-black/25 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <RefreshCw aria-hidden className={cn("size-4 text-accent-text", scanning && "animate-spin motion-reduce:[animation:none]")} />
                        <DotmSquare3 size={20} dotSize={3} speed={1.2} animated={scanning} pattern="full" className={scanning ? "text-accent-text" : "text-zinc-500"} />
                        <span className="text-sm font-medium text-zinc-200">Library sync</span>
                        {scanning ? <DStatusBadge status="Indexing" tone="processing" /> : <DStatusBadge status="Idle" tone="unavailable" />}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                        {indexed.toLocaleString()} / {discovered.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-3">
                      <GProgress percent={Math.min(99, Math.round((indexed / 2000) * 100))} top="Indexing" bottom={`${indexed.toLocaleString()}/${discovered.toLocaleString()} discovered`} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <ScanStat label="Discovered" value={discovered.toLocaleString()} />
                      <ScanStat label="Indexed" value={indexed.toLocaleString()} />
                      <ScanStat label="Added" value="+12" tone="success" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <DAlert tone="warning" monoTitle title="Queue collapsed to one summary" body="Top 3 shown below with a Show all expander." />
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-[13px] font-semibold text-zinc-100">Candidate queue</h3>
                      <p className="font-mono text-[11px] text-zinc-500">{queueWords.length} words need review</p>
                    </div>
                    {queueWords.length === 0 ? (
                      <p className="py-3 text-[13px] text-zinc-500">Queue empty. Every word is covered.</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-white/[0.06] border-y border-[var(--d-edge)]">
                        {visibleQueue.map((item) => (
                          <li key={item.word} className="group flex items-center gap-2 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">
                              {item.word}
                              <span className="ml-2 font-mono text-[11px] text-zinc-600">{item.files} files</span>
                            </span>
                            <GButton tone="ghost" size="icon" className="size-7 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100" aria-label={`Promote ${item.word} to a tag`} onClick={() => { setQueueWords((items) => items.filter((entry) => entry.word !== item.word)); setQueuePage(0); pushToast({ id: `promote-${item.word}`, tone: "success", title: `Promoted “${item.word}”`, message: "It is now a tag." }); }}>
                              <Check />
                            </GButton>
                            <GButton tone="ghost" size="icon" className="size-7 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100" aria-label={`Dismiss ${item.word}`} onClick={() => { setQueueWords((items) => items.filter((entry) => entry.word !== item.word)); setQueuePage(0); }}>
                              <X />
                            </GButton>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <p className="font-mono text-[11px] text-zinc-600">
                        Showing {queueWords.length === 0 ? 0 : queuePage * 5 + 1}–{Math.min(queueWords.length, queuePage * 5 + 5)} of {queueWords.length}
                      </p>
                      <div className="flex gap-1">
                        <GButton tone="ghost" size="icon" className="size-7" aria-label="Previous queue page" disabled={queuePage === 0} onClick={() => setQueuePage((p) => Math.max(0, p - 1))}>
                          <ChevronLeft />
                        </GButton>
                        <GButton tone="ghost" size="icon" className="size-7" aria-label="Next queue page" disabled={(queuePage + 1) * 5 >= queueWords.length} onClick={() => setQueuePage((p) => Math.min(maxQueuePage, p + 1))}>
                          <ChevronRight />
                        </GButton>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      {[1, 2].map((n) => (
                        <DPageButton key={n} label={String(n)} active={page === n} onClick={() => setPage(n)} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">Coverage</p>
                    <ul className="mt-1.5 overflow-hidden rounded-lg border border-[var(--d-edge)]">
                      {[
                        { tag: "thunder", delta: 3, count: 47 },
                        { tag: "rain", delta: 0, count: 50 },
                        { tag: "drone", delta: 1, count: 12 },
                      ].map((row) => {
                        const pct = Math.min(1, row.count / 50);
                        const done = row.count >= 50;
                        const rowActive = coverageSel === row.tag;
                        return (
                          <li key={row.tag}>
                            <button
                              type="button"
                              onClick={() => setCoverageSel(row.tag)}
                              aria-pressed={rowActive}
                              className={cn(
                                "relative flex w-full flex-col gap-1.5 border-b border-[var(--d-edge)] px-3 py-2.5 text-left outline-none transition-colors last:border-b-0 hover:bg-white/[0.03]",
                                "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]",
                                rowActive && "bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
                              )}
                            >
                              {rowActive ? (
                                <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent-fill shadow-[0_0_12px_color-mix(in_oklab,var(--accent-fill)_40%,transparent)]" />
                              ) : null}
                              <span className="flex items-baseline gap-2">
                                <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold text-zinc-100">#{row.tag}</span>
                                {row.delta > 0 ? <span className="shrink-0 font-mono text-[10px] tabular-nums text-emerald-300">+{row.delta}</span> : null}
                                <span className={cn("shrink-0 font-mono text-xs tabular-nums", done ? "text-emerald-300" : "text-zinc-100")}>
                                  {row.count}<span className="text-zinc-600">/50</span>
                                </span>
                              </span>
                              <span className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                                <span className={cn("block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", done ? "bg-emerald-400" : "bg-accent-fill")} style={{ width: `${pct * 100}%` }} />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--d-edge)] px-4 py-3">
              {dismissed ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[11px] text-zinc-600">Transport dismissed</p>
                  <GButton tone="ghost" size="sm" onClick={() => setDismissed(false)}>
                    Reopen player
                  </GButton>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2.5">
                    <GButton tone="ghost" size="icon" className="size-8 rounded-full" aria-label="Previous in queue" onClick={() => stepTrack(-1)}>
                      <SkipBack fill="currentColor" className="size-4" />
                    </GButton>
                    <button
                      type="button"
                      onClick={() => setPlaying((value) => !value)}
                      aria-label={playing && track ? `Pause ${track.filename}` : `Play ${track?.filename ?? "preview"}`}
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(180deg,var(--accent-fill-hover),var(--accent-fill))] text-white outline-none transition-[box-shadow,transform,filter] duration-150 hover:brightness-110 motion-safe:hover:-translate-y-px motion-safe:active:scale-95 focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] motion-reduce:transition-none [&_svg]:size-4"
                      style={{
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 0 22px color-mix(in oklab, var(--accent-fill) 40%, transparent)",
                      }}
                    >
                      {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" className="ml-0.5" />}
                    </button>
                    <GButton tone="ghost" size="icon" className="size-8 rounded-full" aria-label="Next in queue" onClick={() => stepTrack(1)}>
                      <SkipForward fill="currentColor" className="size-4" />
                    </GButton>
                    <GIconButton
                      label={track && favs[track.filename] ? `Remove ${track.filename} from favorites` : `Add ${track?.filename ?? "preview"} to favorites`}
                      tone={track && favs[track.filename] ? "danger" : "secondary"}
                      aria-pressed={!!(track && favs[track.filename])}
                      onClick={() => track && setFavs((prev) => ({ ...prev, [track.filename]: !prev[track.filename] }))}
                      className="size-8 rounded-full"
                    >
                      <Heart fill={track && favs[track.filename] ? "currentColor" : "none"} className={track && favs[track.filename] ? "text-accent-text" : undefined} />
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
                        else { measureCollMenu(); setCollOpen(true); }
                      }}
                      className="grid size-8 shrink-0 place-items-center rounded-full border border-transparent text-zinc-400 outline-none transition-[background-color,border-color,box-shadow,color,transform] duration-150 hover:border-[var(--d-edge)] hover:bg-white/[0.06] hover:text-zinc-100 motion-safe:hover:-translate-y-px motion-safe:active:scale-95 focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] motion-reduce:transition-none [&_svg]:size-4"
                    >
                      <FolderPlus />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-zinc-100">
                          {track?.filename ?? "Nothing queued"}
                          {nextTrack ? <span className="ml-2 font-mono text-[10.5px] font-normal text-zinc-500">next: {nextTrack.filename}</span> : null}
                        </p>
                        <p className="shrink-0 font-mono text-[10.5px] tabular-nums text-zinc-500">
                          {fmtTime(elapsed)} / {fmtTime(duration)}
                        </p>
                      </div>
                      <HScrubber
                        peaks={peaks}
                        progress={elapsed / duration}
                        duration={duration}
                        onSeek={setElapsed}
                        label={`Seek through ${track?.filename ?? "preview"}`}
                      />
                    </div>
                    <div className="hidden w-24 shrink-0 items-center gap-1 min-[560px]:flex">
                      <GButton
                        tone="ghost"
                        size="icon"
                        className="size-7"
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
                      className="size-7"
                      aria-label={autoplay ? "Turn autoplay off" : "Turn autoplay on"}
                      aria-pressed={autoplay}
                      onClick={() => setAutoplay((value) => !value)}
                    >
                      <Repeat className={autoplay ? "text-accent-text" : undefined} />
                    </GButton>
                  </div>
                  <div className="mt-2 flex items-center gap-2 border-t border-white/[0.05] pt-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">Settings</span>
                    <GSwitch label="Auto-tag new files" checked={settings.autoTag} onCheckedChange={() => onToggleSetting("autoTag")} />
                    <span className="text-[11px] text-zinc-500">Auto-tag</span>
                    <GSwitch label="Sound Shelf" checked={settings.shelf} onCheckedChange={() => onToggleSetting("shelf")} />
                    <span className="text-[11px] text-zinc-500">Shelf</span>
                    <span className="flex-1" />
                    <GButton tone="ghost" size="sm" onClick={() => setDialogOpen(true)}>
                      All settings…
                    </GButton>
                    <p className="font-mono text-[10px] text-zinc-600">
                      {selectedIds.length} selected · {favCount} starred
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="font-mono text-[10.5px] leading-relaxed text-zinc-600">
          Variant J — the workspace rebuilt from the specimen kits. Every view above is live:
          switch the rail, filter, sort, select, scan, pack, organize, and play.
        </p>
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

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setDialogOpen(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="variant-j-dialog-title"
            aria-describedby="variant-j-dialog-desc"
            className="w-full max-w-4xl overflow-hidden rounded-xl border border-[var(--d-edge-hi)] bg-[#101014]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_rgba(0,0,0,0.65),0_0_40px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex min-h-[420px]">
              <div className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-[var(--d-edge)] p-2">
                <p className="px-2.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Settings</p>
                {[
                  ["library", "Library"],
                  ["display", "Display"],
                  ["shortcuts", "Shortcuts"],
                  ["about", "About"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSettingsTab(value)}
                    aria-pressed={settingsTab === value}
                    className={cn(
                      "rounded-md px-2.5 py-2 text-left text-[13px] outline-none transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]",
                      settingsTab === value
                        ? "border border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_10%,transparent)] font-medium text-zinc-50"
                        : "border border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
                    )}
                  >
                    {label}
                  </button>
                ))}
                <span className="flex-1" />
                <GButton tone="ghost" size="sm" onClick={() => setDialogOpen(false)}>
                  Close
                </GButton>
              </div>
              <div className="min-w-0 flex-1 overflow-y-auto p-5">
                {settingsTab === "library" ? (
                  <div className="grid gap-4">
                    <div>
                      <h3 className="text-[15px] font-semibold text-zinc-50">Scan roots</h3>
                      <div className="mt-2 grid gap-1.5">
                        {roots.map((root) => (
                          <div key={root} className="flex items-center gap-2 rounded-md border border-[var(--d-edge)] bg-black/25 px-2.5 py-2">
                            <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-200">{root}</span>
                            <GButton tone="ghost" size="icon" className="size-6 [&_svg]:size-3" aria-label={`Remove ${root}`} onClick={() => { setDialogRoot(root); }}>
                              <Trash2 />
                            </GButton>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <DField value={newRoot} onChange={(event) => setNewRoot(event.target.value)}
                          onKeyDown={(event) => { if (event.key === "Enter" && newRoot.trim()) { setRoots((r) => [...r, newRoot.trim()]); setNewRoot(""); setRootMsg({ valid: newRoot.includes("/") || newRoot.includes("\\") }); } }}
                          placeholder="C:/Sound Library/More…" aria-label="New scan root" className="h-8" />
                        <GButton tone="secondary" size="sm" disabled={!newRoot.trim()} onClick={() => { setRoots((r) => [...r, newRoot.trim()]); setRootMsg({ valid: newRoot.includes("/") || newRoot.includes("\\") }); setNewRoot(""); }}>
                          Validate
                        </GButton>
                      </div>
                      {rootMsg ? (
                        <div className="mt-2">
                          {rootMsg.valid ? (
                            <div role="status" className="rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_7%,transparent)] px-3 py-2.5 text-[13px] text-zinc-200">
                              Path verified — found 214 supported audio files.
                            </div>
                          ) : (
                            <DAlert tone="error" title="Invalid folder" body="The path does not exist or is not readable." />
                          )}
                        </div>
                      ) : null}
                      {dialogRoot ? (
                        <div role="alertdialog" aria-label="Confirm remove" className="mt-2 rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] p-3">
                          <p className="text-[13px] text-zinc-200">Remove <span className="font-mono text-xs">{dialogRoot}</span>? Files stay on disk.</p>
                          <div className="mt-2 flex justify-end gap-2">
                            <GButton tone="ghost" size="sm" onClick={() => setDialogRoot("")}>Cancel</GButton>
                            <GButton tone="danger" size="sm" onClick={() => { setRoots((r) => r.filter((x) => x !== dialogRoot)); setDialogRoot(""); }}>Remove</GButton>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-zinc-50">Defaults</h3>
                      <div className="mt-2 grid gap-2">
                        <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--d-edge)] px-2.5 py-2">
                          <span className="text-[13px] text-zinc-200">Pack name</span>
                          <span className="w-44">
                            <DField aria-label="Pack name" value={packName} aria-invalid={packNameError !== null}
                              onChange={(event) => { setPackName(event.target.value); if (packNameError) setPackNameError(null); }}
                              onBlur={() => { if (!packName.trim()) setPackNameError("Name is required."); }} className="h-7 text-xs" />
                          </span>
                        </div>
                        {packNameError ? <p role="alert" className="text-xs text-accent-text">{packNameError}</p> : null}
                        <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--d-edge)] px-2.5 py-2">
                          <span className="text-[13px] text-zinc-200">Notify when done</span>
                          <GSwitch label="Notify when done" checked={notifyOn} onCheckedChange={setNotifyOn} />
                        </div>
                        <div className="rounded-md border border-[var(--d-edge)] px-2.5 py-2">
                          <p className="text-[13px] text-zinc-200">Remove default</p>
                          <div className="mt-1.5 flex gap-4">
                            <GRadio name="j-remove-default" label="Library" checked={removeDefault === "library"} onChange={() => setRemoveDefault("library")} />
                            <GRadio name="j-remove-default" label="Disk" checked={removeDefault === "disk"} onChange={() => setRemoveDefault("disk")} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : settingsTab === "display" ? (
                  <div className="grid gap-4">
                    <div>
                      <h3 className="text-[15px] font-semibold text-zinc-50">Appearance</h3>
                      <div className="mt-2 flex items-center gap-3 rounded-md border border-[var(--d-edge)] px-3 py-2.5">
                        <Monitor aria-hidden className="size-4 shrink-0 text-zinc-500" />
                        <div className="min-w-0 flex-1">
                          <HSlider label="Interface zoom" value={zoom} min={50} max={200} step={5} onChange={setZoom} formatValue={(next) => `${Math.round(next)}%`} />
                        </div>
                      </div>
                      <p className="mt-1.5 font-mono text-[10.5px] text-zinc-600">50 – 200% · applies instantly</p>
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-zinc-50">Playback</h3>
                      <div className="mt-2 grid gap-2">
                        <span className="flex items-center justify-between gap-3 rounded-md border border-[var(--d-edge)] px-2.5 py-2">
                          <span className="text-[13px] text-zinc-200">Auto-tag new files</span>
                          <GSwitch label="Auto-tag new files" checked={settings.autoTag} onCheckedChange={() => onToggleSetting("autoTag")} />
                        </span>
                        <span className="flex items-center justify-between gap-3 rounded-md border border-[var(--d-edge)] px-2.5 py-2">
                          <span className="text-[13px] text-zinc-200">Semantic tagging</span>
                          <GSwitch label="Semantic tagging" checked={semantic} onCheckedChange={setSemantic} />
                        </span>
                      </div>
                    </div>
                  </div>
                ) : settingsTab === "shortcuts" ? (
                  <div>
                    <h3 className="text-[15px] font-semibold text-zinc-50">Keyboard shortcuts</h3>
                    <p className="mt-1 text-xs text-zinc-500">Select Change, then press a key. Escape cancels.</p>
                    <div className="mt-2 divide-y divide-white/[0.06]">
                      {Object.keys(SHORTCUT_LABELS).map((action) => (
                        <div key={action} className="flex items-center gap-3 py-2">
                          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-100">
                            {SHORTCUT_LABELS[action] ?? action}
                          </p>
                          <DKbd>
                            <span className={cn("px-1", rebinding === action && "animate-pulse text-accent-text")}>
                              {rebinding === action ? "Press a key…" : (bindings[action] ?? "?") === "Space" ? "Space" : (bindings[action] ?? "?").toUpperCase()}
                            </span>
                          </DKbd>
                          <GButton tone="ghost" size="sm" onClick={() => (rebinding === action ? setRebinding(null) : setRebinding(action))}>
                            {rebinding === action ? "Cancel" : "Change"}
                          </GButton>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-600">
                      <Keyboard aria-hidden className="size-3.5" />
                      Bindings apply immediately on this device.
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-[15px] font-semibold text-zinc-50">About</h3>
                    <div className="mt-2 flex items-center gap-3 rounded-md border border-[var(--d-edge)] bg-black/25 p-3">
                      <DotmSquare3 size={20} dotSize={3} speed={1.2} animated={scanning} pattern="full" className={scanning ? "text-accent-text" : "text-zinc-500"} />
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">Foleyard Core · v0.1.8</p>
                        <p className="truncate text-xs font-medium text-zinc-200">{scanning ? "Indexing…" : "Service Online"}</p>
                      </div>
                    </div>
                    <ol className="mt-3 flex items-center">
                      {["Welcome", "Folder", "Scan"].map((step, index) => (
                        <li key={step} className="flex items-center last:flex-none">
                          <button type="button" onClick={() => setStepIdx(index)} aria-label={`Go to step ${step}`} aria-current={stepIdx === index ? "step" : undefined} className="group flex flex-col items-center gap-1.5 outline-none">
                            <span aria-hidden className={cn("block size-2.5 rounded-full border border-white/15 bg-white/10 transition-colors", stepIdx === index && "border-accent-fill bg-accent-fill shadow-[0_0_10px_color-mix(in_oklab,var(--accent-fill)_50%,transparent)]", stepIdx > index && "border-accent-fill/70 bg-accent-fill/70")} />
                            <span className={cn("font-mono text-[10px]", stepIdx === index ? "text-zinc-100" : "text-zinc-600 group-hover:text-zinc-400")}>{step}</span>
                          </button>
                          {index < 2 ? <span aria-hidden className={cn("mx-1 h-px w-6 bg-white/10", stepIdx > index && "bg-accent-fill/70")} /> : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          </div>
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
                <Search aria-hidden className="size-4 shrink-0 text-zinc-500" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  placeholder="Type a command or sound…"
                  aria-label="Type a command or sound"
                  aria-controls="command-palette-results-j"
                  aria-activedescendant={
                    paletteIndex >= 0 ? `command-palette-entry-j-${paletteIndex}` : undefined
                  }
                  className="h-12 w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <DKbd>esc</DKbd>
              </div>
              <div
                id="command-palette-results-j"
                role="listbox"
                aria-label="Command results"
                className="grid max-h-80 gap-0.5 overflow-y-auto p-1.5"
              >
                {filteredPalette.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-zinc-500">No matches.</p>
                ) : (
                  filteredPalette.map((entry, index) => {
                    const newSection =
                      index === 0 || filteredPalette[index - 1].section !== entry.section;
                    return (
                      <div key={entry.id}>
                        {newSection ? <DCommandSection>{entry.section}</DCommandSection> : null}
                        <DCommandRow
                          id={`command-palette-entry-j-${index}`}
                          role="option"
                          aria-selected={index === paletteIndex}
                          active={index === paletteIndex}
                          icon={SECTION_ICONS[entry.section]}
                          onClick={() => setPaletteOpen(false)}
                          onMouseEnter={() => setActive(index)}
                        >
                          {entry.label}
                        </DCommandRow>
                      </div>
                    );
                  })
                )}
              </div>
              <DCommandFooter count={filteredPalette.length} />
            </DCommandPanel>
          </div>
        </div>
      ) : null}

      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] grid w-72 gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <HToast
              tone={toast.tone}
              title={toast.title}
              message={toast.message}
              onDismiss={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}
            />
          </div>
        ))}
      </div>
    </DSurface>
  );
}
