// PROTOTYPE ONLY — the shared scaffold for /prototype/auto-tag-fit redesign
// variants. Reproduces the CURRENT coverage board's structure (tag rail,
// coverage hero + trend chart, all-tags sparklines, latest arrivals) so the
// only thing that differs per variant is the injected flagged sections
// (candidate queue, filename rules, semantic tagging). Pass `compact` to
// tighten every block for a one-viewport layout.

"use client";

import { useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import {
  ARRIVALS,
  COVERAGE_GOAL,
  MEMBERS,
  MEMBER_TOTAL,
  RAIL_ROWS,
  SNAPSHOTS,
  TAGGED_FILES,
  TOTAL_FILES,
  fmt,
  type RailRowData,
} from "./data";

const MONO = "font-mono";
const PANEL = "rounded-xl border border-white/10 bg-white/[0.03]";

function shortLabel(at: string) {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function CoverageTrend({ height }: { height: number }) {
  const livePct = Math.round((TAGGED_FILES / TOTAL_FILES) * 100);
  const points = [
    ...SNAPSHOTS.map((e) => ({ label: shortLabel(e.at), pct: Math.round((e.tagged / e.total) * 100) })),
    { label: "now", pct: livePct },
  ];
  return (
    <ChartContainer config={{ pct: { label: "Coverage", color: "var(--accent-fill)" } }} className="aspect-auto" style={{ height }}>
      <AreaChart data={points} margin={{ top: 12, right: 10, bottom: 20, left: 30 }}>
        <defs>
          <linearGradient id="fitCovFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-fill)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--accent-fill)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={28} />
        <Area type="monotone" dataKey="pct" stroke="var(--accent-fill)" strokeWidth={2} fill="url(#fitCovFill)" />
      </AreaChart>
    </ChartContainer>
  );
}

function TagSpark({ tag, count, active }: { tag: string; count: number; active?: boolean }) {
  const values = [...SNAPSHOTS.map((e) => e.tags[tag] ?? 0), count];
  const data = values.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width={96} height={28}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <ReferenceLine y={COVERAGE_GOAL} stroke="var(--chart-3)" strokeOpacity={0.4} strokeDasharray="2 2" />
        <Line type="monotone" dataKey="value" stroke={active ? "var(--accent-fill)" : "var(--muted-foreground)"} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function RailRow({ row, active, onSelect }: { row: RailRowData; active: boolean; onSelect: () => void }) {
  const pct = Math.min(1, row.count / COVERAGE_GOAL);
  const done = row.count >= COVERAGE_GOAL;
  const empty = row.count === 0;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full flex-col gap-1.5 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/[0.04]",
          active && "bg-accent-fill/10 shadow-[inset_3px_0_0_var(--accent-fill)]",
        )}
      >
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold text-zinc-100">#{row.tag}</span>
          {row.delta > 0 && <span className={cn(MONO, "shrink-0 text-[10px] tabular-nums text-chart-3")}>+{row.delta}</span>}
          <span className={cn(MONO, "shrink-0 text-[12px] tabular-nums", done ? "text-chart-3" : empty ? "text-muted-foreground" : "text-foreground")}>
            {row.count}
            <span className="text-zinc-600">/{COVERAGE_GOAL}</span>
          </span>
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <span className={cn("block h-full rounded-full transition-[width]", done ? "bg-chart-3" : empty ? "bg-transparent" : "bg-accent-fill")} style={{ width: `${pct * 100}%` }} />
        </span>
      </button>
    </li>
  );
}

/**
 * The full current COVERAGE board chrome (rail + coverage + arrivals).
 * Children are the flagged coverage sections, in the real board's order:
 * candidate queue, filename rules, semantic tagging. The origin-filter pills
 * do NOT live here — they're on the Tag origins tab (OriginsScaffold below).
 */
export function BoardScaffold({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const [filter, setFilter] = useState("");
  const [activeTag, setActiveTag] = useState(RAIL_ROWS[0].tag);
  const current = RAIL_ROWS.find((r) => r.tag === activeTag) ?? RAIL_ROWS[0];
  const pct = Math.round((TAGGED_FILES / TOTAL_FILES) * 100);
  const railRows = compact ? RAIL_ROWS.slice(0, 3) : RAIL_ROWS;
  const arrivals = compact ? ARRIVALS.slice(0, 3) : ARRIVALS;
  const missedShown = arrivals.filter((f) => f.missed);
  const landedShown = arrivals.filter((f) => !f.missed);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {/* Grid: rail + coverage + arrivals — exactly the current layout */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_380px]">
        {/* Tag rail */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2.5 border-b border-white/10 px-4">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tags..."
              aria-label="Filter tags"
              className="w-full bg-transparent py-2.5 text-[13px] font-medium text-zinc-50 placeholder:font-normal placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
          <p className={cn(MONO, "border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-500")}>
            Tags · 2/{RAIL_ROWS.length} at goal
          </p>
          <ul>
            {railRows.filter((r) => r.tag.includes(filter.toLowerCase())).map((row) => (
              <RailRow key={row.tag} row={row} active={row.tag === activeTag} onSelect={() => setActiveTag(row.tag)} />
            ))}
          </ul>
        </div>

        {/* Coverage center */}
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03]">
          <div className={cn("grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-8", compact ? "px-5 py-3" : "px-6 py-5")}>
            <div className="shrink-0">
              <p className={cn("font-extrabold tracking-tighter text-zinc-50", compact ? "text-4xl" : "text-6xl")}>
                {pct}
                <span className={cn("font-medium text-zinc-500", compact ? "text-base" : "text-lg")}>%</span>
              </p>
              <p className={cn(MONO, "mt-1 text-[11px] tabular-nums text-zinc-500")}>
                {fmt(TAGGED_FILES)}/{fmt(TOTAL_FILES)} tagged · {fmt(TOTAL_FILES - TAGGED_FILES)} to go
              </p>
            </div>
            <div className="min-w-0">
              <CoverageTrend height={compact ? 70 : 110} />
            </div>
          </div>

          {!compact && (
          <div className="border-t border-white/10 px-6 py-4">
            <p className={cn(MONO, "text-[10px] uppercase tracking-widest text-zinc-500")}>All tags · history vs goal</p>
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {RAIL_ROWS.map((row) => (
                <li key={row.tag}>
                  <button type="button" onClick={() => setActiveTag(row.tag)} className="flex w-full items-center gap-3 rounded-md px-1 py-1 text-left hover:bg-white/[0.04]">
                    <span className={cn("w-24 truncate font-mono text-[12px]", row.tag === activeTag ? "font-bold text-zinc-100" : "text-zinc-400")}>#{row.tag}</span>
                    <TagSpark tag={row.tag} count={row.count} active={row.tag === activeTag} />
                    <span className={cn(MONO, "ml-auto text-[11px] tabular-nums text-zinc-500")}>{row.count}/{COVERAGE_GOAL}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          )}

          <div className={cn("border-t border-white/10", compact ? "px-5 py-3" : "px-6 py-5")}>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className={cn("font-extrabold tracking-tight text-zinc-50", compact ? "text-xl" : "text-2xl")}>#{current.tag}</h2>
              <span className={cn(MONO, "text-[13px] tabular-nums text-zinc-400")}>
                {current.count}
                <span className="text-zinc-600">/{COVERAGE_GOAL}</span>
              </span>
              {current.toks.length > 0 && (
                <span className={cn(MONO, "text-[11px] text-zinc-600")}>from {current.toks.map((t) => `“${t}”`).join(", ")}</span>
              )}
              <span className="flex-1" />
              <TagSpark tag={current.tag} count={current.count} active />
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={cn("h-full rounded-full transition-[width]", current.count >= COVERAGE_GOAL ? "bg-chart-3" : "bg-accent-fill")} style={{ width: `${Math.min(1, current.count / COVERAGE_GOAL) * 100}%` }} />
            </div>
            <div className={cn("border-t border-white/10 pt-3", compact ? "mt-2" : "mt-4")}>
              <p className={cn(MONO, "text-[10px] uppercase tracking-widest text-zinc-500")}>Files · 1–{MEMBERS.length} of {MEMBER_TOTAL}</p>
              <ul className="mt-1.5 space-y-1.5">
                {(compact ? MEMBERS.slice(0, 2) : MEMBERS).map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                    {file.tags.map((tag) => (
                      <Badge key={tag.id} variant={tag.name === current.tag ? "default" : "secondary"} className="flex h-4 items-center gap-1 px-1.5 text-[10px]">
                        #{tag.name}
                      </Badge>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Latest arrivals */}
        <aside className={cn(PANEL, compact ? "px-4 py-3" : "px-5 py-4")}>
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">Latest arrivals</h2>
            <span className="flex-1" />
            <span className={cn(MONO, "text-[11px] tabular-nums text-zinc-500")}>
              {arrivals.length} landed · <span className="text-accent-text">{landedShown.length} tagged</span> · {missedShown.length} missed
            </span>
          </div>
          <div className={cn("grid sm:grid-cols-2 xl:grid-cols-1", compact ? "mt-2 gap-3" : "mt-3 gap-4")}>
            {missedShown.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Missed ({missedShown.length})</p>
                <ul className="mt-1 border-t border-white/10">
                  {missedShown.map((file) => (
                    <li key={file.id} className="flex flex-wrap items-center gap-2.5 gap-y-1 border-b border-white/5 py-2 text-[13px] last:border-0">
                      <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                      <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                      <span className={cn(MONO, "w-full pl-4 text-[11px] text-zinc-600")}>no rule fired</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {landedShown.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Tagged ({landedShown.length})</p>
                <ul className="mt-1 border-t border-white/10">
                  {landedShown.map((file) => (
                    <li key={file.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-white/5 py-2 text-[13px] last:border-0">
                      <span className="size-1.5 shrink-0 rounded-full bg-chart-3" />
                      <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                      <span className="flex shrink-0 gap-1">
                        {file.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="flex h-4 items-center gap-1 px-1.5 text-[10px]">#{tag}</Badge>
                        ))}
                      </span>
                      {file.fired.length > 0 && (
                        <span className={cn(MONO, "w-full pl-4 text-[11px] text-zinc-600")}>fired {file.fired.map((r) => `“${r}”`).join(", ")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </aside>
      </div>

      {/* The flagged coverage sections — injected per variant */}
      {children}
    </div>
  );
}

export type OriginFileRow = {
  id: string;
  filename: string;
  tags: Array<{ id: string; name: string }>;
  fired: Array<{ token: string; tags: string[] }>;
};

/**
 * The full current TAG ORIGINS tab chrome: the left column holds the file
 * list + this tab's own candidate queue (injected per variant as children),
 * the right rail holds Similar + Remove automatic tags exactly as shipped.
 * The filter pills are injected per variant at the top (that's the piece
 * being fixed), followed by the file list.
 */
export function OriginsScaffold({
  filter,
  fileList,
  queue,
}: {
  filter: ReactNode;
  fileList: ReactNode;
  queue: ReactNode;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 space-y-3">
        {filter}
        {fileList}
        {queue}
      </section>

      <aside className="space-y-3">
        <div className={cn(PANEL, "px-5 py-4")}>
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">Similar</h3>
            <span className="flex-1" />
          </div>
          <p className={cn(MONO, "mt-2 text-[11px] text-zinc-600")}>Choose Find Similar on any file.</p>
        </div>
        <div className={cn(PANEL, "px-5 py-4")}>
          <h3 className="text-sm font-semibold text-zinc-100">Remove automatic tags</h3>
          <p className={cn(MONO, "mt-1 text-[11px] text-zinc-600")}>Manual attachments are always preserved.</p>
          <div className="mt-3 flex flex-col gap-2">
            <span className="inline-flex h-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2.5 text-[0.8rem] text-zinc-200">Remove deterministic tags</span>
            <span className="inline-flex h-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2.5 text-[0.8rem] text-zinc-200">Remove semantic AI tags</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
