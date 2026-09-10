"use client";

// app-v3 adapter for AutoTagBoard: same props, same live-data plumbing
// (coverage summary/history, latest arrivals, candidate queue, CLAP status,
// job submit/track/cancel), restyled in the variant I library language.
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
import { SEED_RULES } from "@foleyard/auto-tag-v2";
import {
  Alert,
  Button,
  CoverRow,
  EmptyState,
  Field,
  ProvTag,
  QUEUE_PAGE_SIZE,
  QueueCard,
  SkeletonRow,
  StatusBadge,
  TabPanel,
  Tabs,
} from "@/components/variant-i";
import { cn } from "@/lib/utils";

import { V3TagOrigins } from "./origins";

const COVERAGE_GOAL = 5;

/** Most recent arrivals shown in the Latest arrivals panel. */
const ARRIVAL_COUNT = 8;

const MEMBER_PAGE_SIZE = 50;

const MONO = "font-mono";

const SHELL = "rounded-xl border border-[var(--vi-edge)] bg-white/[0.02]";

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

function CoverageTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  if (typeof value !== "number") return null;
  return (
    <div className="rounded-md border border-[var(--vi-edge-hi)] bg-[#141419] px-2 py-1 font-mono text-[10.5px] text-zinc-300 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
      {label}: {value}%
    </div>
  );
}

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
      <div className="h-[110px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 12, right: 10, bottom: 20, left: 30 }}>
            <defs>
              <linearGradient id="covFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-fill)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--accent-fill)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#71717a" }} tickLine={false} axisLine={false} />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tick={{ fontSize: 9, fill: "#71717a" }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip content={<CoverageTooltip />} cursor={{ stroke: "rgba(255,255,255,0.16)" }} />
            <Area
              type="monotone"
              dataKey="pct"
              stroke="var(--accent-fill)"
              strokeWidth={2}
              fill="url(#covFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {snapshots.length === 0 && (
        <p className={cn(MONO, "mt-1 text-[10px] text-zinc-600")}>
          Trend builds as coverage snapshots record.
        </p>
      )}
    </div>
  );
}

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
        <ReferenceLine y={COVERAGE_GOAL} stroke="#34d399" strokeOpacity={0.4} strokeDasharray="2 2" />
        <Line
          type="monotone"
          dataKey="value"
          stroke={active ? "var(--accent-fill)" : "#52525b"}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export type V3AutoTagPage = "coverage" | "origins";

export function V3AutoTagBoard({
  enabled,
  page = "coverage",
  onPageChange,
  onOpenExtensionControls,
}: {
  enabled: boolean;
  page?: V3AutoTagPage;
  onPageChange?: (page: V3AutoTagPage) => void;
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
  const lastAggregateRef = useRef<string | null>(null);
  const aggregateChangedRef = useRef(true);
  const lastSnapshotsRef = useRef<string | null>(null);
  const lastArrivalsRef = useRef<string | null>(null);
  const lastRunRef = useRef<string | null>(null);
  const lastQueueRef = useRef<string | null>(null);
  const lastModelRef = useRef<string | null>(null);
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
    setLoadError((current) => {
      if (current === null) return current;
      return null;
    });
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
      const aggregateKey = JSON.stringify({
        total: aggregate.total,
        tagged: aggregate.tagged,
        tags: aggregate.tags,
      });
      aggregateChangedRef.current = aggregateKey !== lastAggregateRef.current;
      lastAggregateRef.current = aggregateKey;
      if (aggregateChangedRef.current) {
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
      }

      const history = await runCommand("auto-tag-v2.coverage-history", {});
      if (!history.ok) throw new Error(history.message);
      const historyValue = history.value as { entries?: unknown };
      const snapshotsKey = JSON.stringify(historyValue.entries);
      if (snapshotsKey !== lastSnapshotsRef.current) {
        lastSnapshotsRef.current = snapshotsKey;
        setSnapshots(parseSnapshots(Array.isArray(historyValue.entries) ? historyValue.entries.filter((e): e is string => typeof e === "string") : []));
      }

      const arrivals = await runCommand("auto-tag-v2.latest-arrivals", {});
      if (!arrivals.ok) throw new Error(arrivals.message);
      const arrivalValue = arrivals.value as { hasData?: boolean; batch?: unknown; lastRun?: unknown };
      const arrivalsKey = typeof arrivalValue.batch === "string" ? arrivalValue.batch : "";
      if (arrivalsKey !== lastArrivalsRef.current) {
        lastArrivalsRef.current = arrivalsKey;
        if (arrivalValue.hasData && typeof arrivalValue.batch === "string") {
          const batch = JSON.parse(arrivalValue.batch) as { files?: BoardFile[] };
          setFiles(batch.files ?? []);
        } else setFiles([]);
      }
      const lastRunKey = JSON.stringify(arrivalValue.lastRun ?? null);
      if (lastRunKey !== lastRunRef.current) {
        lastRunRef.current = lastRunKey;
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
      }

      const queued = await runCommand("auto-tag-v2.list-candidates", {});
      if (!queued.ok) throw new Error(queued.message);
      const value = queued.value as Partial<QueueState> & { entries?: unknown };
      const queueKey = JSON.stringify({
        words: value.words,
        lines: value.lines,
        entries: value.entries,
      });
      if (queueKey !== lastQueueRef.current) {
        lastQueueRef.current = queueKey;
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
      }
      const status = await runCommand("auto-tag-v2.clap-status", {});
      if (!status.ok) throw new Error(status.message);
      const modelKey = JSON.stringify(status.value);
      if (modelKey !== lastModelRef.current) {
        lastModelRef.current = modelKey;
        setModel(status.value as ModelState);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Board failed to load.");
    } finally {
      setLoading(false);
      // Generation token: invalidates any in-flight members response on
      // every load, but only notifies the members effect when the aggregate
      // summary actually changed, so quiet polls do not refetch the file
      // list and re-render fifty rows for identical data.
      reloadTokenRef.current += 1;
      if (aggregateChangedRef.current) {
        setReloadToken(reloadTokenRef.current);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.hidden) return;
      if (jobRef.current !== null) return;
      void load(true);
    };
    // Quiet poll for external changes (scans, other windows). Jobs update the
    // board through their own wait loop, so the poll is a slow background
    // check, not the primary refresh path.
    const timer = window.setInterval(refresh, 30000);
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

  const [memberPageTag, setMemberPageTag] = useState(current?.tag);
  if (current?.tag !== memberPageTag) {
    setMemberPageTag(current?.tag);
    setMemberPage(0);
  }

  const [membersStale, setMembersStale] = useState(!enabled || !current);
  if ((!enabled || !current) !== membersStale) {
    setMembersStale(!enabled || !current);
    if (!enabled || !current) {
      setMembers([]);
      setMemberTotal(0);
    }
  }

  useEffect(() => {
    if (!enabled || !current) return;
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

  // Latest arrivals are capped to the most recent files (the board the
  // working tree replaced capped at 8); the raw scan batch can be hundreds
  // of files and would otherwise render an endless page.
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

  const queueItems = useMemo(
    () =>
      queue.words.map((word, index) => ({
        word,
        files: queue.entries[index]?.occurrenceCount ?? 0,
      })),
    [queue.words, queue.entries],
  );

  const promoteCandidate = useCallback(
    (word: string) => {
      if (busy) return;
      void act("Promote", () =>
        runCommand("auto-tag-v2.promote-candidate", {
          word,
        }),
      );
    },
    [busy, act],
  );

  const dismissCandidate = useCallback(
    (word: string) => {
      if (busy) return;
      void act("Dismiss", () =>
        runCommand("auto-tag-v2.dismiss-candidate", {
          word,
        }),
      );
    },
    [busy, act],
  );

  if (!enabled) {
    return (
      <div className={cn(SHELL, "px-5 py-8 text-center")}>
        <p className="text-sm font-semibold text-zinc-100">Auto tag is off</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-zinc-500">
          Enable Auto Tag v2 in Settings → Extensions to see coverage, candidates, and similar
          sounds here.
        </p>
        {onOpenExtensionControls && (
          <Button tone="secondary" size="md" className="mt-4" onClick={onOpenExtensionControls}>
            Open extension controls
          </Button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn(SHELL, "px-5 py-6")}>
        <p className={cn(MONO, "text-[11px] text-zinc-500")}>Loading Auto Tag…</p>
        <div className="mt-3 grid gap-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <Alert tone="error" title="Auto Tag could not load" body={loadError} />
        <Button tone="secondary" size="sm" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Tabs
        label="Auto Tag workspace"
        tabs={[
          { value: "coverage", label: "Coverage" },
          { value: "origins", label: "Tag origins" },
        ]}
        value={page}
        onChange={(value) => onPageChange?.(value)}
      />
      <div className={cn(page !== "coverage" && "hidden")}>
        <TabPanel tabKey="coverage">
          <div className="space-y-3">
          <div
            className={cn(
              "grid grid-cols-1 gap-3 md:grid-cols-[260px_minmax(0,1fr)]",
              arrivals.length > 0 && "xl:grid-cols-[260px_minmax(0,1fr)_380px]",
            )}
          >
            <div className={cn(SHELL, "flex flex-col overflow-hidden")}>
              <div className="flex items-center gap-2 border-b border-[var(--vi-edge)] px-3 focus-within:bg-white/[0.03]">
                <Field
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filter tags..."
                  aria-label="Filter tags"
                  className="h-9 rounded-none border-0 bg-transparent px-0 text-[13px] font-medium text-zinc-50 shadow-none transition-none placeholder:font-normal placeholder:text-zinc-600 focus:border-0 focus:shadow-none"
                />
                {filter && (
                  <Button tone="ghost" size="sm" onClick={() => setFilter("")}>
                    Clear
                  </Button>
                )}
              </div>
              <p className={cn(MONO, "border-b border-[var(--vi-edge)] px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-500")}>
                Tags · {atGoal}/{realRows.length} at goal
              </p>
              <ul className="vi-scroll overflow-hidden rounded-lg border border-[var(--vi-edge)]">
                {realRows.map((row) => (
                  <CoverRow
                    key={row.tag}
                    tag={row.tag}
                    delta={row.delta}
                    count={row.count}
                    goal={COVERAGE_GOAL}
                    active={row.tag === current?.tag}
                    onSelect={() => setActiveTag(row.tag)}
                  />
                ))}
                {realRows.length === 0 && (
                  <li>
                    <EmptyState
                      title={
                        query
                          ? `No tags match “${filter}”.`
                          : "No tags yet."
                      }
                      body={
                        query
                          ? ""
                          : "Scan the library and the filename rules will create some, or promote words from the candidate queue."
                      }
                    />
                  </li>
                )}
              </ul>
            </div>

            <div className={cn(SHELL, "min-w-0")}>
              <div className="grid gap-3 px-6 py-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-8">
                <div className="shrink-0">
                  <p className="text-6xl font-extrabold tracking-tighter text-zinc-50">
                    {pct}
                    <span className="text-lg font-medium text-zinc-500">%</span>
                  </p>
                  <p className={cn(MONO, "mt-1 text-[11px] tabular-nums text-zinc-500")}>
                    {taggedFiles}/{totalFiles} tagged
                  </p>
                </div>
                <div className="min-w-0">
                  <CoverageTrend snapshots={snapshots} livePct={pct} />
                </div>
              </div>

              <div className="border-t border-[var(--vi-edge)] px-6 py-4">
                <p className={cn(MONO, "text-[10px] uppercase tracking-widest text-zinc-500")}>
                  All tags
                </p>
                <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {realRows.map((row) => (
                    <li key={row.tag}>
                      <button
                        type="button"
                        onClick={() => setActiveTag(row.tag)}
                        className="flex w-full items-center gap-3 rounded-md px-1 py-1 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]"
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
                <div className="border-t border-[var(--vi-edge)] px-6 py-5">
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

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
                        current.count >= COVERAGE_GOAL
                          ? "bg-emerald-400"
                          : "bg-accent-fill shadow-[0_0_12px_color-mix(in_oklab,var(--accent-fill)_40%,transparent)]",
                      )}
                      style={{ width: `${Math.min(1, current.count / COVERAGE_GOAL) * 100}%` }}
                    />
                  </div>

                  <div className="mt-4 border-t border-[var(--vi-edge)] pt-3">
                    <p className={cn(MONO, "text-[10px] uppercase tracking-widest text-zinc-500")}>
                      Files · {memberTotal > 0 ? `${memberPage * MEMBER_PAGE_SIZE + 1}–${memberPage * MEMBER_PAGE_SIZE + members.length} of ${memberTotal}` : "none yet"}
                    </p>
                    <div className="vi-scroll mt-1.5 max-h-64 overflow-y-auto pr-1">
                      <ul className="space-y-1.5">
                        {members.map((file) => (
                          <li key={file.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                            <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                            {file.tags.map((tag) => (
                              <ProvTag
                                key={tag.id}
                                name={tag.name}
                                selected={tag.name === current.tag}
                                provenance={tag.origin}
                                confidence={tag.confidence}
                              />
                            ))}
                          </li>
                        ))}
                      </ul>
                      {members.length === 0 && (
                        <EmptyState title="Nothing carrying this tag yet." body="" />
                      )}
                    </div>
                    {memberTotal > MEMBER_PAGE_SIZE && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="flex-1" />
                        <Button
                          tone="ghost"
                          size="sm"
                          disabled={memberPage === 0}
                          onClick={() => setMemberPage((page) => Math.max(0, page - 1))}
                        >
                          Prev
                        </Button>
                        <Button
                          tone="ghost"
                          size="sm"
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
              <aside className={cn(SHELL, "px-5 py-4")}>
                <h2 className="text-sm font-semibold text-zinc-100">Latest arrivals</h2>

                <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  {missed.length > 0 && (
                    <section>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                        Missed ({missed.length})
                      </p>
                      <ul className="mt-1 border-t border-[var(--vi-edge)]">
                        {missed.map((file) => {
                          return (
                            <li
                              key={file.id}
                              className="flex flex-wrap items-center gap-2.5 gap-y-1 border-b border-white/[0.06] py-2 text-[13px] last:border-0"
                            >
                              <span className="size-1.5 shrink-0 rounded-full bg-accent-fill" />
                              <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                              <Button
                                tone="ghost"
                                size="sm"
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
                                tone="ghost"
                                size="sm"
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
                      <ul className="mt-1 border-t border-[var(--vi-edge)]">
                        {landed.map((file) => {
                          const fired = file.firedRules ?? [];
                          return (
                            <li
                              key={file.id}
                              className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-white/[0.06] py-2 text-[13px] last:border-0"
                            >
                              <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
                              <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                              <span className="flex shrink-0 gap-1">
                                {file.tags.map((tag) => (
                                  <ProvTag
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

          <div className={cn(SHELL, "px-5 py-4")}>
            <QueueCard
              words={queueItems}
              page={queuePage}
              onPage={setQueuePage}
              onPromote={promoteCandidate}
              onDismiss={dismissCandidate}
              hideSummary
            />
          </div>

          <div className={cn(SHELL, "px-5 py-4")}>
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">Filename rules</h2>
              <span className="flex-1" />
              <span className={cn(MONO, "text-[11px] text-zinc-500")}>
                deterministic · manual tags always win
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                tone="secondary"
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

          <div className={cn(SHELL, "px-5 py-4")}>
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
                  tone="processing"
                />
              ) : (
                <StatusBadge status="model not downloaded" tone="unavailable" />
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {!confirmDownload ? (
                <Button
                  tone="secondary"
                  size="sm"
                  disabled={busy || job !== null || model?.state === "ready"}
                  onClick={() => setConfirmDownload(true)}
                >
                  Download model
                </Button>
              ) : (
                <Button
                  tone="secondary"
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
                tone="primary"
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
                  outcomeNote.kind === "failed" ? "text-accent-text" : "text-zinc-500",
                )}
              >
                {outcomeNote.text}
              </p>
            )}
            {job && (
              <div className="mt-3 border-t border-[var(--vi-edge)] pt-3">
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
                    className={cn(MONO, "shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 outline-none transition-colors hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]")}
                  >
                    Cancel
                  </button>
                </div>
                {job.completed !== null && job.total !== null && job.total > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div
                      className="h-full rounded-full bg-accent-fill shadow-[0_0_12px_color-mix(in_oklab,var(--accent-fill)_40%,transparent)] transition-[width] duration-500 motion-reduce:transition-none"
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
          </div>
        </TabPanel>
        </div>
        <div className={cn(page !== "origins" && "hidden")}>
          <TabPanel tabKey="origins">
            <V3TagOrigins />
          </TabPanel>
        </div>
    </div>
  );
}