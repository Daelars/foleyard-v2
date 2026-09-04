"use client";

import { useState } from "react";
import { Heart, Pause, Play } from "lucide-react";

import { DEMO_SOUNDS, MiniBars } from "../showcase/data";
import { AltRailDetail } from "../revised-v2/flows-alt";

export type MockFile = {
  id: string;
  filename: string;
  format: string;
  duration: string;
  tags: string[];
};

export const MOCK_FILES: MockFile[] = DEMO_SOUNDS.map((sound) => ({
  id: sound.id,
  filename: sound.filename,
  format: sound.format,
  duration: sound.duration,
  tags: sound.tags,
}));

export function LibraryRows({
  files,
  selectedId,
  playingId,
  isPlaying,
  favorites,
  sortKey,
  sortDir,
  onFlipSort,
  onSelect,
  onToggleFavorite,
  onContextMenu,
}: {
  files: MockFile[];
  selectedId: string | null;
  playingId: string | null;
  isPlaying: boolean;
  favorites: Set<string>;
  sortKey: "filename" | "duration";
  sortDir: 1 | -1;
  onFlipSort: (key: "filename" | "duration") => void;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-[32px_minmax(0,1fr)_140px_64px_28px] items-center gap-3 border-b border-white/10 px-3 pb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
        <span />
        <button type="button" onClick={() => onFlipSort("filename")} className="text-left transition-colors hover:text-accent-text">
          Name {sortKey === "filename" ? (sortDir === 1 ? "↑ " : "↓ ") : ""}
        </button>
        <span className="hidden sm:block">Wave</span>
        <button type="button" onClick={() => onFlipSort("duration")} className="text-right transition-colors hover:text-accent-text">
          Time {sortKey === "duration" ? (sortDir === 1 ? "↑ " : "↓ ") : ""}
        </button>
        <span />
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {files.map((file, i) => {
          const active = file.id === selectedId;
          const playing = file.id === playingId && isPlaying;
          return (
            <div
              key={file.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(file.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSelect(file.id);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                onContextMenu(file.id, event.clientX, event.clientY);
              }}
              className={`relative grid cursor-pointer grid-cols-[32px_minmax(0,1fr)_140px_64px_28px] items-center gap-3 border-b border-white/5 px-3 outline-none transition-colors last:border-0 ${
                active ? "bg-accent-fill/10" : "hover:bg-white/[0.04]"
              }`}
              style={{ height: "64px" }}
            >
              {active ? (
                <span className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent-fill shadow-glow-accent" />
              ) : null}
              <span className={`flex justify-center ${playing ? "text-accent-text" : "text-zinc-500"}`}>
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-[15px] font-medium ${active ? "font-semibold text-zinc-50" : "text-zinc-100"}`}>
                  {file.filename}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-400">
                  {file.format} · {file.tags.join(" · ")}
                </span>
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block h-[34px]">
                  <MiniBars seed={i + 1} active={active} />
                </span>
              </span>
              <span className="text-right font-mono text-xs font-medium tabular-nums text-zinc-300">
                {file.duration}
              </span>
              <span className="flex justify-center">
                <button
                  type="button"
                  aria-label={favorites.has(file.id) ? `Unsave ${file.filename}` : `Save ${file.filename}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavorite(file.id);
                  }}
                  className="flex justify-center outline-none"
                >
                  <Heart
                    className={`size-4 transition-colors ${favorites.has(file.id) ? "fill-accent-fill text-accent-fill" : "text-zinc-600 hover:text-accent-text"}`}
                  />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MOCK_TOOLS = [
  { id: "folder-janitor", name: "Folder Janitor", blurb: "Duplicates, missing files, empty folders." },
  { id: "library-gatherer", name: "Library Gatherer", blurb: "Pull scattered folders into one library." },
  { id: "make-pack", name: "Make Pack", blurb: "Turn sounds into a folder or zip." },
  { id: "sound-shelf", name: "Sound Shelf", blurb: "A holding strip for sounds under review." },
  { id: "drop-rules", name: "Drop Rules", blurb: "Copy, rename, and log on drag out." },
];

export function ToolsList() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    "folder-janitor": true,
    "library-gatherer": true,
    "make-pack": true,
    "sound-shelf": true,
    "drop-rules": false,
  });
  return (
    <div className="mt-5 grid gap-3 xl:grid-cols-2">
      {MOCK_TOOLS.map((tool) => {
        const on = enabled[tool.id] ?? false;
        return (
          <div
            key={tool.id}
            className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.06]"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-fill/12 text-lg font-bold text-accent-text">
              {tool.name.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight text-zinc-50">{tool.name}</p>
              <p className="mt-0.5 truncate text-xs font-medium text-zinc-400">{tool.blurb}</p>
              <p className="mt-1 font-mono text-[10px] text-zinc-500">v1.0.0 · 3 settings</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`Toggle ${tool.name}`}
              onClick={() => setEnabled((prev) => ({ ...prev, [tool.id]: !on }))}
              className={`relative h-6 w-11 shrink-0 rounded-full border outline-none transition-all ${on ? "border-transparent bg-accent-fill" : "border-white/15 bg-white/10"}`}
            >
              <span
                className={`absolute top-0.5 rounded-full transition-all ${on ? "left-[22px] bg-white" : "left-0.5 bg-zinc-400"}`}
                style={{ width: 16, height: 16 }}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function OrganizeView() {
  return (
    <div>
      <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">Organize</h1>
      <p className="mt-1.5 text-sm font-medium text-zinc-400">
        Collections and tags in one place. Pick anything to inspect it.
      </p>
      <div className="mt-5">
        <AltRailDetail />
      </div>
    </div>
  );
}
