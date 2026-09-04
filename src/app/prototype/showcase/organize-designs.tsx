"use client";

import { useState } from "react";
import { ChevronRight, ListMusic, Plus } from "lucide-react";

import {
  COLOR_PRESETS,
  DEMO_COLLECTIONS,
  DEMO_TAGS,
  MiniBars,
  VariantFrame,
  tileStyle,
} from "./data";

function PageHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h3 className="text-3xl font-bold tracking-tight text-zinc-50">{title}</h3>
      <p className="mt-1 text-[13px] text-zinc-500">{sub}</p>
    </div>
  );
}

function Swatches({
  value,
  onPick,
}: {
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {COLOR_PRESETS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onPick(color)}
          aria-label={`Pick ${color}`}
          style={{ backgroundColor: color }}
          className={`size-5 rounded-full transition-transform hover:scale-110 ${
            value === color ? "ring-2 ring-white ring-offset-2 ring-offset-black" : "opacity-70 hover:opacity-100"
          }`}
        />
      ))}
    </span>
  );
}

export function OrganizeDesigns() {
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
  const [editing, setEditing] = useState<string | null>("c2");

  return (
    <div className="space-y-4">
      <VariantFrame id="O-A" name="Section rows" note="Tools-style rows: color tile, name, count, chevron. Calm default.">
        <div className="mx-auto w-full max-w-3xl space-y-8">
          <div>
            <PageHeading title="Collections" sub="Named sets of sounds. Pick one to browse it." />
            <div className="mt-4 space-y-2">
              {DEMO_COLLECTIONS.map((collection, i) => (
                <div
                  key={collection.id}
                  className={`group flex items-center gap-4 rounded-2xl border p-4 transition-colors ${
                    i === 0
                      ? "border-accent-fill/50 bg-accent-fill/10"
                      : "border-white/10 bg-white/[0.04] hover:bg-white/[0.06]"
                  }`}
                >
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
                    style={tileStyle(collection.color)}
                  >
                    {collection.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-zinc-100">
                      {collection.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {collection.fileCount} sounds
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-400" />
                </div>
              ))}
            </div>
          </div>
          <div>
            <PageHeading title="Tags" sub="Labels shared across sounds. Pick one to filter." />
            <div className="mt-4 flex flex-wrap gap-2">
              {DEMO_TAGS.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200"
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </VariantFrame>

      <VariantFrame id="O-B" name="Artwork tiles" note="Color-driven tile grid for collections; tag chips below. Boldest direction.">
        <div className="mx-auto w-full max-w-3xl space-y-8">
          <div>
            <PageHeading title="Collections" sub="Every collection gets cover art from its color." />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DEMO_COLLECTIONS.map((collection) => (
                <div key={collection.id} className="group cursor-pointer">
                  <div
                    className="flex h-28 items-end overflow-hidden rounded-2xl border border-white/10 p-3 transition-colors group-hover:border-white/25"
                    style={{
                      background: `linear-gradient(135deg, ${collection.color}38, ${collection.color}0d)`,
                    }}
                  >
                    <span className="text-2xl font-black tracking-tight" style={{ color: collection.color }}>
                      {collection.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-[13px] font-semibold text-zinc-100">
                    {collection.name}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-500">
                    {collection.fileCount} sounds
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <PageHeading title="Tags" sub="Color chips double as filters." />
            <div className="mt-4 flex flex-wrap gap-2">
              {DEMO_TAGS.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </VariantFrame>

      <VariantFrame id="O-C" name="Split browser" note="List left, detail right: files peek, actions, color. Most functional.">
        <div className="mx-auto w-full max-w-4xl">
          <PageHeading title="Collections & tags" sub="Browse on the left, inspect on the right." />
          <div className="mt-4 flex min-h-72 gap-3">
            <div className="w-56 shrink-0 space-y-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-2">
              {DEMO_COLLECTIONS.map((collection, i) => (
                <div
                  key={collection.id}
                  className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs ${
                    i === 0
                      ? "border border-accent-fill/50 bg-accent-fill/15 font-semibold text-accent-text"
                      : "border border-transparent font-medium text-zinc-400"
                  }`}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: collection.color }} />
                  <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                    {collection.fileCount}
                  </span>
                </div>
              ))}
              <p className="px-2.5 pb-1 pt-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                Tags
              </p>
              {DEMO_TAGS.slice(0, 3).map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-xs font-medium text-zinc-400"
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
                  style={tileStyle(DEMO_COLLECTIONS[0].color)}
                >
                  Im
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">Impacts</p>
                  <p className="text-xs text-zinc-500">24 sounds · regular collection</p>
                </div>
                <span className="ml-auto shrink-0 rounded-xl bg-accent-fill px-3.5 py-2 text-xs font-semibold text-white">
                  Open
                </span>
              </div>
              <div className="mt-3 h-10">
                <MiniBars seed={9} />
              </div>
              <div className="mt-3 space-y-1">
                {["Metal Door Slam", "Glass Break Small", "Gravel Footsteps"].map((name) => (
                  <div key={name} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-300">
                    <ListMusic className="size-3.5 shrink-0 text-zinc-600" />
                    <span className="truncate">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </VariantFrame>

      <VariantFrame id="O-D" name="Compact table" note="Densest: color edge bar, counts, overflow menu. Power-user direction.">
        <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          {DEMO_COLLECTIONS.map((collection) => (
            <div
              key={collection.id}
              className="flex cursor-pointer items-center gap-3 border-b border-white/5 px-3 py-2 last:border-0 hover:bg-white/[0.04]"
            >
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: collection.color }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                {collection.name}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                {collection.fileCount}
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                Collection
              </span>
            </div>
          ))}
          {DEMO_TAGS.map((tag) => (
            <div
              key={tag.id}
              className="flex cursor-pointer items-center gap-3 border-b border-white/5 px-3 py-2 last:border-0 hover:bg-white/[0.04]"
            >
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                {tag.name}
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                Tag
              </span>
            </div>
          ))}
        </div>
      </VariantFrame>

      <VariantFrame id="O-E" name="Color studio" note="EXACT picker proposal: tap a row, swatches appear inline. Try it.">
        <div className="mx-auto w-full max-w-3xl space-y-8">
          <div>
            <PageHeading title="Collections" sub="Tap a row to recolor it. Changes save on pick." />
            <div className="mt-4 space-y-2">
              {DEMO_COLLECTIONS.map((collection) => {
                const color = collectionColors[collection.id] ?? collection.color;
                const open = editing === collection.id;
                return (
                  <div
                    key={collection.id}
                    className={`rounded-2xl border p-3 transition-colors ${
                      open ? "border-accent-fill/50 bg-accent-fill/[0.07]" : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setEditing(open ? null : collection.id)}
                      className="flex w-full items-center gap-3 text-left"
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
                          {color} · tap to recolor
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                        {collection.fileCount}
                      </span>
                    </button>
                    {open ? (
                      <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
                        <Swatches
                          value={color}
                          onPick={(next) =>
                            setCollectionColors((prev) => ({ ...prev, [collection.id]: next }))
                          }
                        />
                        {collectionColors[collection.id] !== collection.color ? (
                          <button
                            type="button"
                            onClick={() =>
                              setCollectionColors((prev) => {
                                const next = { ...prev };
                                delete next[collection.id];
                                return next;
                              })
                            }
                            className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-200"
                          >
                            Reset
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <PageHeading title="Tags" sub="Same picker, chip form." />
            <div className="mt-4 space-y-2">
              {DEMO_TAGS.map((tag) => {
                const color = tagColors[tag.id] ?? tag.color;
                const open = editing === tag.id;
                return (
                  <div
                    key={tag.id}
                    className={`rounded-2xl border p-3 transition-colors ${
                      open ? "border-accent-fill/50 bg-accent-fill/[0.07]" : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setEditing(open ? null : tag.id)}
                      className="flex w-full items-center gap-2.5 text-left"
                    >
                      <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                        {tag.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                        {color}
                      </span>
                    </button>
                    {open ? (
                      <div className="mt-3 border-t border-white/5 pt-3">
                        <Swatches
                          value={color}
                          onPick={(next) => setTagColors((prev) => ({ ...prev, [tag.id]: next }))}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-xs text-zinc-500">
              <Plus className="size-3.5 shrink-0" />
              New collection or tag inherits the accent until recolored.
            </div>
          </div>
        </div>
      </VariantFrame>
    </div>
  );
}
