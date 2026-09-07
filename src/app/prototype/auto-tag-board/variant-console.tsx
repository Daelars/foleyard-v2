// PROTOTYPE ONLY — console. Tag rail left, content column right.
"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ARRIVAL_BATCH,
  COVERAGE_GOAL,
  SCANS,
  filenameMatchesToken,
  mockTagHistory,
} from "../auto-tag/data";
import type { MockFile, TagRule } from "../auto-tag/data";
import { cn } from "@/lib/utils";

const MONO = "font-mono";

// Mock per-scan totals. Fake numbers standing in for series the host would persist.
const TAGGED_HISTORY = [2, 3, 3, 5, 5, 6];
const INDEXED_HISTORY = [7, 8, 9, 11, 11, 11];

/** One row per distinct tag across all rules. */
type TagRow = {
  tag: string;
  count: number;
  toks: string[];
  delta: number;
};

function buildTagRows(files: MockFile[], rules: TagRule[]): TagRow[] {
  const byTag = new Map<string, { toks: Set<string>; count: number }>();
  for (const rule of rules) {
    for (const tag of rule.tags) {
      const entry = byTag.get(tag) ?? { toks: new Set<string>(), count: 0 };
      entry.toks.add(rule.tok);
      byTag.set(tag, entry);
    }
  }
  for (const file of files) {
    for (const tag of file.tags) {
      const entry = byTag.get(tag);
      if (entry) entry.count += 1;
      else byTag.set(tag, { toks: new Set(), count: 1 });
    }
  }
  return [...byTag.entries()]
    .map(([tag, { toks, count }]) => {
      const history = mockTagHistory(toks.values().next().value ?? tag, count);
      const delta = history.length > 1 ? history[history.length - 1] - history[history.length - 2] : 0;
      return { tag, count, toks: [...toks], delta };
    })
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function RailRow({ row, active, onSelect }: { row: TagRow; active: boolean; onSelect: () => void }) {
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
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold text-zinc-100">
            #{row.tag}
          </span>
          {row.delta > 0 && (
            <span className={cn(MONO, "shrink-0 text-[10px] tabular-nums text-emerald-400")}>
              +{row.delta}
            </span>
          )}
          <span
            className={cn(
              MONO,
              "shrink-0 text-[12px] tabular-nums",
              done ? "text-emerald-400" : empty ? "text-zinc-600" : "text-zinc-300",
            )}
          >
            {row.count}
            <span className="text-zinc-600">/{COVERAGE_GOAL}</span>
          </span>
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <span
            className={cn(
              "block h-full rounded-full transition-[width]",
              done ? "bg-emerald-400" : empty ? "bg-transparent" : "bg-accent-fill",
            )}
            style={{ width: `${pct * 100}%` }}
          />
        </span>
      </button>
    </li>
  );
}

/** Percent coverage over scans. Single line, y is 0–100. */
function CoverageTrend({ files, extraTotals }: { files: MockFile[]; extraTotals: number[] }) {
  const indexed = [...INDEXED_HISTORY, ...extraTotals.map(() => files.length)];
  const tagged = [...TAGGED_HISTORY, ...extraTotals];
  const pcts = tagged.map((v, i) => Math.round((v / Math.max(indexed[i], 1)) * 100));

  const W = 560;
  const H = 110;
  const PAD_L = 30;
  const PAD_R = 10;
  const PAD_B = 20;
  const PAD_T = 12;
  const x = (i: number) => PAD_L + (i * (W - PAD_L - PAD_R)) / Math.max(pcts.length - 1, 1);
  const y = (v: number) => PAD_T + (1 - v / 100) * (H - PAD_T - PAD_B);
  const line = pcts.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${PAD_L},${y(0)} ${line} ${x(pcts.length - 1)},${y(0)}`;
  const labels = SCANS.slice(0, pcts.length);
  const lastPct = pcts[pcts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Library tag coverage over scans, now at ${lastPct} percent`}
    >
      <defs>
        <linearGradient id="covFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-fill)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--accent-fill)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((t) => (
        <g key={t}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={y(t)}
            y2={y(t)}
            stroke={t === 100 ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.08)"}
            strokeWidth="1"
            strokeDasharray={t === 100 ? "3 3" : undefined}
          />
          <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" fontSize="9" className="fill-zinc-600 font-mono">
            {t}%
          </text>
        </g>
      ))}
      <polygon points={area} fill="url(#covFill)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--accent-fill)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pcts.map((v, i) => (
        <g key={labels[i]}>
          <circle
            cx={x(i)}
            cy={y(v)}
            r={i === pcts.length - 1 ? 4 : 2.5}
            fill="var(--accent-fill)"
            stroke="#0b0b10"
            strokeWidth="1.5"
          />
          <text x={x(i)} y={H - 4} textAnchor="middle" fontSize="9" className="fill-zinc-600 font-mono">
            {labels[i]}
          </text>
        </g>
      ))}
      <text
        x={x(pcts.length - 1)}
        y={y(lastPct) - 10}
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        className="fill-zinc-100 font-mono"
      >
        {lastPct}%
      </text>
    </svg>
  );
}

/** Tiny history sparkline for a tag, scaled to COVERAGE_GOAL so tags are comparable. */
function TagSpark({ tag, count, active }: { tag: string; count: number; active: boolean }) {
  const values = mockTagHistory(tag, count);
  const W = 96;
  const H = 28;
  const yMax = Math.max(COVERAGE_GOAL, ...values);
  const x = (i: number) => (i * (W - 4)) / Math.max(values.length - 1, 1) + 2;
  const y = (v: number) => 2 + (1 - v / yMax) * (H - 4);
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-24" aria-hidden="true">
      <line x1="2" x2={W - 2} y1={y(COVERAGE_GOAL)} y2={y(COVERAGE_GOAL)} stroke="rgba(52,211,153,0.4)" strokeDasharray="2 2" />
      <polyline
        points={line}
        fill="none"
        stroke={active ? "var(--accent-fill)" : "#52525b"}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2" fill={active ? "var(--accent-fill)" : "#71717a"} />
    </svg>
  );
}

export function ArrivalsColumn({ files, rules }: { files: MockFile[]; rules: TagRule[] }) {
  const arrivalIds = new Set(ARRIVAL_BATCH.map((file) => file.id));
  const arrivals = files.filter((file) => arrivalIds.has(file.id));
  if (arrivals.length === 0) return null;

  const rows = arrivals.map((file) => {
    const fired = rules.filter((rule) => filenameMatchesToken(file.filename, rule.tok));
    const tokens = file.filename.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && w !== "wav");
    const unmatched = tokens.find((w) => !rules.some((rule) => filenameMatchesToken(w, rule.tok)));
    return { file, fired, unmatched };
  });
  const missed = rows.filter(({ file }) => file.tags.length === 0);
  const tagged = rows.filter(({ file }) => file.tags.length > 0);

  return (
    <aside className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 md:col-span-2 xl:col-span-1">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">Latest arrivals</h2>
        <span className="flex-1" />
        <span className={cn(MONO, "text-[11px] tabular-nums text-zinc-500")}>
          {arrivals.length} landed · <span className="text-accent-text">{tagged.length} tagged</span> ·{" "}
          {missed.length} missed
        </span>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        {missed.length > 0 && (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Missed ({missed.length})
            </p>
            <ul className="mt-1 border-t border-white/10">
              {missed.map(({ file, unmatched }) => (
                <li
                  key={file.id}
                  className="flex items-center gap-2.5 border-b border-white/5 py-2 text-[13px] last:border-0"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                  <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                  {unmatched && (
                    <span className={cn(MONO, "shrink-0 text-[11px] text-zinc-500")}>“{unmatched}”</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {tagged.length > 0 && (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Tagged ({tagged.length})
            </p>
            <ul className="mt-1 border-t border-white/10">
              {tagged.map(({ file, fired }) => (
                <li
                  key={file.id}
                  className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-white/5 py-2 text-[13px] last:border-0"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                  <span className="flex shrink-0 gap-1">
                    {file.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="h-4 px-1.5 text-[10px]">
                        #{tag}
                      </Badge>
                    ))}
                  </span>
                  <span className={cn(MONO, "w-full pl-4 text-[11px] text-zinc-600")}>
                    fired {fired.map((rule) => `“${rule.tok}”`).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}

export function VariantConsole({
  files,
  rules,
  extraTotals,
}: {
  files: MockFile[];
  rules: TagRule[];
  extraTotals: number[];
}) {
  const allRows = useMemo(() => buildTagRows(files, rules), [files, rules]);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = q ? allRows.filter((row) => row.tag.includes(q) || row.toks.some((t) => t.includes(q))) : allRows;
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const current = rows.find((row) => row.tag === activeTag) ?? rows[0];

  const total = Math.max(files.length, 1);
  const tagged = files.filter((file) => file.tags.length > 0).length;
  const pct = Math.round((tagged / total) * 100);
  const atGoal = allRows.filter((row) => row.count >= COVERAGE_GOAL).length;

  const members = current ? files.filter((file) => file.tags.includes(current.tag)) : [];
  const hasArrivals = files.some((file) => ARRIVAL_BATCH.some((a) => a.id === file.id));

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 md:grid-cols-[260px_minmax(0,1fr)]",
        hasArrivals && "xl:grid-cols-[260px_minmax(0,1fr)_380px]",
      )}
    >
      <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        <div className="flex items-center gap-2.5 border-b border-white/10 px-4 transition-colors focus-within:bg-white/[0.03]">
          <Search className="size-3.5 shrink-0 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter tags..."
            aria-label="Filter tags"
            className="w-full bg-transparent py-2.5 text-[13px] font-medium text-zinc-50 placeholder:font-normal placeholder:text-zinc-600 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className={cn(MONO, "shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-100")}
            >
              Clear
            </button>
          )}
        </div>
        <p className={cn(MONO, "border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-500")}>
          Tags · {atGoal}/{allRows.length} at goal
        </p>
        <ul>
          {rows.map((row) => (
            <RailRow key={row.tag} row={row} active={row.tag === current?.tag} onSelect={() => setActiveTag(row.tag)} />
          ))}
          {rows.length === 0 && (
            <li className="px-4 py-3 text-[13px] text-zinc-500">No tags match “{query}”.</li>
          )}
        </ul>
      </div>

      <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03]">
        <div className="grid gap-3 px-6 py-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-8">
          <div className="shrink-0">
            <p className="text-6xl font-extrabold tracking-tighter text-zinc-50">
              {pct}
              <span className="text-lg font-medium text-zinc-500">%</span>
            </p>
            <p className={cn(MONO, "mt-1 text-[11px] tabular-nums text-zinc-500")}>
              {tagged}/{files.length} tagged · {files.length - tagged} to go
            </p>
          </div>
          <div className="min-w-0">
            <CoverageTrend files={files} extraTotals={extraTotals} />
          </div>
        </div>

        {current && (
          <div className="border-t border-white/10 px-6 py-5">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="text-2xl font-extrabold tracking-tight text-zinc-50">#{current.tag}</h2>
              <span className={cn(MONO, "text-[13px] tabular-nums text-zinc-400")}>
                {current.count}
                <span className="text-zinc-600">/{COVERAGE_GOAL}</span>
              </span>
              <span className={cn(MONO, "text-[11px] text-zinc-600")}>
                from {current.toks.map((tok) => `“${tok}”`).join(", ")}
              </span>
              <span className="flex-1" />
              <TagSpark tag={current.toks[0] ?? current.tag} count={current.count} active />
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  current.count >= COVERAGE_GOAL ? "bg-emerald-400" : "bg-accent-fill",
                )}
                style={{ width: `${Math.min(1, current.count / COVERAGE_GOAL) * 100}%` }}
              />
            </div>

            <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-3">
              {members.map((file) => (
                <li key={file.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                  {file.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={tag === current.tag ? "default" : "secondary"}
                      className="h-4 px-1.5 text-[10px]"
                    >
                      #{tag}
                    </Badge>
                  ))}
                </li>
              ))}
              {members.length === 0 && (
                <li className="text-[13px] text-zinc-500">Nothing carrying this tag yet.</li>
              )}
            </ul>
          </div>
        )}

        <div className="border-t border-white/10 px-6 py-4">
          <p className={cn(MONO, "text-[10px] uppercase tracking-widest text-zinc-500")}>All tags · history vs goal</p>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {rows.map((row) => (
              <li key={row.tag}>
                <button
                  type="button"
                  onClick={() => setActiveTag(row.tag)}
                  className="flex w-full items-center gap-3 rounded-md px-1 py-1 text-left hover:bg-white/[0.04]"
                >
                  <span
                    className={cn(
                      "w-24 truncate font-mono text-[12px]",
                      row.tag === current?.tag ? "font-bold text-zinc-100" : "text-zinc-400",
                    )}
                  >
                    #{row.tag}
                  </span>
                  <TagSpark tag={row.toks[0] ?? row.tag} count={row.count} active={row.tag === current?.tag} />
                  <span className={cn(MONO, "ml-auto text-[11px] tabular-nums text-zinc-500")}>
                    {row.count}/{COVERAGE_GOAL}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ArrivalsColumn files={files} rules={rules} />
    </div>
  );
}
