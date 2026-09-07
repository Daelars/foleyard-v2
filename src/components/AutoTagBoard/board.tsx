"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TagOrigin } from "@yard-core";
import {
  SEED_RULES,
  filenameMatchesToken,
  unmatchedTokens,
} from "@foleyard/auto-tag-v2";
import { Badge } from "@/components/ui/badge";
import { TagOriginMark } from "@/components/FileTable/tag-origin-mark";
import { cn } from "@/lib/utils";

/**
 * Auto-tag board with live data (#197). Faithful port of the
 * throwaway `/prototype/auto-tag-board` console plus the origins
 * variant: tag rail left, coverage with trend center, latest
 * arrivals right, candidate queue and semantic controls below.
 * Charts render through recharts; history comes from recorded
 * coverage snapshots, never mock series.
 */

export const BOARD_FILE_CAP = 2000;
const PAGE_SIZE = 500;
const COVERAGE_GOAL = 5;
const ARRIVAL_COUNT = 8;
const SNAPSHOT_MAX_AGE_MS = 60 * 60 * 1000;

const MONO = "font-mono";

type BoardTag = {
  id: string;
  name: string;
  origin?: TagOrigin | null;
  confidence?: number | null;
};

type BoardFile = {
  id: string;
  filename: string;
  createdAt?: string | null;
  tags: BoardTag[];
};

type Snapshot = {
  at: string;
  tagged: number;
  total: number;
  tags: Record<string, number>;
};

type QueueState = { words: string[]; lines: string[] };
type ModelState = {
  state: "ready" | "not-downloaded" | "downloading";
  downloadedBytes: number;
  totalBytes: number;
  backendAvailable: boolean;
};

/** One row per distinct tag across rules and files. */
type TagRow = {
  tag: string;
  count: number;
  toks: string[];
  delta: number;
};

function buildTagRows(files: BoardFile[], snapshots: Snapshot[]): TagRow[] {
  const byTag = new Map<string, { toks: Set<string>; count: number }>();
  for (const rule of SEED_RULES) {
    for (const tag of rule.tags) {
      const entry = byTag.get(tag) ?? { toks: new Set<string>(), count: 0 };
      entry.toks.add(rule.tok);
      byTag.set(tag, entry);
    }
  }
  for (const file of files) {
    for (const tag of file.tags) {
      const entry = byTag.get(tag.name);
      if (entry) entry.count += 1;
      else byTag.set(tag.name, { toks: new Set(), count: 1 });
    }
  }
  const [prev, last] = snapshots.slice(-2);
  return [...byTag.entries()]
    .map(([tag, { toks, count }]) => ({
      tag,
      count,
      toks: [...toks],
      delta: prev && last ? (last.tags[tag] ?? 0) - (prev.tags[tag] ?? 0) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function parseSnapshots(entries: string[]): Snapshot[] {
  const out: Snapshot[] = [];
  for (const entry of entries) {
    try {
      const parsed = JSON.parse(entry) as Partial<Snapshot>;
      if (typeof parsed.at !== "string") continue;
      const tags: Record<string, number> = {};
      if (parsed.tags && typeof parsed.tags === "object") {
        for (const [name, count] of Object.entries(parsed.tags)) {
          if (typeof count === "number" && Number.isInteger(count) && count >= 0) {
            tags[name] = count;
          }
        }
      }
      out.push({
        at: parsed.at,
        tagged: typeof parsed.tagged === "number" ? parsed.tagged : 0,
        total: typeof parsed.total === "number" ? parsed.total : 0,
        tags,
      });
    } catch {
      continue;
    }
  }
  return out;
}

function shortLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

type CommandValue = { ok: true; value: unknown } | { ok: false; message: string };

async function runCommand(
  commandId: string,
  input: Record<string, unknown>,
  fileIds: string[] = [],
): Promise<CommandValue> {
  let response: Response;
  try {
    response = await fetch("/api/extensions-v2/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        extensionId: "auto-tag-v2",
        commandId,
        selection: { fileIds },
        input,
      }),
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const body = (await readJson(response)) as {
    ok?: boolean;
    outcome?: { kind?: string; value?: unknown };
    error?: { message?: string };
  } | null;
  if (!response.ok || !body?.ok) {
    return { ok: false, message: body?.error?.message ?? `Command failed with ${response.status}.` };
  }
  if (body.outcome?.kind !== "immediate") {
    return { ok: false, message: "Command did not settle immediately." };
  }
  return { ok: true, value: body.outcome.value };
}

async function submitJob(
  commandId: string,
  input: Record<string, unknown>,
): Promise<{ ok: true; jobId: string } | { ok: false; message: string }> {
  let response: Response;
  try {
    response = await fetch("/api/extensions-v2/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ extensionId: "auto-tag-v2", commandId, input }),
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const body = (await readJson(response)) as {
    ok?: boolean;
    outcome?: { kind?: string; jobId?: string };
    error?: { message?: string };
  } | null;
  const jobId = body?.ok ? body.outcome?.jobId : undefined;
  if (!response.ok || !body?.ok || !jobId) {
    return { ok: false, message: body?.error?.message ?? `Job submit failed with ${response.status}.` };
  }
  return { ok: true, jobId };
}

async function waitForJob(jobId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const response = await fetch("/api/extensions-v2/jobs?limit=50");
      const body = (await readJson(response)) as {
        jobs?: Array<{ jobId?: string; id?: string; state?: string }>;
      } | null;
      const jobs = body?.jobs ?? [];
      const job = jobs.find((entry) => entry.jobId === jobId || entry.id === jobId);
      if (job && (job.state === "succeeded" || job.state === "failed" || job.state === "cancelled")) {
        return job.state === "succeeded";
      }
    } catch {
      return false;
    }
  }
  return false;
}

/** Percent coverage over recorded snapshots plus the live point. */
function CoverageTrend({ snapshots, livePct }: { snapshots: Snapshot[]; livePct: number }) {
  const points = [
    ...snapshots.map((entry) => ({
      label: shortLabel(entry.at),
      pct: entry.total === 0 ? 0 : Math.round((entry.tagged / entry.total) * 100),
    })),
    { label: "now", pct: livePct },
  ];
  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={points} margin={{ top: 12, right: 10, bottom: 20, left: 30 }}>
          <defs>
            <linearGradient id="covFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-fill)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--accent-fill)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--color-zinc-600)" }} tickLine={false} axisLine={false} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tick={{ fontSize: 9, fill: "var(--color-zinc-600)" }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0b0b10",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="pct"
            stroke="var(--accent-fill)"
            strokeWidth={2}
            fill="url(#covFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
      {snapshots.length === 0 && (
        <p className={cn(MONO, "mt-1 text-[10px] text-zinc-600")}>
          Trend builds as coverage snapshots record.
        </p>
      )}
    </div>
  );
}

/** Tiny history sparkline for a tag, scaled to the coverage goal. */
function TagSparkChart({
  tag,
  count,
  snapshots,
  active,
}: {
  tag: string;
  count: number;
  snapshots: Snapshot[];
  active: boolean;
}) {
  const values = [...snapshots.map((entry) => entry.tags[tag] ?? 0), count];
  const data = values.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width={96} height={28}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <ReferenceLine y={COVERAGE_GOAL} stroke="rgba(52,211,153,0.4)" strokeDasharray="2 2" />
        <Line
          type="monotone"
          dataKey="value"
          stroke={active ? "var(--accent-fill)" : "#52525b"}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function RailRow({
  row,
  active,
  onSelect,
}: {
  row: TagRow;
  active: boolean;
  onSelect: () => void;
}) {
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

export function AutoTagBoard({ enabled }: { enabled: boolean }) {
  const [files, setFiles] = useState<BoardFile[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [queue, setQueue] = useState<QueueState>({ words: [], lines: [] });
  const [model, setModel] = useState<ModelState | null>(null);
  const [filter, setFilter] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDownload, setConfirmDownload] = useState(false);

  const load = useCallback(async () => {
    try {
      const loaded: BoardFile[] = [];
      let offset = 0;
      let capped = false;
      for (;;) {
        const response = await fetch(`/api/files?limit=${PAGE_SIZE}&offset=${offset}`);
        if (!response.ok) throw new Error(`Files request failed with ${response.status}.`);
        const body = (await readJson(response)) as {
          files?: BoardFile[];
          hasMore?: boolean;
        } | null;
        const page = body?.files ?? [];
        loaded.push(...page);
        if (loaded.length >= BOARD_FILE_CAP) {
          capped = true;
          break;
        }
        if (!body?.hasMore || page.length === 0) break;
        offset += page.length;
      }
      const windowed = loaded.slice(0, BOARD_FILE_CAP);
      setFiles(windowed);
      setTruncated(capped);

      const history = await runCommand("auto-tag-v2.coverage-history", {});
      let stored: Snapshot[] = [];
      if (history.ok) {
        const value = history.value as { entries?: unknown };
        stored = parseSnapshots(
          Array.isArray(value.entries) ? value.entries.filter((e): e is string => typeof e === "string") : [],
        );
        setSnapshots(stored);
      }

      const tagged = windowed.filter((file) => file.tags.length > 0).length;
      const tagCounts: Record<string, number> = {};
      for (const file of windowed) {
        for (const tag of file.tags) {
          tagCounts[tag.name] = (tagCounts[tag.name] ?? 0) + 1;
        }
      }
      const last = stored[stored.length - 1];
      const stale =
        !last ||
        Date.now() - new Date(last.at).getTime() > SNAPSHOT_MAX_AGE_MS ||
        last.tagged !== tagged ||
        last.total !== windowed.length ||
        JSON.stringify(last.tags) !== JSON.stringify(tagCounts);
      if (stale) {
        const recorded = await runCommand("auto-tag-v2.record-coverage", {
          tagged,
          total: windowed.length,
          tags: Object.entries(tagCounts).map(([name, count]) => `${name}:${count}`),
        });
        if (recorded.ok) {
          const refreshed = await runCommand("auto-tag-v2.coverage-history", {});
          if (refreshed.ok) {
            const value = refreshed.value as { entries?: unknown };
            setSnapshots(
              parseSnapshots(
                Array.isArray(value.entries)
                  ? value.entries.filter((e): e is string => typeof e === "string")
                  : [],
              ),
            );
          }
        }
      }

      const queued = await runCommand("auto-tag-v2.list-candidates", {});
      if (queued.ok) {
        const value = queued.value as Partial<QueueState>;
        setQueue({
          words: Array.isArray(value.words) ? value.words.filter((w): w is string => typeof w === "string") : [],
          lines: Array.isArray(value.lines) ? value.lines.filter((l): l is string => typeof l === "string") : [],
        });
      }
      const status = await runCommand("auto-tag-v2.clap-status", {});
      if (status.ok) {
        setModel(status.value as ModelState);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Board failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      await load();
    })();
  }, [enabled, load]);

  const rows = useMemo(() => buildTagRows(files, snapshots), [files, snapshots]);
  const query = filter.trim().toLowerCase();
  const visible = query
    ? rows.filter((row) => row.tag.includes(query) || row.toks.some((tok) => tok.includes(query)))
    : rows;
  const current = visible.find((row) => row.tag === activeTag) ?? visible[0];

  const total = Math.max(files.length, 1);
  const tagged = files.filter((file) => file.tags.length > 0).length;
  const pct = Math.round((tagged / total) * 100);
  const atGoal = rows.filter((row) => row.count >= COVERAGE_GOAL).length;

  const members = current ? files.filter((file) => file.tags.some((tag) => tag.name === current.tag)) : [];

  const arrivals = useMemo(
    () =>
      [...files]
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .slice(0, ARRIVAL_COUNT),
    [files],
  );
  const missed = arrivals.filter((file) => file.tags.length === 0);
  const landed = arrivals.filter((file) => file.tags.length > 0);

  const act = useCallback(
    async (label: string, work: () => Promise<{ ok: boolean; message?: string }>) => {
      setBusy(true);
      setLoading(true);
      try {
        const result = await work();
        if (!result.ok) {
          toast.error(result.message ?? `${label} failed.`);
          return;
        }
        toast.success(`${label} done.`);
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (!enabled) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-8 text-center">
        <p className="text-sm font-semibold text-zinc-100">Auto tag is off</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-zinc-500">
          Enable Auto Tag v2 in Settings → Extensions to see coverage, candidates, and similar
          sounds here.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-8 text-center text-[13px] text-zinc-500">
        Loading board…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "grid grid-cols-1 gap-3 md:grid-cols-[260px_minmax(0,1fr)]",
          arrivals.length > 0 && "xl:grid-cols-[260px_minmax(0,1fr)_380px]",
        )}
      >
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2.5 border-b border-white/10 px-4 transition-colors focus-within:bg-white/[0.03]">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter tags..."
              aria-label="Filter tags"
              className="w-full bg-transparent py-2.5 text-[13px] font-medium text-zinc-50 placeholder:font-normal placeholder:text-zinc-600 focus:outline-none"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                className={cn(MONO, "shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-100")}
              >
                Clear
              </button>
            )}
          </div>
          <p className={cn(MONO, "border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-500")}>
            Tags · {atGoal}/{rows.length} at goal
          </p>
          <ul>
            {visible.map((row) => (
              <RailRow
                key={row.tag}
                row={row}
                active={row.tag === current?.tag}
                onSelect={() => setActiveTag(row.tag)}
              />
            ))}
            {visible.length === 0 && (
              <li className="px-4 py-3 text-[13px] text-zinc-500">No tags match “{filter}”.</li>
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
                {truncated && ` · first ${BOARD_FILE_CAP} files`}
              </p>
            </div>
            <div className="min-w-0">
              <CoverageTrend snapshots={snapshots} livePct={pct} />
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
                {current.toks.length > 0 && (
                  <span className={cn(MONO, "text-[11px] text-zinc-600")}>
                    from {current.toks.map((tok) => `“${tok}”`).join(", ")}
                  </span>
                )}
                <span className="flex-1" />
                <TagSparkChart tag={current.tag} count={current.count} snapshots={snapshots} active />
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
                        key={tag.id}
                        variant={tag.name === current.tag ? "default" : "secondary"}
                        className="flex h-4 items-center gap-1 px-1.5 text-[10px]"
                      >
                        #{tag.name}
                        <TagOriginMark origin={tag.origin} confidence={tag.confidence} />
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
            <p className={cn(MONO, "text-[10px] uppercase tracking-widest text-zinc-500")}>
              All tags · history vs goal
            </p>
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {visible.map((row) => (
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
                    <TagSparkChart
                      tag={row.tag}
                      count={row.count}
                      snapshots={snapshots}
                      active={row.tag === current?.tag}
                    />
                    <span className={cn(MONO, "ml-auto text-[11px] tabular-nums text-zinc-500")}>
                      {row.count}/{COVERAGE_GOAL}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {arrivals.length > 0 && (
          <aside className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">Latest arrivals</h2>
              <span className="flex-1" />
              <span className={cn(MONO, "text-[11px] tabular-nums text-zinc-500")}>
                {arrivals.length} landed · <span className="text-accent-text">{landed.length} tagged</span> ·{" "}
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
                    {missed.map((file) => {
                      const unmatched = unmatchedTokens(file.filename)[0];
                      return (
                        <li
                          key={file.id}
                          className="flex flex-wrap items-center gap-2.5 gap-y-1 border-b border-white/5 py-2 text-[13px] last:border-0"
                        >
                          <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                          <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                          {unmatched && (
                            <span className={cn(MONO, "shrink-0 text-[11px] text-zinc-500")}>
                              “{unmatched}”
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void act("Tag", () =>
                                runCommand("auto-tag-v2.tag-files", { fileIds: [file.id] }),
                              )
                            }
                            className={cn(MONO, "shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100")}
                          >
                            Tag
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void (async () => {
                                const result = await runCommand(
                                  "auto-tag-v2.find-similar",
                                  {},
                                  [file.id],
                                );
                                if (!result.ok) {
                                  toast.error(result.message);
                                  return;
                                }
                                const value = result.value as { similarFilenames?: unknown };
                                setSimilar((prev) => ({
                                  ...prev,
                                  [file.id]: Array.isArray(value.similarFilenames)
                                    ? value.similarFilenames.filter((n): n is string => typeof n === "string")
                                    : [],
                                }));
                              })()
                            }
                            className={cn(MONO, "shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100")}
                          >
                            Similar
                          </button>
                          {similar[file.id] && (
                            <span className={cn(MONO, "w-full pl-4 text-[11px] text-zinc-600")}>
                              {similar[file.id]!.length > 0
                                ? similar[file.id]!.join(", ")
                                : "nothing close yet"}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              {landed.length > 0 && (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    Tagged ({landed.length})
                  </p>
                  <ul className="mt-1 border-t border-white/10">
                    {landed.map((file) => {
                      const fired = SEED_RULES.filter((rule) =>
                        filenameMatchesToken(file.filename, rule.tok),
                      );
                      return (
                        <li
                          key={file.id}
                          className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-white/5 py-2 text-[13px] last:border-0"
                        >
                          <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
                          <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                          <span className="flex shrink-0 gap-1">
                            {file.tags.map((tag) => (
                              <Badge
                                key={tag.id}
                                variant="secondary"
                                className="flex h-4 items-center gap-1 px-1.5 text-[10px]"
                              >
                                #{tag.name}
                                <TagOriginMark origin={tag.origin} confidence={tag.confidence} />
                              </Badge>
                            ))}
                          </span>
                          {fired.length > 0 && (
                            <span className={cn(MONO, "w-full pl-4 text-[11px] text-zinc-600")}>
                              fired {fired.map((rule) => `“${rule.tok}”`).join(", ")}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          </aside>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Candidate queue</h2>
          <span className="flex-1" />
          <span className={cn(MONO, "text-[11px] text-zinc-500")}>explicit accept only</span>
        </div>
        <ul className="mt-1 border-t border-white/10">
          {queue.lines.map((line, index) => (
            <li
              key={`${queue.words[index]}-${index}`}
              className="flex flex-wrap items-center gap-2 border-b border-white/5 py-2 text-[13px] last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-zinc-200">{line}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act("Promote", () =>
                    runCommand("auto-tag-v2.promote-candidate", {
                      word: queue.words[index],
                    }),
                  )
                }
                className={cn(MONO, "shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100")}
              >
                Promote
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act("Dismiss", () =>
                    runCommand("auto-tag-v2.dismiss-candidate", {
                      word: queue.words[index],
                    }),
                  )
                }
                className={cn(MONO, "shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100")}
              >
                Dismiss
              </button>
            </li>
          ))}
          {queue.lines.length === 0 && (
            <li className="py-2 text-[13px] text-zinc-500">Queue empty. Every word is covered.</li>
          )}
        </ul>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Semantic tagging</h2>
          <span className="flex-1" />
          <span className={cn(MONO, "text-[11px] text-zinc-500")}>
            {model ? `${model.state} · ${model.downloadedBytes}/${model.totalBytes} bytes` : "…"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!confirmDownload ? (
            <button
              type="button"
              disabled={busy || model?.state === "ready"}
              onClick={() => setConfirmDownload(true)}
              className={cn(MONO, "rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-40")}
            >
              Download model
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmDownload(false);
                void act("Download", async () => {
                  const submitted = await submitJob("auto-tag-v2.download-model", {
                    confirm: true,
                  });
                  if (!submitted.ok) return submitted;
                  const settled = await waitForJob(submitted.jobId);
                  return settled
                    ? { ok: true as const, value: null }
                    : { ok: false as const, message: "Download job did not succeed." };
                });
              }}
              className={cn(MONO, "rounded-md bg-white/10 px-2 py-1 text-[11px] font-bold text-zinc-100")}
            >
              Confirm ~400 MB download
            </button>
          )}
          <button
            type="button"
            disabled={busy || untaggedCount(files) === 0}
            onClick={() =>
              void act("Semantic tagging", async () => {
                const ids = files
                  .filter((file) => file.tags.length === 0)
                  .slice(0, 500)
                  .map((file) => file.id);
                const submitted = await submitJob("auto-tag-v2.tag-semantic", {
                  fileIds: ids,
                });
                if (!submitted.ok) return submitted;
                const settled = await waitForJob(submitted.jobId);
                return settled
                  ? { ok: true as const, value: null }
                  : { ok: false as const, message: "Tagging job did not succeed." };
              })
            }
            className={cn(MONO, "rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-40")}
          >
            Tag untagged with CLAP
          </button>
        </div>
        {!model?.backendAvailable && (
          <p className={cn(MONO, "mt-2 text-[11px] text-zinc-600")}>
            No inference runtime installed; semantic tagging reports it instead of pretending.
          </p>
        )}
      </div>
    </div>
  );
}

function untaggedCount(files: BoardFile[]): number {
  return files.filter((file) => file.tags.length === 0).length;
}
