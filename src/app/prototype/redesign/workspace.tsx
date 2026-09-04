"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  CornerDownLeft,
  ExternalLink,
  Filter,
  FolderOpen,
  Globe,
  Heart,
  Info,
  Layers,
  Library,
  ListMusic,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Star,
  Tags,
  Trash2,
  X,
} from "lucide-react";

type Sound = {
  id: string;
  filename: string;
  format: string;
  duration: number;
  sampleRate: number;
  channels: number;
  tags: string[];
};

function peaksFor(seed: number, count = 64): number[] {
  return Array.from({ length: count }, (_, i) => {
    const v = Math.abs(Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1;
    return 0.08 + v * 0.92;
  });
}

const SOUNDS: Sound[] = [
  {
    id: "s1",
    filename: "Metal Door Slam",
    format: "wav",
    duration: 2.4,
    sampleRate: 96000,
    channels: 2,
    tags: ["impact", "metal"],
  },
  {
    id: "s2",
    filename: "Gravel Footsteps",
    format: "mp3",
    duration: 6.1,
    sampleRate: 48000,
    channels: 2,
    tags: ["foley", "steps"],
  },
  {
    id: "s3",
    filename: "Rain on Tent",
    format: "flac",
    duration: 12.0,
    sampleRate: 48000,
    channels: 2,
    tags: ["ambience", "rain"],
  },
  {
    id: "s4",
    filename: "Sword Unsheath",
    format: "wav",
    duration: 1.2,
    sampleRate: 96000,
    channels: 1,
    tags: ["weapon", "metal"],
  },
  {
    id: "s5",
    filename: "Neon Hum Loop",
    format: "wav",
    duration: 8.0,
    sampleRate: 48000,
    channels: 2,
    tags: ["ambience", "loop"],
  },
  {
    id: "s6",
    filename: "Glass Break Small",
    format: "mp3",
    duration: 1.8,
    sampleRate: 44100,
    channels: 2,
    tags: ["impact", "glass"],
  },
  {
    id: "s7",
    filename: "Forest Night Bed",
    format: "flac",
    duration: 15.3,
    sampleRate: 48000,
    channels: 2,
    tags: ["ambience", "night"],
  },
  {
    id: "s8",
    filename: "Punch Whoosh",
    format: "wav",
    duration: 0.9,
    sampleRate: 96000,
    channels: 1,
    tags: ["whoosh", "impact"],
  },
  {
    id: "s9",
    filename: "Old Radio Static",
    format: "mp3",
    duration: 4.4,
    sampleRate: 44100,
    channels: 1,
    tags: ["texture", "lofi"],
  },
  {
    id: "s10",
    filename: "Thunder Crack Far",
    format: "wav",
    duration: 5.7,
    sampleRate: 96000,
    channels: 2,
    tags: ["nature", "impact"],
  },
];

const PEAKS: Record<string, number[]> = Object.fromEntries(
  SOUNDS.map((s, i) => [s.id, peaksFor(i + 1)]),
);

const PEAKS_HD: Record<string, number[]> = Object.fromEntries(
  SOUNDS.map((s, i) => [s.id, peaksFor(i + 101, 160)]),
);

const EXTENSIONS = [
  {
    id: "folder-janitor",
    name: "Folder Janitor",
    blurb: "Duplicates, missing files, empty folders.",
  },
  {
    id: "library-gatherer",
    name: "Library Gatherer",
    blurb: "Pull scattered folders into one library.",
  },
  {
    id: "make-pack",
    name: "Make Pack",
    blurb: "Turn sounds into a folder or zip.",
  },
  {
    id: "sound-shelf",
    name: "Sound Shelf",
    blurb: "A holding strip for sounds under review.",
  },
  {
    id: "drop-rules",
    name: "Drop Rules",
    blurb: "Copy, rename, and log on drag out.",
  },
];

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function soundById(id: string): Sound {
  return SOUNDS.find((s) => s.id === id) ?? SOUNDS[0];
}

function WaveCanvas({
  peaks,
  progress,
  height = 36,
}: {
  peaks: number[];
  progress: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const n = peaks.length;
    const slot = w / n;
    const barW = Math.max(1.5, slot * 0.62);
    const mid = h / 2;
    for (let i = 0; i < n; i += 1) {
      const played = i / n <= progress;
      const bh = Math.max(2, peaks[i] * (h - 6));
      ctx.fillStyle = played ? "#f0503c" : "rgba(255,255,255,0.16)";
      if (played) {
        ctx.shadowColor = "rgba(240,80,60,0.55)";
        ctx.shadowBlur = 5;
      } else {
        ctx.shadowBlur = 0;
      }
      const x = i * slot + (slot - barW) / 2;
      ctx.beginPath();
      ctx.roundRect(x, mid - bh / 2, barW, bh, barW / 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(progress * w - 1, 3, 2, h - 6);
  }, [peaks, progress, height]);
  return <canvas ref={ref} style={{ height }} className="w-full" />;
}

type View = "library" | "favorites" | "cue" | "extensions";
type SettingsTab = "library" | "metadata" | "tools" | "appearance" | "about";

type ExtSettingDef = {
  id: string;
  label: string;
  desc?: string;
  type: "boolean" | "select" | "number" | "string";
  value: boolean | string | number;
  options?: { label: string; value: string }[];
};

const EXT_SETTINGS: Record<string, ExtSettingDef[]> = {
  "make-pack": [
    {
      id: "default-format",
      label: "Default format",
      type: "select",
      value: "folder",
      options: [
        { label: "Folder", value: "folder" },
        { label: "Zip", value: "zip" },
      ],
    },
    {
      id: "include-manifest",
      label: "Include manifest",
      desc: "Write a manifest file into every pack.",
      type: "boolean",
      value: true,
    },
  ],
  "library-gatherer": [
    {
      id: "preserve-folder-names",
      label: "Preserve folder names",
      type: "boolean",
      value: true,
    },
    {
      id: "skip-duplicates",
      label: "Skip duplicates",
      desc: "Leave files that already exist at the destination.",
      type: "boolean",
      value: true,
    },
  ],
  "folder-janitor": [
    {
      id: "allowed-formats",
      label: "Allowed formats",
      desc: "Comma separated list.",
      type: "string",
      value: "wav, mp3, flac",
    },
    {
      id: "tiny-file-threshold-bytes",
      label: "Tiny file threshold (bytes)",
      type: "number",
      value: 1024,
    },
  ],
};

function dropPreview(pattern: string): { output: string; valid: boolean } {
  const t = pattern.trim();
  if (!t) return { output: "Pattern is empty", valid: false };
  const out = t
    .split("{index}")
    .join("001")
    .split("{name}")
    .join("whoosh-rise")
    .split("{ext}")
    .join(".wav")
    .split("{format}")
    .join("wav")
    .split("{date}")
    .join("2026-05-07")
    .split("{time}")
    .join("14-30-00")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
  return {
    output: out.trim() ? out : "001-whoosh-rise.wav",
    valid: out.trim().length > 0,
  };
}

type SortKey = "filename" | "duration" | "format";
type PaletteItem = {
  kind: "cmd" | "sound";
  label: string;
  hint: string;
  run: () => void;
};

export function Workspace() {
  const [view, setView] = useState<View>("library");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(["s1"]);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0.3);
  const [autoplay, setAutoplay] = useState(true);
  const [queue] = useState<string[]>(["s1", "s4", "s8"]);
  const [favorites, setFavorites] = useState<string[]>(["s4"]);
  const [cue, setCue] = useState<string[]>(["s2", "s5"]);
  const [roots, setRoots] = useState<string[]>(["P:\\SoundLibrary"]);
  const [newRoot, setNewRoot] = useState("");
  const [collections, setCollections] = useState([
    { id: "c1", name: "Impacts", count: 4, smart: false },
    { id: "c2", name: "Rain beds", count: 3, smart: true },
  ]);
  const [tagList, setTagList] = useState([
    { name: "impact", count: 5, color: "#f0503c" },
    { name: "ambience", count: 3, color: "#7dd069" },
    { name: "metal", count: 2, color: "#6aa8ff" },
    { name: "foley", count: 1, color: "#c792ea" },
  ]);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("library");
  const [newCollection, setNewCollection] = useState("");
  const [newTag, setNewTag] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [expandedExt, setExpandedExt] = useState<string | null>(null);
  const [validateMsg, setValidateMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [scan, setScan] = useState<{
    running: boolean;
    stats: {
      discovered: number;
      indexed: number;
      metadata: number;
      added: number;
      removed: number;
    } | null;
  }>({ running: false, stats: null });
  const [dr, setDr] = useState({ copy: true, rename: true, mark: true });
  const [patternDraft, setPatternDraft] = useState("{index}-{name}{ext}");
  const [extSettings, setExtSettings] = useState<
    Record<string, Record<string, unknown>>
  >({
    "make-pack": { "default-format": "folder", "include-manifest": true },
    "library-gatherer": {
      "preserve-folder-names": true,
      "skip-duplicates": true,
    },
    "folder-janitor": {
      "allowed-formats": "wav, mp3, flac",
      "tiny-file-threshold-bytes": 1024,
    },
  });
  const [updateChecking, setUpdateChecking] = useState(false);
  const [extOn, setExtOn] = useState<Record<string, boolean>>({
    "folder-janitor": true,
    "library-gatherer": true,
    "make-pack": true,
    "sound-shelf": true,
    "drop-rules": false,
  });
  const [sortKey, setSortKey] = useState<SortKey>("filename");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLInputElement>(null);

  const selectedId = selectedIds[selectedIds.length - 1] ?? "s1";

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setProgress((p) => {
        if (p + 0.03 >= 1) {
          const i = queue.indexOf(selectedId);
          if (autoplay && queue.length > 1) {
            const next = queue[(i + 1) % queue.length];
            setSelectedIds([next]);
          }
          return 0;
        }
        return p + 0.03;
      });
    }, 180);
    return () => clearInterval(t);
  }, [playing, queue, selectedId, autoplay]);

  const base = useMemo(() => {
    let list = [...SOUNDS];
    if (view === "favorites")
      list = list.filter((s) => favorites.includes(s.id));
    if (view === "cue") list = cue.map(soundById);
    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter(
        (s) =>
          s.filename.toLowerCase().includes(q) ||
          s.tags.some((t) => t.includes(q)),
      );
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "string"
          ? av.localeCompare(bv as string)
          : (av as number) - (bv as number);
      return cmp * sortDir;
    });
    return list;
  }, [view, favorites, cue, query, sortKey, sortDir]);

  const selected = soundById(selectedId);
  const qi = queue.indexOf(selectedId);
  const nextUp =
    queue.length > 1 ? soundById(queue[(qi + 1) % queue.length]) : null;

  const playSingle = (id: string) => {
    setSelectedIds([id]);
    setProgress(0);
    setPlaying(true);
  };

  const moveSelection = (dir: 1 | -1) => {
    const i = base.findIndex((s) => s.id === selectedId);
    const next = base[(i + dir + base.length) % base.length];
    if (!next) return;
    playSingle(next.id);
    document
      .getElementById(`prow-${next.id}`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const toggleFav = (id: string) =>
    setFavorites((f) =>
      f.includes(id) ? f.filter((x) => x !== id) : [...f, id],
    );

  const rowClick = (id: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((sel) =>
        sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id],
      );
      return;
    }
    if (e.shiftKey) {
      const ids = base.map((s) => s.id);
      const a = ids.indexOf(selectedId);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
        setSelectedIds((sel) => Array.from(new Set([...sel, ...range])));
        return;
      }
    }
    playSingle(id);
  };

  const openPalette = () => {
    setPaletteQuery("");
    setPaletteIndex(0);
    setPaletteOpen(true);
  };

  const addRoot = () => {
    const p = newRoot.trim();
    if (!p) {
      setValidateMsg({ ok: false, text: "Enter a folder path first." });
      return;
    }
    if (roots.includes(p)) {
      setValidateMsg({ ok: false, text: "That folder is already listed." });
      return;
    }
    setRoots([...roots, p]);
    setNewRoot("");
    setValidateMsg({
      ok: true,
      text: `Path verified (${((p.length * 7) % 40) + 3} audio files).`,
    });
  };

  const runScan = () => {
    setScan({ running: true, stats: null });
    setTimeout(() => {
      setScan({
        running: false,
        stats: {
          discovered: 128,
          indexed: 120,
          metadata: 118,
          added: 4,
          removed: 0,
        },
      });
    }, 1500);
  };

  const paletteItems: PaletteItem[] = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    const cmds: PaletteItem[] = [
      {
        kind: "cmd",
        label: "Go to Library",
        hint: "view",
        run: () => setView("library"),
      },
      {
        kind: "cmd",
        label: "Go to Favorites",
        hint: "view",
        run: () => setView("favorites"),
      },
      {
        kind: "cmd",
        label: "Go to Shelf",
        hint: "view",
        run: () => setView("cue"),
      },
      {
        kind: "cmd",
        label: "Go to Extensions",
        hint: "view",
        run: () => setView("extensions"),
      },
      {
        kind: "cmd",
        label: "Open settings",
        hint: "view",
        run: () => setShowSettings(true),
      },
      {
        kind: "cmd",
        label: playing ? "Pause" : "Play",
        hint: "transport",
        run: () => setPlaying(!playing),
      },
      {
        kind: "cmd",
        label: "Next in queue",
        hint: "transport",
        run: () => {
          const i = queue.indexOf(selectedId);
          playSingle(queue[(i + 1) % queue.length] ?? queue[0]);
        },
      },
      {
        kind: "cmd",
        label: "Previous in queue",
        hint: "transport",
        run: () => {
          const i = queue.indexOf(selectedId);
          playSingle(queue[(i - 1 + queue.length) % queue.length] ?? queue[0]);
        },
      },
      {
        kind: "cmd",
        label: `Autoplay ${autoplay ? "off" : "on"}`,
        hint: "transport",
        run: () => setAutoplay(!autoplay),
      },
      {
        kind: "cmd",
        label: favorites.includes(selectedId)
          ? "Unsave current"
          : "Save current",
        hint: "file",
        run: () => toggleFav(selectedId),
      },
      {
        kind: "cmd",
        label: "Add current file to shelf",
        hint: "file",
        run: () =>
          setCue((c) => (c.includes(selectedId) ? c : [...c, selectedId])),
      },
      {
        kind: "cmd",
        label: "Scan for issues",
        hint: "tool",
        run: () => setLastCommand("scan started (stub)"),
      },
      {
        kind: "cmd",
        label: "Gather into library",
        hint: "tool",
        run: () => setLastCommand("gather started (stub)"),
      },
    ];
    const sounds: PaletteItem[] = SOUNDS.filter(
      (s) => match(s.filename) || s.tags.some((t) => match(t)),
    )
      .slice(0, 6)
      .map((s) => ({
        kind: "sound" as const,
        label: s.filename,
        hint: `${s.format} · ${fmt(s.duration)}`,
        run: () => playSingle(s.id),
      }));
    return [...cmds.filter((c) => match(c.label)), ...sounds];
  }, [paletteQuery, playing, autoplay, favorites, selectedId, queue]);

  useEffect(() => {
    if (paletteOpen) paletteRef.current?.focus();
  }, [paletteOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (paletteOpen) setPaletteOpen(false);
        else openPalette();
        return;
      }
      if (paletteOpen) {
        if (e.key === "Escape") setPaletteOpen(false);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setPaletteIndex((i) => (i + 1) % Math.max(1, paletteItems.length));
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setPaletteIndex(
            (i) =>
              (i - 1 + Math.max(1, paletteItems.length)) %
              Math.max(1, paletteItems.length),
          );
        }
        if (e.key === "Enter") {
          e.preventDefault();
          paletteItems[paletteIndex]?.run();
          setPaletteOpen(false);
        }
        return;
      }
      if (typing) return;
      if (
        e.code === "Space" &&
        (t === document.body || (t?.dataset?.row ?? false))
      ) {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "f") toggleFav(selectedId);
      else if (e.key === "j") moveSelection(1);
      else if (e.key === "k") moveSelection(-1);
      else if (e.key === ",") setShowSettings(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteOpen, paletteItems, paletteIndex, selectedId, base]);

  const flipSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === 1 ? -1 : 1);
    else {
      setSortKey(k);
      setSortDir(1);
    }
  };

  const bulk = selectedIds.length > 1;

  const rail: {
    id: View;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    { id: "library", label: "Library", icon: <Library className="size-5" /> },
    {
      id: "favorites",
      label: "Favorites",
      icon: <Star className="size-5" />,
      badge: favorites.length,
    },
    {
      id: "cue",
      label: "Shelf",
      icon: <ListMusic className="size-5" />,
      badge: cue.length,
    },
    { id: "extensions", label: "Extensions", icon: <Layers className="size-5" /> },
  ];
  return (
    <div className="flex h-full flex-col bg-[#0b0b10] font-sans text-zinc-100 antialiased">
      <p className="border-b border-white/10 bg-black/40 px-4 py-1.5 text-center font-mono text-[11px] text-[#f0503c]">
        PROTOTYPE - rich redesign, throwaway. Palette (Ctrl+K) · Space · J/K · /
        · F · , settings. Fake data. [rev 28]
      </p>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(240,80,60,0.13),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(240,80,60,0.06),transparent_40%)]" />
        {/* icon rail */}
        <nav
          className="relative flex w-20 shrink-0 flex-col items-center gap-1 border-r border-white/10 py-4"
          aria-label="Primary"
        >
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-[#f0503c] text-lg font-black text-white shadow-[0_0_24px_rgba(240,80,60,0.45)]">
            F
          </div>
          {rail.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setView(r.id)}
              className={`relative flex w-16 flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[10px] font-semibold uppercase tracking-widest transition-all ${
                view === r.id
                  ? "border-[#f0503c]/50 bg-[#f0503c]/15 text-[#ff7a66] shadow-[0_0_18px_rgba(240,80,60,0.25)]"
                  : "border-transparent text-zinc-500 hover:border-white/10 hover:bg-white/5 hover:text-zinc-200"
              }`}
            >
              {r.icon}
              {r.label}
              {r.badge ? (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-[#f0503c] px-1 font-mono text-[9px] font-bold text-white">
                  {r.badge}
                </span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            className={`mt-auto flex w-16 flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[10px] font-semibold uppercase tracking-widest transition-all ${
              showSettings
                ? "border-[#f0503c]/50 bg-[#f0503c]/15 text-[#ff7a66]"
                : "border-transparent text-zinc-500 hover:border-white/10 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            <Settings className="size-5" />
            Settings
          </button>
        </nav>

        {/* main column */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="px-5 pt-4">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 transition-all focus-within:border-[#f0503c]/60 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_28px_rgba(240,80,60,0.18)]">
              <Search className="size-4 shrink-0 text-zinc-500" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search 10 sounds by name, tag, or format..."
                className="w-full bg-transparent py-2.5 text-[15px] font-medium text-zinc-50 placeholder:font-normal placeholder:text-zinc-600 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded-md px-2 py-1 font-mono text-[11px] text-zinc-500 hover:text-zinc-100"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={openPalette}
                className="hidden shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 hover:border-[#f0503c]/50 hover:text-zinc-100 sm:flex"
              >
                {"\u2318"}K{" "}
                <span className="text-zinc-600">
                  {base.length}/{SOUNDS.length}
                </span>
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 lg:px-8">
            {view === "extensions" ? (
              <div>
                <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">
                  Tools
                </h1>
                <p className="mt-1.5 text-sm font-medium text-zinc-400">
                  Optional workflows. Flip one on and it joins the workspace.
                </p>
                <div className="mt-5 grid gap-3 xl:grid-cols-2">
                  {EXTENSIONS.map((e) => (
                    <div
                      key={e.id}
                      className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.06]"
                    >
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#f0503c]/12 text-lg font-bold text-[#ff7a66]">
                        {e.name.slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-tight text-zinc-50">
                          {e.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs font-medium text-zinc-400">
                          {e.blurb}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!extOn[e.id]}
                        aria-label={`Toggle ${e.name}`}
                        onClick={() =>
                          setExtOn({ ...extOn, [e.id]: !extOn[e.id] })
                        }
                        className={`relative h-6 w-11 shrink-0 rounded-full border outline-none transition-all ${extOn[e.id] ? "border-transparent bg-[#f0503c]" : "border-white/15 bg-white/10"}`}
                      >
                        <span
                          className={`absolute top-0.5 rounded-full transition-all ${extOn[e.id] ? "left-[22px] bg-white" : "left-0.5 bg-zinc-400"}`}
                          style={{ width: 16, height: 16 }}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                  <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">
                    {view === "library"
                      ? "Library"
                      : view === "favorites"
                        ? "Favorites"
                        : "Shelf"}
                  </h1>
                  <span className="flex-1" />
                  {view === "cue" && cue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCue([])}
                      className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-red-400"
                    >
                      <Trash2 className="size-3" /> Clear
                    </button>
                  )}
                </div>
                {bulk && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#f0503c]/40 bg-[#f0503c]/10 px-3 py-2 text-xs shadow-[0_0_18px_rgba(240,80,60,0.2)]">
                    <span className="font-mono font-semibold text-[#ff7a66]">
                      {selectedIds.length} selected
                    </span>
                    <span className="flex-1" />
                    <button
                      type="button"
                      onClick={() =>
                        setFavorites((f) =>
                          Array.from(new Set([...f, ...selectedIds])),
                        )
                      }
                      className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-medium hover:border-[#f0503c]/50"
                    >
                      Save all
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCue((c) =>
                          Array.from(new Set([...c, ...selectedIds])),
                        )
                      }
                      className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-medium hover:border-[#f0503c]/50"
                    >
                      Add to shelf
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds([selectedId])}
                      className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-medium text-zinc-400 hover:text-zinc-100"
                    >
                      Clear
                    </button>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-[32px_minmax(0,1fr)_140px_64px_28px] items-center gap-3 border-b border-white/10 pb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  <span />
                  <button
                    type="button"
                    onClick={() => flipSort("filename")}
                    className="text-left transition-colors hover:text-[#ff7a66]"
                  >
                    Name{" "}
                    {sortKey === "filename"
                      ? sortDir === 1
                        ? "\u2191 "
                        : "\u2193 "
                      : ""}
                  </button>
                  <span className="hidden sm:block">Wave</span>
                  <button
                    type="button"
                    onClick={() => flipSort("duration")}
                    className="text-right transition-colors hover:text-[#ff7a66]"
                  >
                    Time{" "}
                    {sortKey === "duration"
                      ? sortDir === 1
                        ? "\u2191 "
                        : "\u2193 "
                      : ""}
                  </button>
                  <span />
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
                  {base.length === 0 && (
                    <p className="py-12 text-center text-2xl font-semibold text-zinc-500">
                      {query
                        ? `Nothing matches "${query}".`
                        : "Nothing here yet."}
                    </p>
                  )}
                  {base.map((s) => {
                    const active = s.id === selectedId;
                    const checked = selectedIds.includes(s.id);
                    const fav = favorites.includes(s.id);
                    return (
                      <div
                        key={s.id}
                        id={`prow-${s.id}`}
                        data-row
                        role="button"
                        tabIndex={0}
                        onClick={(e) => rowClick(s.id, e)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") playSingle(s.id);
                        }}
                        className={`relative grid cursor-pointer grid-cols-[32px_minmax(0,1fr)_140px_64px_28px] items-center gap-3 border-b border-white/5 px-3 outline-none transition-colors last:border-0 ${
                          "py-2.5"
                        } ${
                          active
                            ? "bg-[#f0503c]/10"
                            : checked
                              ? "bg-[#f0503c]/5"
                              : "hover:bg-white/[0.04]"
                        }`}
                      >
                        {active && (
                          <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[#f0503c] shadow-[0_0_10px_rgba(240,80,60,0.8)]" />
                        )}
                        <span
                          className={`flex justify-center ${active && playing ? "text-[#ff7a66]" : "text-zinc-500"}`}
                        >
                          {active && playing ? (
                            <Pause className="size-4" />
                          ) : (
                            <Play className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={`block truncate text-[15px] font-medium ${active ? "font-semibold text-zinc-50" : "text-zinc-100"}`}
                          >
                            {s.filename}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-400">
                            {s.format} · {(s.sampleRate / 1000).toFixed(0)}k ·{" "}
                            {s.tags.join(" · ")}
                          </span>
                        </span>
                        <span className="hidden sm:block">
                          <WaveCanvas
                            peaks={PEAKS[s.id]}
                            progress={active ? progress : 0}
                            height={34}
                          />
                        </span>
                        <span className="text-right font-mono text-xs font-medium tabular-nums text-zinc-300">
                          {fmt(s.duration)}
                        </span>
                        <button
                          type="button"
                          aria-label={
                            fav ? `Unsave ${s.filename}` : `Save ${s.filename}`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFav(s.id);
                          }}
                          className="flex justify-center outline-none"
                        >
                          <Heart
                            className={`size-4 transition-colors ${fav ? "fill-[#f0503c] text-[#f0503c] drop-shadow-[0_0_6px_rgba(240,80,60,0.7)]" : checked ? "text-[#ff7a66]/70" : "text-zinc-600 hover:text-[#ff7a66]"}`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* transport console */}
          <footer className="relative border-t border-white/10">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f0503c]/60 to-transparent" />
            <div className="flex w-full items-center gap-3 px-5 py-2.5">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Previous in queue"
                  onClick={() => {
                    const i = queue.indexOf(selectedId);
                    playSingle(
                      queue[(i - 1 + queue.length) % queue.length] ?? queue[0],
                    );
                  }}
                  className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
                >
                  <SkipBack className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={playing ? "Pause" : "Play"}
                  onClick={() => setPlaying(!playing)}
                  className="flex size-10 items-center justify-center rounded-full bg-[#f0503c] text-white shadow-[0_0_24px_rgba(240,80,60,0.45)] transition-all hover:bg-[#ff5a44]"
                >
                  {playing ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4 pl-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Next in queue"
                  onClick={() => {
                    const i = queue.indexOf(selectedId);
                    playSingle(queue[(i + 1) % queue.length] ?? queue[0]);
                  }}
                  className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
                >
                  <SkipForward className="size-4" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-tight">
                  {selected.filename}
                  <span className="ml-2 font-mono text-[11px] font-normal text-zinc-500">
                    {selected.format} ·{" "}
                    {(selected.sampleRate / 1000).toFixed(1)} kHz ·{" "}
                    {selected.channels === 1 ? "mono" : "stereo"}
                    {nextUp ? ` · next: ${nextUp.filename}` : ""}
                    {lastCommand ? ` · ${lastCommand}` : ""}
                  </span>
                </p>
                <div className="mt-1 max-w-2xl">
                  <WaveCanvas
                    peaks={PEAKS_HD[selected.id]}
                    progress={progress}
                    height={26}
                  />
                </div>
              </div>
              <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-zinc-400 sm:block">
                {fmt(selected.duration * progress)} / {fmt(selected.duration)}
              </span>
            </div>
          </footer>
        </div>
      </div>

      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm [&_button]:outline-none"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="flex h-[min(85vh,850px)] min-h-[600px] w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-[#101014] shadow-2xl backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-black/30">
              <div className="px-5 pb-4 pt-5">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-50">
                  Settings
                </h2>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                  v2.1.0-alpha · Foleyard Core
                </p>
              </div>
              <nav
                className="flex flex-col gap-0.5 px-3"
                aria-label="Settings sections"
              >
                {(
                  [
                    {
                      id: "library",
                      label: "Library & Storage",
                      icon: <FolderOpen className="size-4" />,
                    },
                    {
                      id: "metadata",
                      label: "Playlists & Tags",
                      icon: <Tags className="size-4" />,
                    },
                    {
                      id: "tools",
                      label: "Extensions",
                      icon: <Layers className="size-4" />,
                    },
                    {
                      id: "appearance",
                      label: "Appearance",
                      icon: <SlidersHorizontal className="size-4" />,
                    },
                    {
                      id: "about",
                      label: "About",
                      icon: <Info className="size-4" />,
                    },
                  ] as {
                    id: SettingsTab;
                    label: string;
                    icon: React.ReactNode;
                  }[]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSettingsTab(t.id)}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors outline-none ${settingsTab === t.id ? "border-[#f0503c]/50 bg-[#f0503c]/15 shadow-[0_0_18px_rgba(240,80,60,0.25)]" : "border-transparent hover:bg-white/5"}`}
                  >
                    <span
                      className={
                        settingsTab === t.id
                          ? "text-[#ff7a66]"
                          : "text-zinc-500"
                      }
                    >
                      {t.icon}
                    </span>
                    <span
                      className={`block min-w-0 flex-1 truncate text-sm font-semibold leading-tight ${settingsTab === t.id ? "text-[#ff7a66]" : "text-zinc-200"}`}
                    >
                      {t.label}
                    </span>
                    {settingsTab === t.id && (
                      <span className="h-5 w-[3px] rounded-full bg-[#f0503c]" />
                    )}
                  </button>
                ))}
              </nav>
              <div className="mt-auto p-3">
                <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <span className={`relative flex size-2 shrink-0`}>
                    <span
                      className={`absolute h-full w-full rounded-full ${scan.running ? "animate-ping bg-[#f0503c]/60" : "bg-emerald-400/70"}`}
                    />
                    <span
                      className={`size-2 rounded-full ${scan.running ? "bg-[#f0503c]" : "bg-emerald-400"}`}
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      Status
                    </p>
                    <p className="truncate text-xs font-medium text-zinc-200">
                      {scan.running ? "Scanning library" : "Service online"}
                    </p>
                  </div>
                </div>
              </div>
            </aside>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex items-center px-8 pb-2 pt-6">
                <span className="flex-1" />
                <button
                  type="button"
                  aria-label="Close settings"
                  onClick={() => setShowSettings(false)}
                  className="flex size-8 items-center justify-center rounded-full text-zinc-500 outline-none hover:bg-white/10 hover:text-zinc-100"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
                {settingsTab === "library" && (
                  <div className="mx-auto w-full max-w-4xl">
                    <h3 className="text-3xl font-bold tracking-tight text-zinc-50">
                      Library location
                    </h3>
                    <p className="mt-1 text-[13px] text-zinc-500">
                      The primary folder where your audio samples are stored.
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      <FolderOpen className="size-4 text-[#ff7a66]" />
                      <span className="text-sm font-semibold text-zinc-100">
                        Library folders
                      </span>
                      <span className="flex-1" />
                      <span
                        className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${roots.length > 0 ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/15 text-zinc-500"}`}
                      >
                        {roots.length > 0 ? "Configured" : "Required"}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={newRoot}
                        onChange={(e) => {
                          setNewRoot(e.target.value);
                          setValidateMsg(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addRoot();
                        }}
                        placeholder="/path/to/more/sounds"
                        spellCheck={false}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[#f0503c]/60 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setNewRoot("C:\\Field Recordings");
                          setValidateMsg(null);
                        }}
                        className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-[#f0503c]/50"
                      >
                        Browse
                      </button>
                    </div>
                    <div className="mt-2 divide-y divide-white/5">
                      {roots.map((r) => (
                        <div
                          key={r}
                          className="group flex items-center gap-3 py-2.5"
                        >
                          <FolderOpen className="size-4 shrink-0 text-zinc-600" />
                          <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-200">
                            {r}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${r}`}
                            onClick={() =>
                              setRoots(roots.filter((x) => x !== r))
                            }
                            className="rounded-md p-1.5 text-zinc-600 opacity-0 transition-all hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
                      {roots.length === 0 && (
                        <p className="py-6 text-center text-sm text-zinc-500">
                          No library folders added.
                        </p>
                      )}
                    </div>
                    {validateMsg && (
                      <div
                        className={`mt-3 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 ${validateMsg.ok ? "border-emerald-400/30 bg-emerald-400/10" : "border-red-400/30 bg-red-400/10"}`}
                      >
                        {validateMsg.ok ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                        ) : (
                          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                        )}
                        <div>
                          <p
                            className={`text-xs font-semibold ${validateMsg.ok ? "text-emerald-300" : "text-red-300"}`}
                          >
                            {validateMsg.ok
                              ? "Path verified"
                              : "Invalid folder"}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                            {validateMsg.text}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <p className="text-xs leading-relaxed text-zinc-500">
                        Add every folder you want included in scans.
                      </p>
                      <button
                        type="button"
                        onClick={addRoot}
                        className="shrink-0 rounded-xl bg-[#f0503c] px-5 py-2 text-xs font-semibold text-white hover:bg-[#ff5a44]"
                      >
                        Add Folder
                      </button>
                    </div>
                    <h3 className="mt-6 text-3xl font-bold tracking-tight text-zinc-50">
                      Scan & index
                    </h3>
                    <p className="mt-1 text-[13px] text-zinc-500">
                      Synchronize your database with the local filesystem.
                    </p>
                    <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4">
                      <div
                        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${scan.running ? "bg-[#f0503c]/15 text-[#ff7a66]" : "bg-white/5 text-zinc-400"}`}
                      >
                        <RefreshCw
                          className={`size-4 ${scan.running ? "animate-spin" : ""}`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-100">
                          Library sync
                        </p>
                        <p className="truncate text-xs text-zinc-500">
                          Refreshes metadata and discovers new files.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={runScan}
                        disabled={scan.running || roots.length === 0}
                        className="shrink-0 rounded-xl bg-[#f0503c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#ff5a44] disabled:opacity-40"
                      >
                        {scan.running ? "Scanning..." : "Start full scan"}
                      </button>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/5 font-mono text-xs sm:grid-cols-4">
                      {[
                        ["Phase", scan.running ? "Scanning" : scan.stats ? "Complete" : "idle"],
                        ["Discovered", scan.stats?.discovered ?? 0],
                        ["Indexed", scan.stats?.indexed ?? 0],
                        ["Metadata", scan.stats?.metadata ?? 0],
                        ["Added", scan.stats?.added ?? 0],
                        ["Removed", scan.stats?.removed ?? 0],
                      ].map(([k, v]) => (
                          <div
                            key={k as string}
                            className="bg-[#101014] px-3.5 py-2.5"
                          >
                            <dt className="text-[10px] uppercase tracking-widest text-zinc-500">
                              {k}
                            </dt>
                            <dd className="mt-0.5 text-sm font-semibold text-zinc-100">
                              {v}
                            </dd>
                          </div>
                        ))}
                      </dl>
                  </div>
                )}
                {settingsTab === "metadata" && (
                  <div className="mx-auto w-full max-w-3xl">
                    <h3 className="text-3xl font-bold tracking-tight text-zinc-50">
                      Playlists & tags
                    </h3>
                    <p className="mt-1 text-[13px] text-zinc-500">
                      Manage library organization without leaving settings.
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-4">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                        <ListMusic className="size-4 text-[#ff7a66]" />
                        Playlists
                      </h4>
                      <span className="rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[11px] text-zinc-400">
                        {collections.length}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={newCollection}
                        onChange={(e) => setNewCollection(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newCollection.trim()) {
                            setCollections([
                              ...collections,
                              {
                                id: `c${Date.now()}`,
                                name: newCollection.trim(),
                                count: 0,
                                smart: false,
                              },
                            ]);
                            setNewCollection("");
                          }
                        }}
                        placeholder="New collection name"
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[#f0503c]/60 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newCollection.trim()) {
                            setCollections([
                              ...collections,
                              {
                                id: `c${Date.now()}`,
                                name: newCollection.trim(),
                                count: 0,
                                smart: false,
                              },
                            ]);
                            setNewCollection("");
                          }
                        }}
                        disabled={!newCollection.trim()}
                        className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#f0503c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#ff5a44] disabled:opacity-40"
                      >
                        <Plus className="size-3.5" /> Create
                      </button>
                    </div>
                    <div className="mt-1 divide-y divide-white/5">
                      {collections.map((c) => (
                        <div
                          key={c.id}
                          className="group flex items-center gap-2 py-2.5"
                        >
                          {renamingId === c.id ? (
                            <input
                              value={renameDraft}
                              autoFocus
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && renameDraft.trim()) {
                                  setCollections(
                                    collections.map((x) =>
                                      x.id === c.id
                                        ? { ...x, name: renameDraft.trim() }
                                        : x,
                                    ),
                                  );
                                  setRenamingId(null);
                                }
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              onBlur={() => setRenamingId(null)}
                              aria-label="Rename collection"
                              className="w-full rounded-lg border border-[#f0503c]/50 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none"
                            />
                          ) : (
                            <>
                              {c.smart ? (
                                <Filter className="size-4 shrink-0 text-zinc-500" />
                              ) : (
                                <ListMusic className="size-4 shrink-0 text-zinc-500" />
                              )}
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                                {c.name}
                                {c.smart && (
                                  <span className="ml-2 rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                                    smart
                                  </span>
                                )}
                              </span>
                              <span className="font-mono text-xs tabular-nums text-zinc-500">
                                {c.count}
                              </span>
                              <button
                                type="button"
                                aria-label={`Rename ${c.name}`}
                                onClick={() => {
                                  setRenamingId(c.id);
                                  setRenameDraft(c.name);
                                }}
                                className="rounded-md p-1.5 text-zinc-600 opacity-0 transition-all hover:text-zinc-100 focus:opacity-100 group-hover:opacity-100"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${c.name}`}
                                onClick={() =>
                                  setCollections(
                                    collections.filter((x) => x.id !== c.id),
                                  )
                                }
                                className="rounded-md p-1.5 text-zinc-600 opacity-0 transition-all hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                      {collections.length === 0 && (
                        <p className="py-6 text-center text-sm text-zinc-500">
                          No collections yet.
                        </p>
                      )}
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/5 pt-4">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                        <Tags className="size-4 text-[#ff7a66]" />
                        Tags
                      </h4>
                      <span className="rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[11px] text-zinc-400">
                        {tagList.length}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newTag.trim()) {
                            setTagList([
                              ...tagList,
                              {
                                name: newTag.trim().toLowerCase(),
                                count: 0,
                                color: "#9a937f",
                              },
                            ]);
                            setNewTag("");
                          }
                        }}
                        placeholder="New tag name"
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[#f0503c]/60 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newTag.trim()) {
                            setTagList([
                              ...tagList,
                              {
                                name: newTag.trim().toLowerCase(),
                                count: 0,
                                color: "#9a937f",
                              },
                            ]);
                            setNewTag("");
                          }
                        }}
                        disabled={!newTag.trim()}
                        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold hover:border-[#f0503c]/50 disabled:opacity-40"
                      >
                        <Plus className="size-3.5" /> Add
                      </button>
                    </div>
                    <div className="mt-1 divide-y divide-white/5">
                      {tagList.map((t) => (
                        <div
                          key={t.name}
                          className="group flex items-center gap-3 py-2.5"
                        >
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: t.color }}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                            {t.name}
                          </span>
                          <span className="font-mono text-xs tabular-nums text-zinc-500">
                            {t.count}
                          </span>
                          <button
                            type="button"
                            aria-label={`Delete tag ${t.name}`}
                            onClick={() =>
                              setTagList(tagList.filter((x) => x.name !== t.name))
                            }
                            className="rounded-md p-1.5 text-zinc-600 opacity-0 transition-all hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
                      {tagList.length === 0 && (
                        <p className="py-6 text-center text-sm text-zinc-500">
                          No tags yet.
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {settingsTab === "tools" && (
                  <div>
                    <h3 className="text-3xl font-bold tracking-tight text-zinc-50">
                      Extension management
                    </h3>
                    <p className="mt-1 text-[13px] text-zinc-500">
                      Workflow tools and integrations. Expand one to tune it.
                    </p>
                    <div className="mt-4 divide-y divide-white/5 border-t border-white/5">
                      {EXTENSIONS.length === 0 && (
                        <p className="py-6 text-center text-sm text-zinc-500">
                          No extensions installed.
                        </p>
                      )}
                      {EXTENSIONS.map((e) => (
                        <div key={e.id} className="py-3">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedExt(
                                  expandedExt === e.id ? null : e.id,
                                )
                              }
                              aria-expanded={expandedExt === e.id}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f0503c]/10 text-sm font-bold text-[#ff7a66]">
                                {e.name.slice(0, 2)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-sm font-semibold text-zinc-100">
                                    {e.name}
                                  </span>
                                  <span className="shrink-0 rounded border border-white/15 px-1 font-mono text-[10px] text-zinc-500">
                                    v1.0.0
                                  </span>
                                  <span className="hidden shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:block">
                                    {(e.id === "drop-rules"
                                      ? 5
                                      : (EXT_SETTINGS[e.id] ?? []).length) ||
                                      "no"}{" "}
                                    settings
                                  </span>
                                </span>
                                <span className="block truncate text-xs text-zinc-500">
                                  {e.blurb}
                                </span>
                              </span>
                              <ChevronDown
                                className={`size-4 shrink-0 text-zinc-500 transition-transform ${expandedExt === e.id ? "rotate-180" : ""}`}
                              />
                            </button>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={!!extOn[e.id]}
                              aria-label={`Toggle ${e.name}`}
                              onClick={() =>
                                setExtOn({ ...extOn, [e.id]: !extOn[e.id] })
                              }
                              className={`relative h-6 w-11 shrink-0 rounded-full border outline-none transition-all ${extOn[e.id] ? "border-transparent bg-[#f0503c]" : "border-white/15 bg-white/10"}`}
                            >
                              <span
                                className={`absolute top-0.5 rounded-full transition-all ${extOn[e.id] ? "left-[22px] bg-white" : "left-0.5 bg-zinc-400"}`}
                                style={{ width: 16, height: 16 }}
                              />
                            </button>
                          </div>
                          {expandedExt === e.id && (
                            <div className="ml-12 mt-1 border-l-2 border-[#f0503c]/40 pl-4">
                              {e.id === "drop-rules" ? (
                                <div>
                                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <p className="text-[11px] font-semibold text-zinc-200">
                                        Current behaviour
                                      </p>
                                      <span
                                        className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${dr.copy || dr.rename || dr.mark ? "bg-[#f0503c]/15 text-[#ff7a66]" : "border border-white/15 text-zinc-500"}`}
                                      >
                                        {dr.copy || dr.rename || dr.mark
                                          ? "Rules active"
                                          : "Original unchanged"}
                                      </span>
                                    </div>
                                    <ul className="mt-1.5 space-y-1 text-[11px] text-zinc-400">
                                      <li className="flex items-center gap-1.5">
                                        <span className="size-1 shrink-0 rounded-full bg-zinc-500" />
                                        {dr.copy
                                          ? "Stages a prepared copy"
                                          : "Hands over the original file"}
                                      </li>
                                      <li className="flex items-center gap-1.5">
                                        <span className="size-1 shrink-0 rounded-full bg-zinc-500" />
                                        {dr.rename
                                          ? "Renames on the way out"
                                          : "Keeps original names"}
                                      </li>
                                      <li className="flex items-center gap-1.5">
                                        <span className="size-1 shrink-0 rounded-full bg-zinc-500" />
                                        {dr.mark
                                          ? "Writes a used-sounds report"
                                          : "Writes no report"}
                                      </li>
                                    </ul>
                                  </div>
                                  {(
                                    [
                                      [
                                        "copy",
                                        "Copy on drop",
                                        "Stage a prepared copy instead of the original.",
                                      ],
                                      [
                                        "rename",
                                        "Rename on drop",
                                        "Apply the rename pattern on the way out.",
                                      ],
                                      [
                                        "mark",
                                        "Mark used",
                                        "Write a small used-sounds report.",
                                      ],
                                    ] as const
                                  ).map(([k, label, desc]) => (
                                    <div
                                      key={k}
                                      className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold text-zinc-100">
                                          {label}
                                        </p>
                                        <p className="truncate text-[11px] text-zinc-500">
                                          {desc}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        role="switch"
                                        aria-checked={dr[k]}
                                        aria-label={label}
                                        onClick={() =>
                                          setDr({ ...dr, [k]: !dr[k] })
                                        }
                                        className={`relative h-5 w-9 shrink-0 rounded-full border outline-none transition-all ${dr[k] ? "border-transparent bg-[#f0503c]" : "border-white/15 bg-white/10"}`}
                                      >
                                        <span
                                          className={`absolute top-0.5 rounded-full transition-all ${dr[k] ? "left-[18px] bg-white" : "left-0.5 bg-zinc-400"}`}
                                          style={{ width: 12, height: 12 }}
                                        />
                                      </button>
                                    </div>
                                  ))}
                                  <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                                    Rename pattern
                                  </p>
                                  <input
                                    value={patternDraft}
                                    onChange={(e) =>
                                      setPatternDraft(e.target.value)
                                    }
                                    aria-label="Rename pattern"
                                    spellCheck={false}
                                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-[#f0503c]/60 focus:outline-none"
                                  />
                                  <p
                                    className={`mt-1.5 truncate font-mono text-[11px] ${dropPreview(patternDraft).valid ? "text-zinc-300" : "text-red-400"}`}
                                  >
                                    Preview: {dropPreview(patternDraft).output}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {[
                                      "{name}",
                                      "{index}",
                                      "{ext}",
                                      "{format}",
                                      "{date}",
                                      "{time}",
                                    ].map((tok) => (
                                      <button
                                        key={tok}
                                        type="button"
                                        onClick={() =>
                                          setPatternDraft(patternDraft + tok)
                                        }
                                        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-zinc-400 hover:border-[#f0503c]/50 hover:text-zinc-100"
                                      >
                                        {tok}
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDr({
                                        copy: true,
                                        rename: true,
                                        mark: true,
                                      });
                                      setPatternDraft("{index}-{name}{ext}");
                                    }}
                                    className="mt-2.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-100"
                                  >
                                    Restore defaults
                                  </button>
                                </div>
                              ) : (EXT_SETTINGS[e.id] ?? []).length === 0 ? (
                                <p className="py-1 text-[11px] text-zinc-600">
                                  No settings, just on or off.
                                </p>
                              ) : (
                                (EXT_SETTINGS[e.id] ?? []).map((s) => (
                                  <div
                                    key={s.id}
                                    className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-semibold text-zinc-100">
                                        {s.label}
                                      </p>
                                      {s.desc && (
                                        <p className="truncate text-[11px] text-zinc-500">
                                          {s.desc}
                                        </p>
                                      )}
                                    </div>
                                    {s.type === "boolean" ? (
                                      <button
                                        type="button"
                                        role="switch"
                                        aria-checked={Boolean(
                                          extSettings[e.id]?.[s.id] ?? s.value,
                                        )}
                                        aria-label={s.label}
                                        onClick={() =>
                                          setExtSettings({
                                            ...extSettings,
                                            [e.id]: {
                                              ...extSettings[e.id],
                                              [s.id]: !(
                                                extSettings[e.id]?.[s.id] ??
                                                s.value
                                              ),
                                            },
                                          })
                                        }
                                        className={`relative h-5 w-9 shrink-0 rounded-full border outline-none transition-all ${(extSettings[e.id]?.[s.id] ?? s.value) ? "border-transparent bg-[#f0503c]" : "border-white/15 bg-white/10"}`}
                                      >
                                        <span
                                          className={`absolute top-0.5 rounded-full transition-all ${(extSettings[e.id]?.[s.id] ?? s.value) ? "left-[18px] bg-white" : "left-0.5 bg-zinc-400"}`}
                                          style={{ width: 12, height: 12 }}
                                        />
                                      </button>
                                    ) : s.type === "select" ? (
                                      <select
                                        aria-label={s.label}
                                        value={String(
                                          extSettings[e.id]?.[s.id] ?? s.value,
                                        )}
                                        onChange={(ev) =>
                                          setExtSettings({
                                            ...extSettings,
                                            [e.id]: {
                                              ...extSettings[e.id],
                                              [s.id]: ev.target.value,
                                            },
                                          })
                                        }
                                        className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-zinc-100 focus:outline-none"
                                      >
                                        {(s.options ?? []).map((o) => (
                                          <option key={o.value} value={o.value}>
                                            {o.label}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        aria-label={s.label}
                                        type={
                                          s.type === "number"
                                            ? "number"
                                            : "text"
                                        }
                                        defaultValue={String(
                                          extSettings[e.id]?.[s.id] ?? s.value,
                                        )}
                                        onBlur={(ev) =>
                                          setExtSettings({
                                            ...extSettings,
                                            [e.id]: {
                                              ...extSettings[e.id],
                                              [s.id]:
                                                s.type === "number"
                                                  ? Number(ev.target.value)
                                                  : ev.target.value,
                                            },
                                          })
                                        }
                                        className="w-40 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs text-zinc-100 focus:border-[#f0503c]/60 focus:outline-none"
                                      />
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {settingsTab === "appearance" && (
                  <div className="mx-auto w-full max-w-2xl">
                    <h3 className="text-3xl font-bold tracking-tight text-zinc-50">
                      Appearance
                    </h3>
                    <p className="mt-1 text-[13px] text-zinc-500">
                      Customize how Foleyard looks on your display.
                    </p>
                    <div className="mt-4 flex items-center gap-4">
                      <p className="font-mono text-5xl font-semibold tabular-nums text-zinc-50">
                        {zoomLevel}
                        <span className="text-2xl text-zinc-500">%</span>
                      </p>
                      <div className="min-w-0 flex-1">
                        <input
                          type="range"
                          min={50}
                          max={200}
                          step={5}
                          value={zoomLevel}
                          onChange={(e) => setZoomLevel(Number(e.target.value))}
                          aria-label="Interface zoom"
                          className="w-full accent-[#f0503c]"
                        />
                        <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-600">
                          <span>50</span>
                          <span>100</span>
                          <span>200</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setZoomLevel(100)}
                        disabled={zoomLevel === 100}
                        className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest hover:border-[#f0503c]/50 disabled:opacity-40"
                      >
                        Reset
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      Scales the whole interface. Handy on dense displays.
                    </p>
                    <div className="mt-4 flex items-center gap-3 border-t border-white/5 pt-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-100">
                          Autoplay queue
                        </p>
                        <p className="text-xs text-zinc-500">
                          Keep playing without stopping.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoplay}
                        aria-label="Toggle autoplay"
                        onClick={() => setAutoplay(!autoplay)}
                        className={`relative h-6 w-11 shrink-0 rounded-full border outline-none transition-all ${autoplay ? "border-transparent bg-[#f0503c]" : "border-white/15 bg-white/10"}`}
                      >
                        <span
                          className={`absolute top-0.5 rounded-full transition-all ${autoplay ? "left-[22px] bg-white" : "left-0.5 bg-zinc-400"}`}
                          style={{ width: 16, height: 16 }}
                        />
                      </button>
                    </div>
                  </div>
                )}
                {settingsTab === "about" && (
                  <div className="mx-auto w-full max-w-3xl">
                    <h3 className="text-3xl font-bold tracking-tight text-zinc-50">
                      About
                    </h3>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#f0503c]/15 text-xl font-bold text-[#ff7a66]">
                        F
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-50">
                          Foleyard
                          <span className="rounded-md border border-white/15 px-1.5 py-0.5 font-mono text-[10px] font-normal text-zinc-400">
                            v2.1.0-alpha
                          </span>
                          <span className="rounded-md border border-white/15 px-1.5 py-0.5 font-mono text-[10px] font-normal text-zinc-400">
                            Desktop Core
                          </span>
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                          v2.1.0-alpha, desktop core, MIT licensed
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setLastCommand(
                            updateChecking
                              ? null
                              : "checking for updates (stub)",
                          );
                          setUpdateChecking(!updateChecking);
                          if (!updateChecking)
                            setTimeout(() => {
                              setLastCommand("up to date (stub)");
                              setUpdateChecking(false);
                            }, 1200);
                        }}
                        disabled={updateChecking}
                        className="shrink-0 rounded-xl bg-[#f0503c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#ff5a44] disabled:opacity-40"
                      >
                        {updateChecking ? "Checking..." : "Check for updates"}
                      </button>
                    </div>
                    <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-zinc-400">
                      A local-first sound library. It indexes the folders above
                      so search, collections, and tools stay fast without any
                      account or cloud.
                    </p>
                    {lastCommand && lastCommand.includes("update") && (
                      <p className="mt-2 font-mono text-[11px] text-zinc-500">
                        {lastCommand}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setLastCommand("docs (stub, no link wired)")
                        }
                        className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold hover:border-[#f0503c]/50"
                      >
                        <ExternalLink className="size-3.5" /> Documentation
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setLastCommand("github (stub, no link wired)")
                        }
                        className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold hover:border-[#f0503c]/50"
                      >
                        <Globe className="size-3.5" /> GitHub
                      </button>
                    </div>
                    <p className="mt-4 border-t border-white/5 pt-3 font-mono text-[10px] text-zinc-600">
                      © 2026 Foleyard Contributors · MIT Licensed
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#f0503c]/30 bg-[#121217]/95 shadow-[0_0_60px_rgba(240,80,60,0.25)] backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4">
              <Search className="size-4 text-zinc-500" />
              <input
                ref={paletteRef}
                value={paletteQuery}
                onChange={(e) => {
                  setPaletteQuery(e.target.value);
                  setPaletteIndex(0);
                }}
                placeholder="Type a command or sound..."
                className="w-full bg-transparent py-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
              />
              <kbd className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                esc
              </kbd>
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {paletteItems.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-zinc-500">
                  No matches.
                </p>
              )}
              {paletteItems.map((item, i) => (
                <button
                  key={`${item.kind}-${item.label}`}
                  type="button"
                  onClick={() => {
                    item.run();
                    setPaletteOpen(false);
                  }}
                  onMouseEnter={() => setPaletteIndex(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${i === paletteIndex ? "bg-[#f0503c]/15 text-[#ff8a76]" : "text-zinc-200"}`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                    {item.hint}
                  </span>
                  {i === paletteIndex && (
                    <CornerDownLeft className="size-3.5 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

