"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Library, ListMusic, Search, Settings, Star } from "lucide-react";

import { DEMO_TAGS } from "../showcase/data";
import { CollectionMenu, RowMenu } from "./menus";
import { MockPalette, type MockPaletteEntry } from "./palette";
import { FloatingConsole } from "./console";
import { LibraryRows, MOCK_FILES, OrganizeView, ToolsList, type MockFile } from "./views";

type MockView = "library" | "organize" | "favorites" | "shelf" | "tools";

const FAKE_DURATION = 8;

function fmt(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function AppV2Page() {
  const [view, setView] = useState<MockView>("library");
  const [files, setFiles] = useState<MockFile[]>(MOCK_FILES);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"filename" | "duration">("filename");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [muted, setMuted] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set(["s6"]));
  const [shelfIds, setShelfIds] = useState<Set<string>>(new Set(["s2", "s5"]));
  const [fileTags, setFileTags] = useState<Record<string, string[]>>({
    s1: ["t1", "t5"],
    s2: ["t2"],
  });
  const [collections, setCollections] = useState([
    { id: "c1", name: "Impacts", fileCount: 24 },
    { id: "c2", name: "Rain beds", fileCount: 11 },
  ]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ fileId: string; x: number; y: number } | null>(null);
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = view === "favorites" ? files.filter((file) => favorites.has(file.id)) : files;
    const inView =
      view === "shelf" ? base.filter((file) => shelfIds.has(file.id)) : base;
    const searched = q
      ? inView.filter(
          (file) =>
            file.filename.toLowerCase().includes(q) ||
            file.tags.some((tag) => tag.toLowerCase().includes(q)),
        )
      : inView;
    return [...searched].sort((a, b) =>
      sortKey === "filename"
        ? a.filename.localeCompare(b.filename) * sortDir
        : a.filename.localeCompare(b.filename) * sortDir,
    );
  }, [files, favorites, shelfIds, view, query, sortKey, sortDir]);

  const playingFile = files.find((file) => file.id === playingId) ?? null;

  const playFile = useCallback((id: string) => {
    setPlayingId(id);
    setSelectedId(id);
    setProgress(0);
    setIsPlaying(true);
  }, []);

  const stepQueue = useCallback(
    (direction: 1 | -1) => {
      if (visibleFiles.length === 0) {
        return;
      }
      const index = visibleFiles.findIndex((file) => file.id === playingId);
      const next = visibleFiles[(index + direction + visibleFiles.length) % visibleFiles.length];
      if (next) {
        playFile(next.id);
      }
    },
    [visibleFiles, playingId, playFile],
  );

  useEffect(() => {
    if (!isPlaying || !playingId) {
      return;
    }
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const next = prev + 0.4 / FAKE_DURATION;
        if (next >= 1) {
          window.clearInterval(timer);
          if (autoplay) {
            window.setTimeout(() => stepQueue(1), 0);
          } else {
            window.setTimeout(() => setIsPlaying(false), 0);
          }
          return 1;
        }
        return next;
      });
    }, 400);
    return () => window.clearInterval(timer);
  }, [isPlaying, playingId, autoplay, stepQueue]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const flipSort = useCallback(
    (key: "filename" | "duration") => {
      if (key === sortKey) {
        setSortDir((dir) => (dir === 1 ? -1 : 1));
      } else {
        setSortKey(key);
        setSortDir(1);
      }
    },
    [sortKey],
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const paletteEntries: MockPaletteEntry[] = useMemo(() => {
    const entries: MockPaletteEntry[] = [
      { id: "view:library", label: "Go to Library", hint: "view" },
      { id: "view:organize", label: "Go to Organize", hint: "view" },
      { id: "view:favorites", label: "Go to Favorites", hint: "view" },
      { id: "view:shelf", label: "Go to Shelf", hint: "view" },
      { id: "view:tools", label: "Go to Extensions", hint: "view" },
    ];
    if (playingFile) {
      entries.push({ id: "transport:toggle", label: isPlaying ? "Pause" : "Play", hint: "transport" });
    }
    if (visibleFiles.length > 1) {
      entries.push({ id: "transport:next", label: "Next in queue", hint: "transport" });
      entries.push({ id: "transport:prev", label: "Previous in queue", hint: "transport" });
    }
    entries.push({ id: "transport:autoplay", label: `Autoplay ${autoplay ? "off" : "on"}`, hint: "transport" });
    if (playingFile) {
      entries.push({
        id: "file:favorite",
        label: favorites.has(playingFile.id) ? "Unsave current" : "Save current",
        hint: "file",
      });
      entries.push({ id: "file:shelf", label: "Add current file to shelf", hint: "file" });
    }
    entries.push({ id: "tool:scan", label: "Scan library", hint: "tool" });
    entries.push({ id: "tool:gather", label: "Gather library", hint: "tool" });
    entries.push({ id: "tool:pack", label: "Pack recent sounds", hint: "tool" });
    for (const file of visibleFiles.slice(0, 6)) {
      entries.push({ id: `sound:${file.id}`, label: file.filename, hint: `${file.format} · ${file.duration}` });
    }
    return entries;
  }, [playingFile, isPlaying, visibleFiles, autoplay, favorites]);

  const runPaletteEntry = useCallback(
    (entry: MockPaletteEntry) => {
      const [kind, rest] = entry.id.split(/:(.*)/);
      if (kind === "view" && (rest === "library" || rest === "organize" || rest === "favorites" || rest === "shelf" || rest === "tools")) {
        setView(rest);
      } else if (kind === "transport") {
        if (rest === "toggle" && playingId) {
          setIsPlaying((playing) => !playing);
        } else if (rest === "next") {
          stepQueue(1);
        } else if (rest === "prev") {
          stepQueue(-1);
        } else if (rest === "autoplay") {
          setAutoplay((value) => !value);
        }
      } else if (kind === "file" && playingId) {
        if (rest === "favorite") {
          toggleFavorite(playingId);
        } else if (rest === "shelf") {
          setShelfIds((prev) => new Set(prev).add(playingId));
          setLastCommand("added to shelf");
        }
      } else if (kind === "tool") {
        setLastCommand(entry.label.toLowerCase());
      } else if (kind === "sound") {
        playFile(rest);
      }
      setPaletteOpen(false);
    },
    [playingId, stepQueue, toggleFavorite, playFile],
  );

  const railItems: Array<{ id: MockView; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: "library", label: "Library", icon: <Library className="size-5" /> },
    { id: "organize", label: "Organize", icon: <ListMusic className="size-5" /> },
    { id: "favorites", label: "Favorites", icon: <Star className="size-5" />, badge: favorites.size },
    { id: "shelf", label: "Shelf", icon: <ListMusic className="size-5" />, badge: shelfIds.size },
    { id: "tools", label: "Tools", icon: <Settings className="size-5" /> },
  ];

  const showSearch = view === "library" || view === "favorites" || view === "shelf";
  const rowMenuFile = rowMenu ? (files.find((file) => file.id === rowMenu.fileId) ?? null) : null;

  return (
    <div className="flex h-full flex-col bg-canvas font-sans text-zinc-100 antialiased">
      <p className="border-b border-white/10 bg-black/40 px-4 py-1.5 text-center font-mono text-[11px] text-accent-text">
        APP-V2 — throwaway full mock. Winners wired: palette F, quiet popups, rounded console, W-H organize.
      </p>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--accent-fill)_13%,transparent),transparent_38%),radial-gradient(circle_at_bottom_right,color-mix(in_oklab,var(--accent-fill)_6%,transparent),transparent_40%)]" />
        <nav aria-label="Primary" className="relative flex w-[5.25rem] shrink-0 flex-col items-center gap-1 overflow-visible border-r border-white/10 py-4">
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent-fill text-lg font-black text-white shadow-glow-accent-strong">
            F
          </div>
          {railItems.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`relative flex w-[4.25rem] flex-col items-center gap-1 whitespace-nowrap rounded-xl border px-1 py-2.5 text-center text-[9px] font-semibold uppercase tracking-[0.1em] transition-all ${
                  active
                    ? "border-accent-fill/50 bg-accent-fill/15 text-accent-text shadow-glow-accent"
                    : "border-transparent text-zinc-500 hover:border-white/10 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                {item.icon}
                {item.label}
                {typeof item.badge === "number" && item.badge > 0 ? (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-accent-fill px-1 font-mono text-[9px] font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
          <header className="shrink-0 px-4 pt-4 md:px-5">
            <div className="flex items-center gap-3">
              {showSearch ? (
                <div className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 transition-all focus-within:border-accent-fill/60 focus-within:bg-white/[0.06] focus-within:shadow-glow-accent">
                  <Search className="size-4 shrink-0 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search sounds by name, tag, or format..."
                    aria-label="Search sounds"
                    className="w-full bg-transparent py-2.5 text-[15px] font-medium text-zinc-50 placeholder:font-normal placeholder:text-zinc-600 focus:outline-none"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="shrink-0 rounded-md px-2 py-1 font-mono text-[11px] text-zinc-500 hover:text-zinc-100"
                    >
                      Clear
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setPaletteOpen(true)}
                    aria-label="Open command palette"
                    title="Command palette (Ctrl+K)"
                    className="hidden shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 hover:border-accent-fill/50 hover:text-zinc-100 sm:flex"
                  >
                    {"\u2318"}K <span className="text-zinc-600">{visibleFiles.length}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <div className={`min-h-0 flex-1 overflow-y-auto px-4 md:px-5 ${playingFile ? "pb-44" : "pb-10"}`}>
            {view === "library" ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 pt-4">
                  <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">Library</h1>
                </div>
                <div className="mt-4">
                  <LibraryRows
                    files={visibleFiles}
                    selectedId={selectedId}
                    playingId={playingId}
                    isPlaying={isPlaying}
                    favorites={favorites}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onFlipSort={flipSort}
                    onSelect={(id) => {
                      if (selectedId === id) {
                        setIsPlaying((playing) => !playing);
                      } else {
                        playFile(id);
                      }
                    }}
                    onToggleFavorite={toggleFavorite}
                    onContextMenu={(id, x, y) => setRowMenu({ fileId: id, x, y })}
                  />
                </div>
              </>
            ) : null}

            {view === "organize" ? (
              <div className="pt-4">
                <OrganizeView />
              </div>
            ) : null}

            {view === "favorites" ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 pt-4">
                  <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">Favorites</h1>
                </div>
                <div className="mt-4">
                  {visibleFiles.length === 0 ? (
                    <p className="py-12 text-center text-2xl font-semibold text-zinc-500">
                      Nothing here yet.
                    </p>
                  ) : (
                    <LibraryRows
                      files={visibleFiles}
                      selectedId={selectedId}
                      playingId={playingId}
                      isPlaying={isPlaying}
                      favorites={favorites}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onFlipSort={flipSort}
                      onSelect={playFile}
                      onToggleFavorite={toggleFavorite}
                      onContextMenu={(id, x, y) => setRowMenu({ fileId: id, x, y })}
                    />
                  )}
                </div>
              </>
            ) : null}

            {view === "shelf" ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 pt-4">
                  <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">Shelf</h1>
                </div>
                <p className="mt-1.5 text-sm font-medium text-zinc-400">Sounds under review.</p>
                <div className="mt-4">
                  {visibleFiles.length === 0 ? (
                    <p className="py-12 text-center text-2xl font-semibold text-zinc-500">
                      Nothing here yet.
                    </p>
                  ) : (
                    <LibraryRows
                      files={visibleFiles}
                      selectedId={selectedId}
                      playingId={playingId}
                      isPlaying={isPlaying}
                      favorites={favorites}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onFlipSort={flipSort}
                      onSelect={playFile}
                      onToggleFavorite={toggleFavorite}
                      onContextMenu={(id, x, y) => setRowMenu({ fileId: id, x, y })}
                    />
                  )}
                </div>
              </>
            ) : null}

            {view === "tools" ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 pt-4">
                  <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">Tools</h1>
                </div>
                <p className="mt-1.5 text-sm font-medium text-zinc-400">
                  Optional workflows. Flip one on and it joins the workspace.
                </p>
                <ToolsList />
              </>
            ) : null}
          </div>
        </main>
      </div>

      {playingFile ? (
        <FloatingConsole
          filename={playingFile.filename}
          meta={`${playingFile.format} · next: ${
            visibleFiles[(visibleFiles.findIndex((file) => file.id === playingFile.id) + 1) % Math.max(1, visibleFiles.length)]?.filename ?? "—"
          }${lastCommand ? ` · ${lastCommand}` : ""}`}
          elapsed={fmt(progress * FAKE_DURATION)}
          total={fmt(FAKE_DURATION)}
          progress={progress}
          isPlaying={isPlaying}
          isFavorite={favorites.has(playingFile.id)}
          isMuted={muted}
          autoplay={autoplay}
          onTogglePlayback={() => setIsPlaying((playing) => !playing)}
          onNext={() => {
            const index = visibleFiles.findIndex((file) => file.id === playingFile.id);
            const next = visibleFiles[(index + 1) % Math.max(1, visibleFiles.length)];
            if (next) {
              playFile(next.id);
            }
          }}
          onPrev={() => {
            const index = visibleFiles.findIndex((file) => file.id === playingFile.id);
            const prev =
              visibleFiles[(index - 1 + visibleFiles.length) % Math.max(1, visibleFiles.length)];
            if (prev) {
              playFile(prev.id);
            }
          }}
          onSeek={(fraction) => setProgress(fraction)}
          onToggleFavorite={() => toggleFavorite(playingFile.id)}
          onOpenCollections={() => setCollectionMenuOpen(true)}
          onToggleMuted={() => setMuted((value) => !value)}
          onToggleAutoplay={() => setAutoplay((value) => !value)}
          onClose={() => {
            setPlayingId(null);
            setSelectedId(null);
            setIsPlaying(false);
            setProgress(0);
          }}
        />
      ) : null}

      {paletteOpen ? (
        <MockPalette
          open={paletteOpen}
          entries={paletteEntries}
          onSelect={runPaletteEntry}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}
      {collectionMenuOpen && playingFile ? (
        <CollectionMenu
          collections={collections}
          onPick={(id) => {
            const collection = collections.find((item) => item.id === id);
            setLastCommand(`added to ${collection?.name ?? "collection"}`);
            setCollectionMenuOpen(false);
          }}
          onNew={() => {
            setCollections((prev) => [
              ...prev,
              { id: `c${Date.now()}`, name: `Untitled ${prev.length + 1}`, fileCount: 0 },
            ]);
            setLastCommand("new collection");
            setCollectionMenuOpen(false);
          }}
          onClose={() => setCollectionMenuOpen(false)}
        />
      ) : null}

      {rowMenu && rowMenuFile ? (
        <RowMenu
          x={rowMenu.x}
          y={rowMenu.y}
          filename={rowMenuFile.filename}
          tags={DEMO_TAGS}
          fileTags={fileTags[rowMenu.fileId] ?? []}
          inShelf={shelfIds.has(rowMenu.fileId)}
          onToggleTag={(tagId) => {
            setFileTags((prev) => {
              const current = prev[rowMenu.fileId] ?? [];
              return {
                ...prev,
                [rowMenu.fileId]: current.includes(tagId)
                  ? current.filter((id) => id !== tagId)
                  : [...current, tagId],
              };
            });
          }}
          onCopyPath={() => {
            setLastCommand("path copied");
            setRowMenu(null);
          }}
          onMakePack={() => {
            setLastCommand("pack started");
            setRowMenu(null);
          }}
          onToggleShelf={() => {
            setShelfIds((prev) => {
              const next = new Set(prev);
              if (next.has(rowMenu.fileId)) {
                next.delete(rowMenu.fileId);
              } else {
                next.add(rowMenu.fileId);
              }
              return next;
            });
            setRowMenu(null);
          }}
          onToggleFavorite={() => {
            toggleFavorite(rowMenu.fileId);
            setRowMenu(null);
          }}
          isFavorite={favorites.has(rowMenu.fileId)}
          onRemove={() => {
            setFiles((prev) => prev.filter((file) => file.id !== rowMenu.fileId));
            if (selectedId === rowMenu.fileId) {
              setSelectedId(null);
            }
            if (playingId === rowMenu.fileId) {
              setPlayingId(null);
              setIsPlaying(false);
              setProgress(0);
            }
            setRowMenu(null);
          }}
          onClose={() => setRowMenu(null)}
        />
      ) : null}
    </div>
  );
}
