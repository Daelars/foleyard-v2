"use client";

import { useState } from "react";
import { ListMusic } from "lucide-react";

import {
  DEMO_COLLECTIONS,
  DEMO_TAGS,
  MiniBars,
  VariantFrame,
  tileStyle,
} from "../showcase/data";
import { Swatches, tintStyle } from "./shared";

type Selection = { kind: "collection" | "tag"; id: string };

const DETAIL_FILES = ["Metal Door Slam", "Glass Break Small", "Gravel Footsteps"];

function useFlowState() {
  const [selection, setSelection] = useState<Selection>({ kind: "collection", id: "c2" });
  const [collectionColors, setCollectionColors] = useState<Record<string, string>>({
    c1: "#f0503c",
    c2: "#7ab8ff",
    c3: "#9adc6e",
    c4: "#d3a6ff",
  });
  const [tagColors, setTagColors] = useState<Record<string, string>>({
    t1: "#f0503c",
    t2: "#7ab8ff",
    t3: "#9adc6e",
    t4: "#d3a6ff",
    t5: "#e8c468",
  });
  return { selection, setSelection, collectionColors, setCollectionColors, tagColors, setTagColors };
}

function selectedMeta(selection: Selection) {
  if (selection.kind === "collection") {
    const collection = DEMO_COLLECTIONS.find((c) => c.id === selection.id) ?? DEMO_COLLECTIONS[0];
    return {
      name: collection.name,
      sub: `${collection.fileCount} sounds · regular collection`,
      initials: collection.name.slice(0, 2),
      action: "Open",
    };
  }
  const tag = DEMO_TAGS.find((t) => t.id === selection.id) ?? DEMO_TAGS[0];
  return {
    name: tag.name,
    sub: "Tag · filters the library",
    initials: tag.name.slice(0, 2),
    action: "Filter library",
  };
}

function FlowDetail({
  selection,
  color,
  onPickColor,
}: {
  selection: Selection;
  color: string;
  onPickColor: (color: string) => void;
}) {
  const meta = selectedMeta(selection);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div
        className="flex items-center gap-3 border-b border-white/5 p-4"
        style={{
          backgroundColor: `${color}0a`,
          backgroundImage: `radial-gradient(circle at 10% 50%, ${color}38, transparent 70%)`,
        }}
      >
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
          style={tileStyle(color)}
        >
          {meta.initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-100">{meta.name}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{meta.sub}</p>
        </div>
        <span className="shrink-0 rounded-xl bg-accent-fill px-3.5 py-2 text-xs font-semibold text-white">
          {meta.action}
        </span>
      </div>
      <div className="space-y-1 p-2">
        {DETAIL_FILES.map((name) => (
          <div key={name} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-300">
            <ListMusic className="size-3.5 shrink-0 text-zinc-600" />
            <span className="truncate">{name}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-white/5 p-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Color</span>
        <Swatches value={color} onPick={onPickColor} />
      </div>
    </div>
  );
}

function FlowARows({
  selection,
  setSelection,
  collectionColors,
}: ReturnType<typeof useFlowState>) {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Collections
        </p>
        <div className="mt-1.5 space-y-1.5">
          {DEMO_COLLECTIONS.map((collection) => {
            const color = collectionColors[collection.id] ?? collection.color;
            const active = selection.kind === "collection" && selection.id === collection.id;
            return (
              <button
                key={collection.id}
                type="button"
                onClick={() => setSelection({ kind: "collection", id: collection.id })}
                style={active ? tintStyle(color) : undefined}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                  active ? "border" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                }`}
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                  style={tileStyle(color)}
                >
                  {collection.name.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-zinc-100">
                    {collection.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    {color} · tap to open
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                  {collection.fileCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Tags
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {DEMO_TAGS.map((tag) => {
            const active = selection.kind === "tag" && selection.id === tag.id;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => setSelection({ kind: "tag", id: tag.id })}
                style={active ? tintStyle(tag.color) : undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active ? "border" : "border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.06]"
                }`}
              >
                <span className="size-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FlowA() {
  const flow = useFlowState();
  const { selection, collectionColors, setCollectionColors, tagColors, setTagColors } = flow;
  const color =
    selection.kind === "collection"
      ? (collectionColors[selection.id] ?? "#f0503c")
      : (tagColors[selection.id] ?? "#f0503c");
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <FlowARows {...flow} />
      <div className="lg:sticky lg:top-0 lg:self-start">
        <FlowDetail
          selection={selection}
          color={color}
          onPickColor={(next) => {
            if (selection.kind === "collection") {
              setCollectionColors((prev) => ({ ...prev, [selection.id]: next }));
            } else {
              setTagColors((prev) => ({ ...prev, [selection.id]: next }));
            }
          }}
        />
      </div>
    </div>
  );
}

function FlowB() {
  const flow = useFlowState();
  const { selection, setSelection, collectionColors, setCollectionColors } = flow;
  const selectedCollection =
    selection.kind === "collection"
      ? (DEMO_COLLECTIONS.find((c) => c.id === selection.id) ?? DEMO_COLLECTIONS[0])
      : null;
  const color = selectedCollection
    ? (collectionColors[selectedCollection.id] ?? selectedCollection.color)
    : "#f0503c";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {DEMO_COLLECTIONS.map((collection) => {
          const tileColor = collectionColors[collection.id] ?? collection.color;
          const active = selection.kind === "collection" && selection.id === collection.id;
          return (
            <button key={collection.id} type="button" onClick={() => setSelection({ kind: "collection", id: collection.id })} className="group text-left">
              <div
                className="flex h-24 items-end overflow-hidden rounded-2xl border p-3 transition-colors"
                style={
                  active
                    ? tintStyle(tileColor)
                    : { borderColor: "rgba(255,255,255,0.1)", background: `linear-gradient(135deg, ${tileColor}30, ${tileColor}0d)` }
                }
              >
                <span className="text-xl font-black tracking-tight" style={{ color: tileColor }}>
                  {collection.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <p className="mt-1.5 truncate text-[13px] font-semibold text-zinc-100">{collection.name}</p>
              <p className="font-mono text-[10px] text-zinc-500">{collection.fileCount} sounds</p>
            </button>
          );
        })}
      </div>
      {selectedCollection ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <div
            className="h-16"
            style={{
              backgroundColor: `${color}0a`,
              backgroundImage: `radial-gradient(circle at 12% 50%, ${color}40, transparent 70%)`,
            }}
          />
          <div className="-mt-8 space-y-1 p-3">
            {DETAIL_FILES.map((name) => (
              <div key={name} className="flex items-center gap-2 rounded-lg bg-black/30 px-2 py-1.5 text-xs text-zinc-300 backdrop-blur">
                <ListMusic className="size-3.5 shrink-0 text-zinc-500" />
                <span className="truncate">{name}</span>
              </div>
            ))}
            <div className="flex items-center gap-3 px-1 pt-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Color</span>
              <Swatches
                value={color}
                onPick={(next) => setCollectionColors((prev) => ({ ...prev, [selectedCollection.id]: next }))}
              />
              <span className="ml-auto shrink-0 rounded-xl bg-accent-fill px-3.5 py-2 text-xs font-semibold text-white">
                Open
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FlowC() {
  const flow = useFlowState();
  const { selection, setSelection, collectionColors, setCollectionColors, tagColors, setTagColors } = flow;
  const color =
    selection.kind === "collection"
      ? (collectionColors[selection.id] ?? "#f0503c")
      : (tagColors[selection.id] ?? "#f0503c");
  return (
    <div className="flex min-h-80 flex-col gap-3 sm:flex-row">
      <div className="w-full shrink-0 space-y-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-2 sm:w-60">
        {DEMO_COLLECTIONS.map((collection) => {
          const tileColor = collectionColors[collection.id] ?? collection.color;
          const active = selection.kind === "collection" && selection.id === collection.id;
          return (
            <button
              key={collection.id}
              type="button"
              onClick={() => setSelection({ kind: "collection", id: collection.id })}
              style={active ? tintStyle(tileColor) : undefined}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-xs transition-colors ${
                active ? "border font-semibold text-zinc-100" : "border-transparent font-medium text-zinc-400 hover:bg-white/5"
              }`}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tileColor }} />
              <span className="min-w-0 flex-1 truncate">{collection.name}</span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                {collection.fileCount}
              </span>
            </button>
          );
        })}
        <p className="px-2.5 pb-1 pt-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          Tags
        </p>
        {DEMO_TAGS.map((tag) => {
          const tileColor = tagColors[tag.id] ?? tag.color;
          const active = selection.kind === "tag" && selection.id === tag.id;
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => setSelection({ kind: "tag", id: tag.id })}
              style={active ? tintStyle(tileColor) : undefined}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-xs transition-colors ${
                active ? "border font-semibold text-zinc-100" : "border-transparent font-medium text-zinc-400 hover:bg-white/5"
              }`}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tileColor }} />
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
            </button>
          );
        })}
      </div>
      <div className="min-w-0 flex-1">
        <FlowDetail
          selection={selection}
          color={color}
          onPickColor={(next) => {
            if (selection.kind === "collection") {
              setCollectionColors((prev) => ({ ...prev, [selection.id]: next }));
            } else {
              setTagColors((prev) => ({ ...prev, [selection.id]: next }));
            }
          }}
        />
        <div className="mt-3 h-10 opacity-80">
          <MiniBars seed={21} />
        </div>
      </div>
    </div>
  );
}

export function OrganizeFlows() {
  return (
    <div className="space-y-4">
      <VariantFrame
        id="W-A"
        name="Rows into detail"
        note="Full flow: section rows select in their own color, detail follows. Try rows, tags, swatches."
      >
        <FlowA />
      </VariantFrame>

      <VariantFrame id="W-B" name="Tiles into sheet" note="Full flow: artwork grid opens an inline sheet. Try tiles and swatches.">
        <FlowB />
      </VariantFrame>

      <VariantFrame id="W-C" name="Split browser, color-led" note="Full flow: browser list plus detail, active item wears its color.">
        <FlowC />
      </VariantFrame>
    </div>
  );
}
