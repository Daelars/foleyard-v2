"use client";

import { useState } from "react";
import { ChevronDown, ListMusic, Play, Search } from "lucide-react";

import {
  DEMO_COLLECTIONS,
  DEMO_SOUNDS,
  DEMO_TAGS,
  MiniBars,
  VariantFrame,
  tileStyle,
} from "../showcase/data";
import { useFlowState } from "./flows";
import { Swatches, themeButtonStyle } from "./shared";

const DETAIL_FILES = ["Metal Door Slam", "Glass Break Small", "Gravel Footsteps"];

export function AltRailDetail() {
  const { selection, setSelection, collectionColors, setCollectionColors, tagColors, setTagColors } =
    useFlowState();
  const isCollection = selection.kind === "collection";
  const collection = DEMO_COLLECTIONS.find((c) => c.id === selection.id);
  const tag = DEMO_TAGS.find((t) => t.id === selection.id);
  const color = isCollection
    ? (collectionColors[selection.id] ?? collection?.color ?? "#f0503c")
    : (tagColors[selection.id] ?? tag?.color ?? "#f0503c");
  const name = isCollection ? (collection?.name ?? "") : (tag?.name ?? "");
  const sub = isCollection
    ? `${collection?.fileCount ?? 0} sounds · regular collection`
    : "Tag · filters the library";
  const fileDetails = DETAIL_FILES.map((file) => ({
    name: file,
    duration: DEMO_SOUNDS.find((sound) => sound.filename === file)?.duration ?? "0:03",
  }));

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Collections
        </p>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {DEMO_COLLECTIONS.map((item) => {
            const itemColor = collectionColors[item.id] ?? item.color;
            const active = isCollection && selection.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelection({ kind: "collection", id: item.id })}
                style={active ? { borderColor: `${itemColor}80`, backgroundColor: `${itemColor}12` } : undefined}
                className={`group flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                  active ? "border" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                }`}
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                  style={tileStyle(itemColor)}
                >
                  {item.name.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-zinc-100">
                    {item.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-zinc-500">
                    {item.fileCount} sounds
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Tags
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {DEMO_TAGS.map((item) => {
            const itemColor = tagColors[item.id] ?? item.color;
            const active = !isCollection && selection.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelection({ kind: "tag", id: item.id })}
                style={active ? { borderColor: `${itemColor}80`, backgroundColor: `${itemColor}14` } : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  active ? "border" : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.06]"
                }`}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: itemColor }} />
                {item.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full shrink-0 lg:sticky lg:top-0 lg:w-[380px] lg:self-start">
        <div
          className="overflow-hidden rounded-2xl border border-white/10"
          style={{
            backgroundColor: `${color}0a`,
            backgroundImage: `radial-gradient(circle at 88% 0%, ${color}45, transparent 92%)`,
          }}
        >
          <div
            className="m-3 rounded-2xl bg-black/60 p-2 backdrop-blur-md"
            style={{
              WebkitMaskImage:
                "radial-gradient(100% 100% at 50% 50%, black 38%, transparent 98%)",
              maskImage:
                "radial-gradient(100% 100% at 50% 50%, black 38%, transparent 98%)",
            }}
          >
            <div className="flex items-center gap-3 p-3">
              <span
                className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
                style={tileStyle(color)}
              >
                {name.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold tracking-tight text-zinc-50">{name}</p>
                <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>
              </div>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100">
                <Play className="ml-0.5 size-4" />
              </span>
            </div>
            <div className="px-3 pb-1">
              <div className="h-9 opacity-90">
                <MiniBars seed={selection.id.length * 7 + 3} />
              </div>
            </div>
            <div className="space-y-0.5 px-1 pb-1">
              {fileDetails.map((file) => (
                <div key={file.name} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-zinc-200 hover:bg-white/[0.04]">
                  <ListMusic className="size-4 shrink-0 text-zinc-600" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                    {file.duration}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 border-t border-white/5 p-3">
              <Swatches
                value={color}
                onPick={(next) => {
                  if (isCollection) {
                    setCollectionColors((prev) => ({ ...prev, [selection.id]: next }));
                  } else {
                    setTagColors((prev) => ({ ...prev, [selection.id]: next }));
                  }
                }}
              />
              <span
                className="ml-auto shrink-0 rounded-xl px-4 py-2 text-xs font-semibold"
                style={themeButtonStyle(color)}
              >
                {isCollection ? "Open" : "Filter library"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AltStacked() {
  const [expanded, setExpanded] = useState<string | null>("c2");
  const [colors, setColors] = useState<Record<string, string>>({});
  const colorFor = (id: string, fallback: string) => colors[id] ?? fallback;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-2">
      {DEMO_COLLECTIONS.map((collection) => {
        const color = colorFor(collection.id, collection.color);
        const open = expanded === collection.id;
        return (
          <div
            key={collection.id}
            className="overflow-hidden rounded-2xl border transition-colors"
            style={
              open
                ? { borderColor: `${color}60`, backgroundColor: `${color}0d` }
                : { borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)" }
            }
          >
            <button
              type="button"
              onClick={() => setExpanded(open ? null : collection.id)}
              className="flex w-full items-center gap-3 p-3.5 text-left"
            >
              <span
                className="h-10 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-zinc-100">
                  {collection.name}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  {collection.fileCount} sounds
                </span>
              </span>
              <ChevronDown
                className={`size-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
            {open ? (
              <div className="space-y-0.5 px-3 pb-2">
                {DETAIL_FILES.map((file) => (
                  <div key={file} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-200">
                    <ListMusic className="size-3.5 shrink-0 text-zinc-600" />
                    <span className="truncate">{file}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 px-2 pb-2 pt-1">
                  <Swatches
                    value={color}
                    onPick={(next) => setColors((prev) => ({ ...prev, [collection.id]: next }))}
                  />
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AltCommandBar() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);
  const collections = DEMO_COLLECTIONS.filter((c) => match(c.name));
  const tags = DEMO_TAGS.filter((t) => match(t.name));
  const files = DEMO_SOUNDS.filter(
    (s) => match(s.filename) || s.tags.some((t) => match(t)),
  ).slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-shell/90 shadow-glow-accent backdrop-blur-2xl">
      <div className="flex items-center gap-3 border-b border-white/10 px-5">
        <Search className="size-4 shrink-0 text-zinc-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Browse collections, tags, sounds..."
          aria-label="Browse collections, tags, sounds"
          className="w-full bg-transparent py-4 text-[15px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
      </div>
      <div className="max-h-80 overflow-y-auto p-2">
        {collections.length + tags.length + files.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-zinc-500">No matches.</p>
        ) : (
          <>
            {collections.length > 0 ? (
              <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                Collections
              </p>
            ) : null}
            {collections.map((collection) => (
              <div
                key={collection.id}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-zinc-200"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                  style={tileStyle(collection.color)}
                >
                  {collection.name.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                  {collection.fileCount}
                </span>
              </div>
            ))}
            {tags.length > 0 ? (
              <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                Tags
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5 px-3 pb-1">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-200"
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </span>
              ))}
            </div>
            {files.length > 0 ? (
              <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                Sounds
              </p>
            ) : null}
            {files.map((sound) => (
              <div
                key={sound.id}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-zinc-200"
              >
                <span className="min-w-0 flex-1 truncate">{sound.filename}</span>
                <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                  {sound.format} · {sound.duration}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="h-10">
        <MiniBars seed={30} />
      </div>
    </div>
  );
}

export function AltFlowsFrame() {
  return (
    <>
      <VariantFrame
        id="W-H"
        name="Rail detail"
        note="Browser rail left, inspector dock right. Wash anchored behind the inspector."
      >
        <AltRailDetail />
      </VariantFrame>

      <VariantFrame
        id="W-I"
        name="Stacked cards"
        note="One column, everything inline: expand a card for files and recolor."
      >
        <AltStacked />
      </VariantFrame>

      <VariantFrame
        id="W-J"
        name="Command-bar browser"
        note="Spotlight-style: one input searches collections, tags, and sounds together. Try typing."
      >
        <AltCommandBar />
      </VariantFrame>
    </>
  );
}
