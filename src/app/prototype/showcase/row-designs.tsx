"use client";

import { Heart, Pause, Play } from "lucide-react";

import { DEMO_SOUNDS, MiniBars, VariantFrame, type DemoSound } from "./data";

function RowHeart({ active = false }: { active?: boolean }) {
  return (
    <span className="flex justify-center">
      <Heart
        className={`size-4 transition-colors ${active ? "fill-accent-fill text-accent-fill" : "text-zinc-600"}`}
      />
    </span>
  );
}

function RowMeta({ sound }: { sound: DemoSound }) {
  return (
    <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-400">
      {sound.format} · {sound.tags.join(" · ")}
    </span>
  );
}

function ColumnHeaders() {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)_140px_64px_28px] items-center gap-3 border-b border-white/10 px-3 pb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
      <span />
      <span className="text-left">Name ↑</span>
      <span className="hidden sm:block">Wave</span>
      <span className="text-right">Time</span>
      <span />
    </div>
  );
}

export function RowDesigns() {
  const grouped = ["wav", "mp3", "flac"].map((format) => ({
    format,
    sounds: DEMO_SOUNDS.filter((sound) => sound.format === format),
  }));

  return (
    <div className="space-y-4">
      <VariantFrame id="R-A" name="Prototype grid" note="Baseline: play glyph, name + mono meta, mini wave, time, heart.">
        <ColumnHeaders />
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          {DEMO_SOUNDS.slice(0, 5).map((sound, i) => (
            <div
              key={sound.id}
              className={`relative grid cursor-pointer grid-cols-[32px_minmax(0,1fr)_140px_64px_28px] items-center gap-3 border-b border-white/5 px-3 outline-none last:border-0 ${
                i === 2 ? "bg-accent-fill/10" : "hover:bg-white/[0.04]"
              }`}
              style={{ height: "64px" }}
            >
              {i === 2 ? (
                <span className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent-fill shadow-glow-accent" />
              ) : null}
              <span className={`flex justify-center ${i === 2 ? "text-accent-text" : "text-zinc-500"}`}>
                {i === 2 ? <Pause className="size-4" /> : <Play className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-[15px] font-medium ${i === 2 ? "font-semibold text-zinc-50" : "text-zinc-100"}`}>
                  {sound.filename}
                </span>
                <RowMeta sound={sound} />
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block h-[34px]">
                  <MiniBars seed={i + 1} active={i === 2} />
                </span>
              </span>
              <span className="text-right font-mono text-xs font-medium tabular-nums text-zinc-300">
                {sound.duration}
              </span>
              <RowHeart active={i === 4} />
            </div>
          ))}
        </div>
      </VariantFrame>

      <VariantFrame id="R-B" name="Separated cards" note="Each sound is its own card; bigger wave, duration badge, roomier touch targets.">
        <div className="space-y-2">
          {DEMO_SOUNDS.slice(0, 4).map((sound, i) => (
            <div
              key={sound.id}
              className={`flex items-center gap-4 rounded-2xl border p-3 transition-colors ${
                i === 1
                  ? "border-accent-fill/50 bg-accent-fill/10"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
              }`}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-fill text-white shadow-glow-accent-strong">
                {i === 1 ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-zinc-50">
                  {sound.filename}
                </span>
                <span className="mt-1 block h-6">
                  <MiniBars seed={i + 2} active={i === 1} />
                </span>
              </span>
              <span className="hidden shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] tabular-nums text-zinc-300 sm:block">
                {sound.duration}
              </span>
              <RowHeart active={i === 3} />
            </div>
          ))}
        </div>
      </VariantFrame>

      <VariantFrame id="R-C" name="Compact table" note="Densest: no waves, small type, meta inline. Most rows per screen.">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          {DEMO_SOUNDS.slice(0, 6).map((sound, i) => (
            <div
              key={sound.id}
              className={`flex cursor-pointer items-center gap-3 border-b border-white/5 px-3 py-1.5 last:border-0 ${
                i === 0 ? "bg-accent-fill/10" : "hover:bg-white/[0.04]"
              }`}
            >
              <Play className="size-3.5 shrink-0 text-zinc-500" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-100">
                {sound.filename}
                <span className="ml-2 font-mono text-[10px] font-normal text-zinc-500">
                  {sound.format} · {sound.tags[0]}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
                {sound.duration}
              </span>
              <RowHeart active={i === 5} />
            </div>
          ))}
        </div>
      </VariantFrame>

      <VariantFrame id="R-D" name="Artwork tiles" note="Album-grid direction: generated gradient art per file, name below.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DEMO_SOUNDS.slice(0, 6).map((sound, i) => (
            <div key={sound.id} className="group cursor-pointer">
              <div
                className="relative flex h-28 items-center justify-center overflow-hidden rounded-2xl border border-white/10 transition-colors group-hover:border-accent-fill/50"
                style={{
                  background: `linear-gradient(135deg, hsl(${(i * 67) % 360} 45% 14%), hsl(${((i * 67) + 60) % 360} 50% 8%))`,
                }}
              >
                <span className="w-3/4 opacity-70">
                  <span className="block h-10">
                    <MiniBars seed={i + 5} />
                  </span>
                </span>
                <span className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full bg-accent-fill text-white opacity-0 shadow-glow-accent-strong transition-opacity group-hover:opacity-100">
                  <Play className="ml-0.5 size-3.5" />
                </span>
              </div>
              <p className="mt-1.5 truncate text-[13px] font-semibold text-zinc-100">{sound.filename}</p>
              <p className="truncate font-mono text-[10px] text-zinc-500">
                {sound.format} · {sound.duration}
              </p>
            </div>
          ))}
        </div>
      </VariantFrame>

      <VariantFrame id="R-E" name="Grouped sections" note="Sticky format headers split one list into browsable chunks.">
        <div className="max-h-80 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03]">
          {grouped.map((group) =>
            group.sounds.length > 0 ? (
              <div key={group.format}>
                <p className="sticky top-0 border-b border-white/10 bg-shell/95 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-400 backdrop-blur-xl">
                  {group.format} · {group.sounds.length}
                </p>
                {group.sounds.map((sound) => (
                  <div
                    key={sound.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-white/5 px-3 py-2.5 last:border-0 hover:bg-white/[0.04]"
                  >
                    <Play className="size-4 shrink-0 text-zinc-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-100">
                        {sound.filename}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-zinc-500">
                        {sound.tags.join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-300">
                      {sound.duration}
                    </span>
                    <RowHeart />
                  </div>
                ))}
              </div>
            ) : null,
          )}
        </div>
      </VariantFrame>
    </div>
  );
}
