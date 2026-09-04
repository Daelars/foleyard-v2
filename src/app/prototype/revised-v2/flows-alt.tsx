"use client";

import { useState } from "react";
import { ChevronDown, ListMusic, Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";

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

      <VariantFrame
        id="W-K"
        name="Color fields"
        note="No browser, no inspector: collections are full-bleed color fields that open in place. Tags dim the rest."
      >
        <AltColorFields />
      </VariantFrame>
    </>
  );
}

const FIELD_TAGS: Record<string, string[]> = {
  c1: ["t1", "t5"],
  c2: ["t2", "t4"],
  c3: ["t3", "t4"],
  c4: ["t1", "t5"],
};

const FIELD_FILES = ["Metal Door Slam", "Glass Break Small", "Gravel Footsteps"];

export function AltColorFields() {
  const [expanded, setExpanded] = useState<string | null>("c2");
  const [colors, setColors] = useState<Record<string, string>>({});
  const [collections, setCollections] = useState(DEMO_COLLECTIONS);
  const [fieldTags, setFieldTags] = useState<Record<string, string[]>>(FIELD_TAGS);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tags, setTags] = useState(DEMO_TAGS);
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [showComposer, setShowComposer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#f0503c");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showTagComposer, setShowTagComposer] = useState(false);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#7ab8ff");
  const [tagDraft, setTagDraft] = useState("");
  const [confirmTagDelete, setConfirmTagDelete] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);

  const colorFor = (id: string, fallback: string) => colors[id] ?? fallback;
  const tagColorFor = (id: string, fallback: string) => tagColors[id] ?? fallback;

  const createCollection = () => {
    const name = newName.trim();
    if (!name) {
      return;
    }
    const id = `c${Date.now()}`;
    setCollections((prev) => [...prev, { id, name, fileCount: 0, color: newColor }]);
    setFieldTags((prev) => ({ ...prev, [id]: [] }));
    setNewName("");
    setNewColor("#f0503c");
    setShowComposer(false);
    setExpanded(id);
  };

  const commitRename = () => {
    const name = renameDraft.trim();
    if (renamingId && name) {
      setCollections((prev) => prev.map((c) => (c.id === renamingId ? { ...c, name } : c)));
    }
    setRenamingId(null);
  };

  const deleteCollection = (id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
    if (expanded === id) {
      setExpanded(null);
    }
    setConfirmDeleteId(null);
  };

  const createTag = () => {
    const name = tagName.trim().toLowerCase();
    if (!name) {
      return;
    }
    const id = `t${Date.now()}`;
    setTags((prev) => [...prev, { id, name, color: tagColor }]);
    setTagName("");
    setTagColor("#7ab8ff");
    setShowTagComposer(false);
    setActiveTag(id);
    setEditingTag(id);
    setTagDraft(name);
    setConfirmTagDelete(false);
  };

  const pickTag = (id: string | null) => {
    setActiveTag(id);
    setEditingTag(null);
    setConfirmTagDelete(false);
  };

  const openTagEditor = (id: string) => {
    const tag = tags.find((t) => t.id === id);
    setEditingTag(id);
    setTagDraft(tag?.name ?? "");
    setConfirmTagDelete(false);
  };

  const commitTagRename = () => {
    const name = tagDraft.trim().toLowerCase();
    if (editingTag && name) {
      setTags((prev) => prev.map((t) => (t.id === editingTag ? { ...t, name } : t)));
    }
  };

  const deleteTag = () => {
    if (!editingTag) {
      return;
    }
    const id = editingTag;
    setTags((prev) => prev.filter((t) => t.id !== id));
    if (activeTag === id) {
      setActiveTag(null);
    }
    setEditingTag(null);
    setConfirmTagDelete(false);
  };

  return (
    <div>
      <style>{`@keyframes field-rise {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .field-rise { animation: field-rise 0.35s cubic-bezier(0.22, 1, 0.36, 1) both; }`}</style>

      <div className="flex items-center gap-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Tags
        </p>
          <button
            type="button"
            onClick={() => {
              setShowTagComposer((show) => !show);
              setEditingTag(null);
            }}
            aria-label="New tag"
          className="flex size-5 items-center justify-center rounded-full border border-dashed border-white/20 text-zinc-500 transition-all hover:border-accent-fill/60 hover:text-accent-text active:scale-90"
        >
          <Plus className="size-3" />
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
        {tags.map((tag) => {
          const color = tagColorFor(tag.id, tag.color);
          const active = activeTag === tag.id;
          if (editingTag === tag.id) {
            return (
              <span
                key={tag.id}
                className="field-rise w-full max-w-md rounded-2xl border border-accent-fill/50 bg-accent-fill/[0.07] p-2"
              >
                <span className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <input
                    autoFocus
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onBlur={commitTagRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        setEditingTag(null);
                      }
                      if (event.key === "Escape") {
                        setTagDraft(tag.name);
                        setEditingTag(null);
                      }
                    }}
                    aria-label="Rename tag"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs font-semibold text-zinc-100 focus:border-accent-fill/60 focus:outline-none"
                  />
                  {confirmTagDelete ? (
                    <>
                      <button
                        type="button"
                        onClick={deleteTag}
                        className="shrink-0 rounded-lg bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive transition-all hover:bg-destructive/25 active:scale-95"
                      >
                        Sure?
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmTagDelete(false)}
                        aria-label="Cancel delete"
                        className="flex size-6 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
                      >
                        <X className="size-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmTagDelete(true)}
                        aria-label={`Delete tag ${tag.name}`}
                        className="flex size-6 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-all hover:bg-destructive/10 hover:text-destructive active:scale-90"
                      >
                        <Trash2 className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTag(null)}
                        aria-label="Done editing"
                        className="flex size-6 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-100"
                      >
                        <X className="size-3" />
                      </button>
                    </>
                  )}
                </span>
                <span className="mt-1.5 flex items-center gap-2 px-1 pb-0.5">
                  <Swatches
                    value={color}
                    onPick={(next) => setTagColors((prev) => ({ ...prev, [tag.id]: next }))}
                  />
                </span>
              </span>
            );
          }
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => pickTag(active ? null : tag.id)}
              onDoubleClick={() => openTagEditor(tag.id)}
              title="Click to filter · double-click to edit"
              style={active ? { borderColor: `${color}80`, backgroundColor: `${color}14` } : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                active ? "border" : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.06]"
              }`}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
              {tag.name}
            </button>
          );
        })}
      </div>

      {showTagComposer ? (
        <div className="field-rise mt-2 rounded-2xl border border-dashed border-white/20 p-3">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={tagName}
              onChange={(event) => setTagName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  createTag();
                }
                if (event.key === "Escape") {
                  setShowTagComposer(false);
                }
              }}
              placeholder="Tag name…"
              aria-label="New tag name"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-accent-fill/60 focus:outline-none"
            />
            <Swatches value={tagColor} onPick={setTagColor} />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowTagComposer(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createTag}
              disabled={!tagName.trim()}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: tagColor }}
            >
              Add tag
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {collections.map((collection, i) => {
          const color = colorFor(collection.id, collection.color);
          const open = expanded === collection.id;
          const dimmed = activeTag !== null && !(fieldTags[collection.id] ?? []).includes(activeTag);
          const renaming = renamingId === collection.id;
          const confirming = confirmDeleteId === collection.id;
          return (
            <div
              key={collection.id}
              style={{
                backgroundColor: `${color}0d`,
                backgroundImage: `linear-gradient(100deg, ${color}30, transparent 65%)`,
                opacity: dimmed ? 0.35 : 1,
                animationDelay: `${Math.min(i, 8) * 45}ms`,
              }}
              className="field-rise relative overflow-hidden rounded-2xl border border-white/10 transition-all duration-300"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-2 -top-6 select-none text-[92px] font-black leading-none tracking-tighter transition-colors duration-300"
                style={{ color: `${color}26` }}
              >
                {collection.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="relative flex w-full items-center gap-3 p-4">
              <button
                type="button"
                onClick={() => {
                  setExpanded(open ? null : collection.id);
                  setEditingTag(null);
                  setConfirmDeleteId(null);
                }}
                aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left transition-transform active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    {renaming ? (
                      <span
                        className="block"
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        commitTagRename();
                        setEditingTag(null);
                      }
                      if (event.key === "Escape") {
                        setEditingTag(null);
                      }
                    }}
                    aria-label="Rename tag — Enter saves, Escape cancels"
                          aria-label="Rename collection"
                          className="w-full rounded-lg border border-accent-fill/60 bg-black/40 px-2 py-1 text-base font-bold tracking-tight text-zinc-50 focus:outline-none"
                        />
                      </span>
                    ) : (
                      <>
                        <span className="block truncate text-base font-bold tracking-tight text-zinc-50">
                          {collection.name}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                          {collection.fileCount} sounds
                        </span>
                      </>
                    )}
                  </span>
                  <ChevronDown
                    className={`size-4 shrink-0 text-zinc-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
              <div
                className={`relative grid transition-all duration-300 ease-out ${
                  open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-4 pb-3">
                    {confirming ? (
                      <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-200">
                          Delete “{collection.name}”? Files stay on disk.
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteCollection(collection.id)}
                          className="shrink-0 rounded-lg bg-destructive/20 px-3 py-1.5 text-xs font-semibold text-destructive transition-all hover:bg-destructive/30 active:scale-95"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100"
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <div
                        className="rounded-xl bg-black/60 px-2 py-1 backdrop-blur-md"
                        style={{
                          WebkitMaskImage:
                            "radial-gradient(100% 100% at 50% 50%, black 38%, transparent 98%)",
                          maskImage:
                            "radial-gradient(100% 100% at 50% 50%, black 38%, transparent 98%)",
                        }}
                      >
                        {FIELD_FILES.map((file) => (
                          <div
                            key={file}
                            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-100"
                          >
                            <ListMusic className="size-3.5 shrink-0 text-zinc-500" />
                            <span className="truncate">{file}</span>
                          </div>
                        ))}
                        <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
                          <Swatches
                            value={color}
                            onPick={(next) => setColors((prev) => ({ ...prev, [collection.id]: next }))}
                          />
                          <span className="flex-1" />
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(collection.id);
                              setRenameDraft(collection.name);
                            }}
                            aria-label={`Rename ${collection.name}`}
                            className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-white/5 hover:text-zinc-100 active:scale-90"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(collection.id)}
                            aria-label={`Delete ${collection.name}`}
                            className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-destructive/10 hover:text-destructive active:scale-90"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                          <span
                            className="shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition-transform active:scale-95"
                            style={themeButtonStyle(color)}
                          >
                            Open
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showComposer ? (
        <div className="field-rise mt-2 rounded-2xl border border-dashed border-white/20 p-4">
          <div className="flex items-center gap-3">
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  createCollection();
                }
                if (event.key === "Escape") {
                  setShowComposer(false);
                }
              }}
              placeholder="Collection name…"
              aria-label="New collection name"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-semibold text-zinc-100 placeholder:font-normal placeholder:text-zinc-600 focus:border-accent-fill/60 focus:outline-none"
            />
            <Swatches value={newColor} onPick={setNewColor} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowComposer(false)}
              className="rounded-xl px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createCollection}
              disabled={!newName.trim()}
              className="rounded-xl px-4 py-2 text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
              style={themeButtonStyle(newColor)}
            >
              Create collection
            </button>
          </div>
        </div>
      ) : (
          <button
            type="button"
            onClick={() => {
              setNewName("");
              setNewColor("#f0503c");
              setShowComposer(true);
              setEditingTag(null);
            }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-3 text-xs font-semibold text-zinc-500 transition-all hover:border-accent-fill/50 hover:text-accent-text active:scale-[0.99]"
        >
          <Plus className="size-3.5" /> New collection
        </button>
      )}
    </div>
  );
}
