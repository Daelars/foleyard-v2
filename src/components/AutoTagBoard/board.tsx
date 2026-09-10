"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "@foleyard/auto-tag-v2";
import { SoundTag, StatusBadge } from "@/components/ui/foleyard";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TagOrigins } from "./origins";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

/**
 * Auto-tag board with live data (#197). Faithful port of the
 * throwaway `/prototype/auto-tag-board` console plus the origins
 * variant: tag rail left, coverage with trend center, latest
 * arrivals right, candidate queue and semantic controls below.
 * Charts render through recharts; history comes from recorded
 * coverage snapshots, never mock series.
 */

const COVERAGE_GOAL = 5;

const MEMBER_PAGE_SIZE = 50;

const QUEUE_PAGE_SIZE = 20;

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
  firedRules?: Array<{ token: string; tags: string[] }>;
};

type Snapshot = {
  at: string;
  tagged: number;
  total: number;
  tags: Record<string, number>;
};

type Candidate = {
  id: string;
  label: string;
  source: "filename_token" | "clap_suggestion" | "similar_audio_cluster";
  confidence: number | null;
  exampleFileIds: string[];
  occurrenceCount: number;
};
type QueueState = { words: string[]; lines: string[]; entries: Candidate[] };
type LastRun = {
  at: string;
  command: "tag-files" | "tag-semantic";
  tagged: number;
  attached: number;
  skipped: number;
  missing: number;
  failed: number;
};
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
  real: boolean;
};

function buildTagRows(
  counts: Record<string, number>,
  rules: Array<{ tok: string; tags: string[] }>,
  snapshots: Snapshot[],
  realTags: Set<string>,
): TagRow[] {
  const byTag = new Map<string, { toks: Set<string>; count: number }>();
  for (const rule of rules) {
    for (const tag of rule.tags) {
      const entry = byTag.get(tag) ?? { toks: new Set<string>(), count: 0 };
      entry.toks.add(rule.tok);
      byTag.set(tag, entry);
    }
  }
  for (const [name, count] of Object.entries(counts)) {
    const entry = byTag.get(name);
    if (entry) entry.count = count;
    else byTag.set(name, { toks: new Set(), count });
  }
  const [prev, last] = snapshots.slice(-2);
  return [...byTag.entries()]
    .map(([tag, { toks, count }]) => ({
      tag,
      count,
      toks: [...toks],
      delta: prev && last ? (last.tags[tag] ?? 0) - (prev.tags[tag] ?? 0) : 0,
      real: realTags.has(tag),
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

function shortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${shortLabel(iso)} ${hours}:${minutes}`;
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

type TerminalJob = {
  state: string;
  errorMessage: string | null;
  succeeded: number;
  failed: number;
};

async function waitForJob(
  jobId: string,
  onProgress: (state: string, completed: number | null, total: number | null) => void,
  isCurrent: () => boolean,
): Promise<TerminalJob | null> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!isCurrent()) return null;
    let body: unknown;
    try {
      const response = await fetch(`/api/extensions-v2/jobs/${jobId}`);
      body = await readJson(response);
    } catch {
      continue;
    }
    const record = (body as {
      job?: {
        state?: unknown;
        progress?: { completed?: unknown; total?: unknown };
        error?: { message?: unknown };
        partial?: { succeeded?: unknown; failed?: unknown };
      };
    } | null)?.job;
    if (!record || typeof record.state !== "string") continue;
    const completed = typeof record.progress?.completed === "number" ? record.progress.completed : null;
    const total = typeof record.progress?.total === "number" ? record.progress.total : null;
    onProgress(record.state, completed, total);
    if (
      record.state === "succeeded" ||
      record.state === "failed" ||
      record.state === "cancelled" ||
      record.state === "interrupted"
    ) {
      return {
        state: record.state,
        errorMessage: typeof record.error?.message === "string" ? record.error.message : null,
        succeeded: typeof record.partial?.succeeded === "number" ? record.partial.succeeded : 0,
        failed: Array.isArray(record.partial?.failed) ? record.partial.failed.length : 0,
      };
    }
  }
}

/** Turn a terminal job record into a line a person can act on. */
function describeJobEnd(label: string, terminal: TerminalJob): { kind: "done" | "failed" | "stopped"; text: string } {
  if (terminal.state === "succeeded") {
    return { kind: "done", text: `${label} finished.` };
  }
  if (terminal.state === "failed") {
    const reason = terminal.errorMessage ?? "Something went wrong while it ran.";
    const counts = terminal.failed > 0 ? ` (${terminal.failed} files failed.)` : "";
    return { kind: "failed", text: `${label} failed: ${reason}${counts}` };
  }
  if (terminal.state === "cancelled") {
    return { kind: "stopped", text: `${label} cancelled. Anything already written stays.` };
  }
  return { kind: "stopped", text: `${label} stopped because the app restarted. Run it again.` };
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

/** Page the origins listing for files carrying no tags at all. */
async function collectUntaggedIds(
  limit: number,
  onProgress: (checked: number) => void,
): Promise<{ ids: string[]; checked: number }> {
  const ids: string[] = [];
  let checked = 0;
  let cursor = "";
  let pages = 0;
  for (;;) {
    const result = await runCommand("auto-tag-v2.list-origins", { origin: "all", cursor, limit: 100 });
    if (!result.ok) throw new Error(result.message);
    const value = result.value as { entries?: unknown; nextCursor?: unknown };
    const entries = Array.isArray(value.entries) ? value.entries : [];
    for (const entry of entries) {
      if (typeof entry !== "string") continue;
      try {
        const file = JSON.parse(entry) as { id?: unknown; tags?: unknown };
        checked += 1;
        if (typeof file.id === "string" && Array.isArray(file.tags) && file.tags.length === 0 && ids.length < limit) {
          ids.push(file.id);
        }
      } catch {
        continue;
      }
    }
    pages += 1;
    onProgress(checked);
    const next = typeof value.nextCursor === "string" ? value.nextCursor : "";
    if (!next || ids.length >= limit || pages >= 30) break;
    cursor = next;
  }
  return { ids, checked };
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
      <ChartContainer config={{ pct: { label: "Coverage", color: "var(--accent-fill)" } }} className="aspect-auto h-[110px]">
        <AreaChart data={points} margin={{ top: 12, right: 10, bottom: 20, left: 30 }}>
          <defs>
            <linearGradient id="covFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-fill)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--accent-fill)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip content={<ChartTooltipContent />} />
          <Area
            type="monotone"
            dataKey="pct"
            stroke="var(--accent-fill)"
            strokeWidth={2}
            fill="url(#covFill)"
          />
        </AreaChart>
      </ChartContainer>
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
        <ReferenceLine y={COVERAGE_GOAL} stroke="var(--chart-3)" strokeOpacity={0.4} strokeDasharray="2 2" />
        <Line
          type="monotone"
          dataKey="value"
          stroke={active ? "var(--accent-fill)" : "var(--muted-foreground)"}
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
            <span className={cn(MONO, "shrink-0 text-[10px] tabular-nums text-chart-3")}>
              +{row.delta}
            </span>
          )}
          <span
            className={cn(
              MONO,
              "shrink-0 text-[12px] tabular-nums",
              done ? "text-chart-3" : empty ? "text-muted-foreground" : "text-foreground",
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
              done ? "bg-chart-3" : empty ? "bg-transparent" : "bg-accent-fill",
            )}
            style={{ width: `${pct * 100}%` }}
          />
        </span>
      </button>
    </li>
  );
}

export type AutoTagPage = "coverage" | "origins";

export function AutoTagBoard({
  enabled,
  page = "coverage",
  onPageChange,
  onOpenExtensionControls,
}: {
  enabled: boolean;
  page?: AutoTagPage;
  onPageChange?: (page: AutoTagPage) => void;
  onOpenExtensionControls?: () => void;
}) {
  const [files, setFiles] = useState<BoardFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalFiles, setTotalFiles] = useState(0);
  const [taggedFiles, setTaggedFiles] = useState(0);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [realTags, setRealTags] = useState<Set<string>>(new Set());
  const [configuredRules, setConfiguredRules] = useState<Array<{ tok: string; tags: string[] }>>(SEED_RULES);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [queue, setQueue] = useState<QueueState>({ words: [], lines: [], entries: [] });
  const [queuePage, setQueuePage] = useState(0);
  const [futureRules, setFutureRules] = useState<Set<string>>(new Set());
  const [model, setModel] = useState<ModelState | null>(null);
  const [filter, setFilter] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDownload, setConfirmDownload] = useState(false);
  const [job, setJob] = useState<{
    label: string;
    jobId: string;
    state: string;
    completed: number | null;
    total: number | null;
  } | null>(null);
  const jobRef = useRef<string | null>(null);
  const reloadTokenRef = useRef(0);
  const [gathering, setGathering] = useState(false);
  const [rulesNote, setRulesNote] = useState<string | null>(null);
  const [rulesRunning, setRulesRunning] = useState(false);
  const [gatherNote, setGatherNote] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [outcomeNote, setOutcomeNote] = useState<{ kind: "done" | "failed" | "stopped"; text: string } | null>(null);

  useEffect(() => () => {
    jobRef.current = null;
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const coverage = await runCommand("auto-tag-v2.coverage-summary", {});
      if (!coverage.ok) throw new Error(coverage.message);
      const coverageValue = coverage.value as { summary?: unknown };
      if (typeof coverageValue.summary !== "string") throw new Error("Coverage response was incomplete.");
      const aggregate = JSON.parse(coverageValue.summary) as {
        total: number; tagged: number; tags: Record<string, number>;
        allTags?: unknown;
        configuredRules?: Array<{ tok: string; tags: string[] }>;
      };
      setTotalFiles(aggregate.total);
      setTaggedFiles(aggregate.tagged);
      setTagCounts(aggregate.tags);
      setRealTags(
        new Set(
          Array.isArray(aggregate.allTags)
            ? aggregate.allTags.filter((name): name is string => typeof name === "string")
            : [],
        ),
      );
      setConfiguredRules(aggregate.configuredRules ?? []);

      const history = await runCommand("auto-tag-v2.coverage-history", {});
      if (!history.ok) throw new Error(history.message);
      const historyValue = history.value as { entries?: unknown };
      setSnapshots(parseSnapshots(Array.isArray(historyValue.entries) ? historyValue.entries.filter((e): e is string => typeof e === "string") : []));

      const arrivals = await runCommand("auto-tag-v2.latest-arrivals", {});
      if (!arrivals.ok) throw new Error(arrivals.message);
      const arrivalValue = arrivals.value as { hasData?: boolean; batch?: unknown; lastRun?: unknown };
      if (arrivalValue.hasData && typeof arrivalValue.batch === "string") {
        const batch = JSON.parse(arrivalValue.batch) as { files?: BoardFile[] };
        setFiles(batch.files ?? []);
      } else setFiles([]);
      if (typeof arrivalValue.lastRun === "string" && arrivalValue.lastRun) {
        try {
          const parsed = JSON.parse(arrivalValue.lastRun) as LastRun;
          if (typeof parsed.at === "string" && typeof parsed.tagged === "number") {
            setLastRun(parsed);
          }
        } catch {
          setLastRun(null);
        }
      }

      const queued = await runCommand("auto-tag-v2.list-candidates", {});
      if (!queued.ok) throw new Error(queued.message);
      const value = queued.value as Partial<QueueState> & { entries?: unknown };
      const entries = Array.isArray(value.entries)
        ? value.entries.flatMap((entry) => {
            if (typeof entry !== "string") return [];
            try { return [JSON.parse(entry) as Candidate]; } catch { return []; }
          })
        : [];
      setQueue({
        words: Array.isArray(value.words) ? value.words.filter((w): w is string => typeof w === "string") : [],
        lines: Array.isArray(value.lines) ? value.lines.filter((l): l is string => typeof l === "string") : [],
        entries,
      });
      setQueuePage((page) => {
        const pages = Math.max(
          1,
          Math.ceil(
            (Array.isArray(value.words) ? value.words.length : 0) / QUEUE_PAGE_SIZE,
          ),
        );
        return Math.min(page, pages - 1);
      });
      const status = await runCommand("auto-tag-v2.clap-status", {});
      if (!status.ok) throw new Error(status.message);
      setModel(status.value as ModelState);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Board failed to load.");
    } finally {
      setLoading(false);
      reloadTokenRef.current += 1;
      setReloadToken(reloadTokenRef.current);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.hidden) return;
      if (jobRef.current !== null) return;
      void load(true);
    };
    const timer = window.setInterval(refresh, 15000);
    const onVisible = () => {
      if (!document.hidden) void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      await load();
    })();
  }, [enabled, load]);

  const rows = useMemo(() => buildTagRows(tagCounts, configuredRules, snapshots, realTags), [tagCounts, configuredRules, snapshots, realTags]);
  const query = filter.trim().toLowerCase();
  const matching = query
    ? rows.filter((row) => row.tag.includes(query) || row.toks.some((tok) => tok.includes(query)))
    : rows;
  const realRows = matching.filter((row) => row.real);
  const current = realRows.find((row) => row.tag === activeTag) ?? realRows[0];

  const pct = totalFiles === 0 ? 0 : Math.round((taggedFiles / totalFiles) * 100);
  const atGoal = realRows.filter((row) => row.count >= COVERAGE_GOAL).length;

  const [members, setMembers] = useState<BoardFile[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [memberPage, setMemberPage] = useState(0);
  const [memberTotal, setMemberTotal] = useState(0);

  useEffect(() => {
    setMemberPage(0);
  }, [current?.tag]);

  useEffect(() => {
    if (!enabled || !current) { setMembers([]); setMemberTotal(0); return; }
    const token = reloadTokenRef.current;
    const tag = current.tag;
    const page = memberPage;
    void (async () => {
      const result = await runCommand("auto-tag-v2.coverage-summary", { tag, cursor: String(page * MEMBER_PAGE_SIZE), limit: MEMBER_PAGE_SIZE });
      if (token !== reloadTokenRef.current) return;
      if (!result.ok) return setLoadError(result.message);
      const value = result.value as { summary?: unknown };
      if (typeof value.summary !== "string") return;
      const summary = JSON.parse(value.summary) as { members?: string[]; tags?: Record<string, number> };
      setMembers((summary.members ?? []).flatMap((entry) => { try { return [JSON.parse(entry) as BoardFile]; } catch { return []; } }));
      const counts = summary.tags && typeof summary.tags === "object" ? summary.tags : {};
      setMemberTotal(typeof counts[tag] === "number" ? counts[tag] : 0);
    })();
  }, [current?.tag, enabled, reloadToken, memberPage]);

  const arrivals = files;
  const missed = arrivals.filter((file) => file.tags.length === 0);
  const landed = arrivals.filter((file) => file.tags.length > 0);

  const act = useCallback(
    async (label: string, work: () => Promise<{ ok: boolean; message?: string }>) => {
      setBusy(true);
      try {
        const result = await work();
        if (!result.ok) {
          toast.error(result.message ?? `${label} failed.`);
          return;
        }
        toast.success(`${label} done.`);
        await load(true);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const trackJob = useCallback(
    async (label: string, jobId: string) => {
      jobRef.current = jobId;
      setOutcomeNote(null);
      setJob({ label, jobId, state: "queued", completed: null, total: null });
      const terminal = await waitForJob(
        jobId,
        (state, completed, total) => {
          if (jobRef.current === jobId) {
            setJob({ label, jobId, state, completed, total });
          }
        },
        () => jobRef.current === jobId,
      );
      if (terminal === null) return;
      jobRef.current = null;
      setJob(null);
      const note = describeJobEnd(label, terminal);
      setOutcomeNote(note);
      if (note.kind === "done") {
        toast.success(note.text);
        await load(true);
      } else if (note.kind === "failed") {
        toast.error(note.text);
      } else {
        toast(note.text);
      }
    },
    [load],
  );

  const cancelJob = useCallback(async () => {
    const jobId = jobRef.current;
    if (!jobId) return;
    try {
      await fetch(`/api/extensions-v2/jobs/${jobId}/cancel`, { method: "POST" });
    } catch {
      toast.error("Cancel request failed; the job may still be running.");
    }
  }, []);

  const analyzeUntagged = useCallback(async () => {
    if (job !== null || gathering) return;
    setBusy(true);
    setGathering(true);
    setGatherNote("Looking for untagged files…");
    try {
      const { ids, checked } = await collectUntaggedIds(500, (count) =>
        setGatherNote(`Checked ${formatCount(count)} files…`),
      );
      if (ids.length === 0) {
        setGatherNote(
          checked === 0
            ? "No files found in the library."
            : "Everything checked is already tagged.",
        );
        return;
      }
      setGatherNote(`Tagging ${formatCount(ids.length)} untagged files…`);
      const submitted = await submitJob("auto-tag-v2.tag-semantic", { fileIds: ids });
      if (!submitted.ok) {
        toast.error(submitted.message);
        setGatherNote(null);
        return;
      }
      setGatherNote(null);
      await trackJob("Semantic tagging", submitted.jobId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not gather untagged files.");
      setGatherNote(null);
    } finally {
      setGathering(false);
      setBusy(false);
    }
  }, [gathering, job, trackJob]);

  const runRulesBulk = useCallback(async () => {
    if (rulesRunning || busy || job !== null) return;
    setBusy(true);
    setRulesRunning(true);
    setRulesNote("Looking for untagged files…");
    try {
      const { ids } = await collectUntaggedIds(2000, (count) =>
        setRulesNote(`Checked ${formatCount(count)} files…`),
      );
      if (ids.length === 0) {
        setRulesNote("Everything checked is already tagged.");
        return;
      }
      let tagged = 0;
      let attached = 0;
      const chunks = Math.ceil(ids.length / 500);
      for (let index = 0; index < ids.length; index += 500) {
        setRulesNote(`Tagging with filename rules… batch ${index / 500 + 1} of ${chunks}`);
        const result = await runCommand("auto-tag-v2.tag-files", { fileIds: ids.slice(index, index + 500) });
        if (!result.ok) {
          toast.error(result.message);
          setRulesNote(null);
          return;
        }
        const value = result.value as { tagged?: unknown; attached?: unknown };
        if (typeof value.tagged === "number") tagged += value.tagged;
        if (typeof value.attached === "number") attached += value.attached;
      }
      setRulesNote(`Tagged ${formatCount(tagged)} files with ${formatCount(attached)} tags.`);
      toast.success(`Filename rules tagged ${formatCount(tagged)} files.`);
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run the filename rules.");
      setRulesNote(null);
    } finally {
      setRulesRunning(false);
      setBusy(false);
    }
  }, [busy, job, load, rulesRunning]);

  if (!enabled) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-8 text-center">
        <p className="text-sm font-semibold text-zinc-100">Auto tag is off</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-zinc-500">
          Enable Auto Tag v2 in Settings → Extensions to see coverage, candidates, and similar
          sounds here.
        </p>
        {onOpenExtensionControls && (
          <Button className="mt-4" variant="outline" onClick={onOpenExtensionControls}>
            Open extension controls
          </Button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-8 text-center text-[13px] text-zinc-500">
        Loading Auto Tag…
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-5">
        <p className="font-medium">Auto Tag could not load</p>
        <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
        <Button className="mt-3" variant="outline" onClick={() => void load()}>Try again</Button>
      </div>
    );
  }

  return (
    <Tabs value={page} onValueChange={(value) => onPageChange?.(value as AutoTagPage)} className="space-y-3">
      <TabsList variant="line" aria-label="Auto Tag workspace">
        <TabsTrigger value="coverage">Coverage</TabsTrigger>
        <TabsTrigger value="origins">Tag origins</TabsTrigger>
      </TabsList>
      <TabsContent value="coverage" className="space-y-3">
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
              <Button variant="ghost" size="xs" onClick={() => setFilter("")}>
                Clear
              </Button>
            )}
          </div>
          <p className={cn(MONO, "border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-500")}>
            Tags · {atGoal}/{realRows.length} at goal
          </p>
          <ul>
            {realRows.map((row) => (
              <RailRow
                key={row.tag}
                row={row}
                active={row.tag === current?.tag}
                onSelect={() => setActiveTag(row.tag)}
              />
            ))}
            {realRows.length === 0 && (
              <li className="px-4 py-3 text-[13px] text-zinc-500">
                {query ? `No tags match “${filter}”.` : "No tags yet. Scan the library and the filename rules will create some, or promote words from the candidate queue."}
              </li>
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
                {taggedFiles}/{totalFiles} tagged · {totalFiles - taggedFiles} to go
              </p>
            </div>
            <div className="min-w-0">
              <CoverageTrend snapshots={snapshots} livePct={pct} />
            </div>
          </div>

          <div className="border-t border-white/10 px-6 py-4">
            <p className={cn(MONO, "text-[10px] uppercase tracking-widest text-zinc-500")}>
              All tags · history vs goal
            </p>
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {realRows.map((row) => (
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
                    current.count >= COVERAGE_GOAL ? "bg-chart-3" : "bg-accent-fill",
                  )}
                  style={{ width: `${Math.min(1, current.count / COVERAGE_GOAL) * 100}%` }}
                />
              </div>

              <div className="mt-4 border-t border-white/10 pt-3">
                <p className={cn(MONO, "text-[10px] uppercase tracking-widest text-zinc-500")}>
                  Files · {memberTotal > 0 ? `${memberPage * MEMBER_PAGE_SIZE + 1}–${memberPage * MEMBER_PAGE_SIZE + members.length} of ${memberTotal}` : "none yet"}
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {members.map((file) => (
                    <li key={file.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                      {file.tags.map((tag) => (
                        <SoundTag
                          key={tag.id}
                          name={tag.name}
                          selected={tag.name === current.tag}
                          provenance={tag.origin}
                          confidence={tag.confidence}
                        />
                      ))}
                    </li>
                  ))}
                  {members.length === 0 && (
                    <li className="text-[13px] text-zinc-500">Nothing carrying this tag yet.</li>
                  )}
                </ul>
                {memberTotal > MEMBER_PAGE_SIZE && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex-1" />
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={memberPage === 0}
                      onClick={() => setMemberPage((page) => Math.max(0, page - 1))}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={memberPage * MEMBER_PAGE_SIZE + members.length >= memberTotal}
                      onClick={() => setMemberPage((page) => page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
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
                      return (
                        <li
                          key={file.id}
                          className="flex flex-wrap items-center gap-2.5 gap-y-1 border-b border-white/5 py-2 text-[13px] last:border-0"
                        >
                          <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                          <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={busy}
                            onClick={() =>
                              void act("Tag", () =>
                                runCommand("auto-tag-v2.tag-files", { fileIds: [file.id] }),
                              )
                            }
                          >
                            Tag
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
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
                          >
                            Similar
                          </Button>
                          {similar[file.id] && (
                            <span className={cn(MONO, "w-full pl-4 text-[11px] text-zinc-600")}>
                              {similar[file.id]!.length > 0
                                ? similar[file.id]!.join(", ")
                                : "nothing close yet"}
                            </span>
                          )}
                          <span className={cn(MONO, "w-full pl-4 text-[11px] text-zinc-600")}>
                            no rule fired
                          </span>
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
                      const fired = file.firedRules ?? [];
                      return (
                        <li
                          key={file.id}
                          className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-white/5 py-2 text-[13px] last:border-0"
                        >
                          <span className="size-1.5 shrink-0 rounded-full bg-chart-3" />
                          <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                          <span className="flex shrink-0 gap-1">
                            {file.tags.map((tag) => (
                              <SoundTag
                                key={tag.id}
                                name={tag.name}
                                provenance={tag.origin}
                                confidence={tag.confidence}
                              />
                            ))}
                          </span>
                          {fired.length > 0 && (
                            <span className={cn(MONO, "w-full pl-4 text-[11px] text-zinc-600")}>
                              fired {fired.map((rule) => `“${rule.token}”`).join(", ")}
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
          {queue.lines.slice(queuePage * QUEUE_PAGE_SIZE, queuePage * QUEUE_PAGE_SIZE + QUEUE_PAGE_SIZE).map((line, sliceIndex) => {
            const index = queuePage * QUEUE_PAGE_SIZE + sliceIndex;
            return (
              <li
                key={`${queue.words[index]}-${index}`}
                className="flex flex-wrap items-center gap-2 border-b border-white/5 py-2 text-[13px] last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-zinc-200">{line}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={() =>
                    void act("Promote", () =>
                      runCommand("auto-tag-v2.promote-candidate", {
                        word: queue.words[index],
                      }),
                    )
                  }
                >
                  Promote
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={() =>
                    void act("Dismiss", () =>
                      runCommand("auto-tag-v2.dismiss-candidate", {
                        word: queue.words[index],
                      }),
                    )
                  }
                >
                  Dismiss
                </Button>
              </li>
            );
          })}
          {queue.lines.length === 0 && (
            <li className="py-2 text-[13px] text-zinc-500">No candidates are awaiting review.</li>
          )}
        </ul>
        {queue.lines.length > QUEUE_PAGE_SIZE && (
          <div className="mt-2 flex items-center gap-2">
            <span className={cn(MONO, "text-[11px] tabular-nums text-zinc-500")}>
              Showing {queuePage * QUEUE_PAGE_SIZE + 1}–{Math.min(queue.lines.length, queuePage * QUEUE_PAGE_SIZE + QUEUE_PAGE_SIZE)} of {queue.lines.length}
            </span>
            <span className="flex-1" />
            <Button
              variant="ghost"
              size="xs"
              disabled={queuePage === 0}
              onClick={() => setQueuePage((page) => Math.max(0, page - 1))}
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={(queuePage + 1) * QUEUE_PAGE_SIZE >= queue.lines.length}
              onClick={() => setQueuePage((page) => page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Filename rules</h2>
          <span className="flex-1" />
          <span className={cn(MONO, "text-[11px] text-zinc-500")}>
            deterministic · manual tags always win
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || rulesRunning || job !== null || totalFiles - taggedFiles === 0}
            onClick={() => void runRulesBulk()}
          >
            Tag untagged files with filename rules
          </Button>
        </div>
        {rulesNote && (
          <p className={cn(MONO, "mt-1 text-[11px] text-zinc-400")}>{rulesNote}</p>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Semantic tagging</h2>
          <span className="flex-1" />
          {!model ? (
            <span className={cn(MONO, "text-[11px] text-zinc-500")}>…</span>
          ) : model.state === "ready" ? (
            <StatusBadge status="model ready" tone="ready" />
          ) : model.state === "downloading" ? (
            <StatusBadge
              status={`downloading ${formatCount(model.downloadedBytes)}/${formatCount(model.totalBytes)}`}
              tone="warning"
            />
          ) : (
            <StatusBadge status="model not downloaded" tone="neutral" />
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!confirmDownload ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || job !== null || model?.state === "ready"}
              onClick={() => setConfirmDownload(true)}
            >
              Download model
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || job !== null}
              onClick={() => {
                setConfirmDownload(false);
                setBusy(true);
                void (async () => {
                  try {
                    const submitted = await submitJob("auto-tag-v2.download-model", {
                      confirm: true,
                    });
                    if (!submitted.ok) {
                      toast.error(submitted.message);
                      return;
                    }
                    await trackJob("Download", submitted.jobId);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Confirm ~400 MB download
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            disabled={busy || gathering || job !== null || model?.state !== "ready" || totalFiles - taggedFiles === 0}
            onClick={() => void analyzeUntagged()}
          >
            Analyze untagged files with CLAP
          </Button>
        </div>
        <p className={cn(MONO, "mt-2 text-[11px] tabular-nums text-zinc-500")}>
          {formatCount(Math.max(0, totalFiles - taggedFiles))} untagged of {formatCount(totalFiles)} in the library
        </p>
        {model && model.state !== "ready" && (
          <p className={cn(MONO, "mt-1 text-[11px] text-zinc-600")}>
            Download the model first, then analyzing unlocks.
          </p>
        )}
        {model?.state === "ready" && totalFiles > 0 && totalFiles - taggedFiles === 0 && (
          <p className={cn(MONO, "mt-1 text-[11px] text-zinc-600")}>
            Everything is tagged. New scans will add to this count.
          </p>
        )}
        {lastRun && (
          <p className={cn(MONO, "mt-1 text-[11px] tabular-nums text-zinc-500")}>
            Last run {shortTime(lastRun.at)} · {lastRun.command === "tag-semantic" ? "CLAP" : "rules"}:
            tagged {formatCount(lastRun.tagged)}, attached {formatCount(lastRun.attached)},
            skipped {formatCount(lastRun.skipped)}
            {lastRun.failed > 0 && ` · ${lastRun.failed} failed`}
          </p>
        )}
        {lastRun && lastRun.tagged === 0 && lastRun.skipped > 0 && (
          <p className={cn(MONO, "mt-1 text-[11px] text-zinc-600")}>
            Nothing cleared the bar. Promoting candidates from the queue grows the vocabulary it matches against.
          </p>
        )}
        {gatherNote && (
          <p className={cn(MONO, "mt-1 text-[11px] text-zinc-400")}>{gatherNote}</p>
        )}
        {!job && !gatherNote && outcomeNote && (
          <p
            role="status"
            className={cn(
              MONO,
              "mt-1 text-[11px]",
              outcomeNote.kind === "failed" ? "text-destructive" : "text-zinc-500",
            )}
          >
            {outcomeNote.text}
          </p>
        )}
        {job && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="text-[13px] text-zinc-200">
                {job.label}… {job.state}
                {job.completed !== null && job.total !== null && (
                  <span className={cn(MONO, "text-[11px] tabular-nums text-zinc-500")}>
                    {" "}{formatCount(job.completed)}/{formatCount(job.total)}
                  </span>
                )}
              </p>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => void cancelJob()}
                className={cn(MONO, "shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100")}
              >
                Cancel
              </button>
            </div>
            {job.completed !== null && job.total !== null && job.total > 0 && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-accent-fill transition-[width]"
                  style={{ width: `${Math.min(1, job.completed / job.total) * 100}%` }}
                />
              </div>
            )}
            <p className={cn(MONO, "mt-1 truncate text-[10px] text-zinc-600")}>{job.jobId}</p>
          </div>
        )}
        {!model?.backendAvailable && (
          <p className={cn(MONO, "mt-2 text-[11px] text-zinc-600")}>
            No inference runtime installed; semantic tagging reports it instead of pretending.
          </p>
        )}
      </div>
      </TabsContent>
      <TabsContent value="origins">
        <TagOrigins />
      </TabsContent>
    </Tabs>
  );
}
