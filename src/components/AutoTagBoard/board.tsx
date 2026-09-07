"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { TagOrigin } from "@yard-core";

import { cn } from "@/lib/utils";
import { TagOriginMark } from "@/components/FileTable/tag-origin-mark";

/**
 * Auto-tag board with live data (#197). Coverage, tag rail, untagged
 * files, candidate queue, find-similar, and CLAP controls read the
 * files API and the auto-tag-v2 commands; every write goes through
 * the commands. Self-fetches pages (capped) because the board
 * aggregates library-wide, unlike the paged file table.
 */

export const BOARD_FILE_CAP = 2000;
const PAGE_SIZE = 500;

type BoardTag = {
  id: string;
  name: string;
  origin?: TagOrigin | null;
  confidence?: number | null;
};

type BoardFile = {
  id: string;
  filename: string;
  tags: BoardTag[];
};

type QueueState = { words: string[]; lines: string[] };
type ModelState = {
  state: "ready" | "not-downloaded" | "downloading";
  downloadedBytes: number;
  totalBytes: number;
  backendAvailable: boolean;
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

type CommandValue =
  | { ok: true; value: unknown }
  | { ok: false; message: string };

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

const MONO = "font-mono";

export function AutoTagBoard({ enabled }: { enabled: boolean }) {
  const [files, setFiles] = useState<BoardFile[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<QueueState>({ words: [], lines: [] });
  const [model, setModel] = useState<ModelState | null>(null);
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
      setFiles(loaded.slice(0, BOARD_FILE_CAP));
      setTruncated(capped);

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

  const tagged = useMemo(() => files.filter((file) => file.tags.length > 0), [files]);
  const untagged = useMemo(() => files.filter((file) => file.tags.length === 0), [files]);
  const pct = files.length === 0 ? 0 : Math.round((tagged.length / files.length) * 100);

  const tagRows = useMemo(() => {
    const byTag = new Map<string, { count: number; manual: number; rule: number; ai: number }>();
    for (const file of files) {
      for (const tag of file.tags) {
        const entry = byTag.get(tag.name) ?? { count: 0, manual: 0, rule: 0, ai: 0 };
        entry.count += 1;
        if (tag.origin === "manual") entry.manual += 1;
        else if (tag.origin === "deterministic") entry.rule += 1;
        else if (tag.origin === "semantic_ai") entry.ai += 1;
        byTag.set(tag.name, entry);
      }
    }
    return [...byTag.entries()]
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [files]);

  const current = activeTag ? tagRows.find((row) => row.name === activeTag) : tagRows[0];
  const members = useMemo(
    () => (current ? files.filter((file) => file.tags.some((tag) => tag.name === current.name)) : []),
    [files, current],
  );

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
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        <p className={cn(MONO, "border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-500")}>
          Tags · {tagRows.length}
        </p>
        <ul>
          {tagRows.map((row) => (
            <li key={row.name}>
              <button
                type="button"
                onClick={() => setActiveTag(row.name)}
                className={cn(
                  "flex w-full flex-col gap-1.5 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/[0.04]",
                  row.name === current?.name && "bg-accent-fill/10 shadow-[inset_3px_0_0_var(--accent-fill)]",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold text-zinc-100">
                    #{row.name}
                  </span>
                  <span className={cn(MONO, "shrink-0 text-[12px] tabular-nums text-zinc-300")}>
                    {row.count}
                  </span>
                </span>
                <span className={cn(MONO, "text-[10px] text-zinc-600")}>
                  {row.manual > 0 && `${row.manual}M `}
                  {row.rule > 0 && `${row.rule}D `}
                  {row.ai > 0 && `${row.ai}AI`}
                  {row.manual + row.rule + row.ai === 0 && "untracked origin"}
                </span>
              </button>
            </li>
          ))}
          {tagRows.length === 0 && (
            <li className="px-4 py-3 text-[13px] text-zinc-500">No tags yet.</li>
          )}
        </ul>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-5">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-6xl font-extrabold tracking-tighter text-zinc-50">
              {pct}
              <span className="text-lg font-medium text-zinc-500">%</span>
            </p>
            <p className={cn(MONO, "text-[11px] tabular-nums text-zinc-500")}>
              {tagged.length}/{files.length} tagged · {untagged.length} to go
              {truncated && ` · first ${BOARD_FILE_CAP} files`}
            </p>
            <span className="flex-1" />
            <p className={cn(MONO, "text-[11px] text-zinc-500")}>
              {model
                ? `CLAP ${model.state}${model.backendAvailable ? "" : " · no runtime"}`
                : "CLAP unknown"}
            </p>
          </div>

          {current && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <h2 className="text-2xl font-extrabold tracking-tight text-zinc-50">
                #{current.name}
              </h2>
              <ul className="mt-2 space-y-1.5">
                {members.slice(0, 20).map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                    {file.tags
                      .filter((tag) => tag.name === current.name)
                      .map((tag) => (
                        <TagOriginMark
                          key={tag.id}
                          origin={tag.origin}
                          confidence={tag.confidence}
                        />
                      ))}
                  </li>
                ))}
              </ul>
              {members.length > 20 && (
                <p className={cn(MONO, "mt-1 text-[11px] text-zinc-600")}>
                  +{members.length - 20} more
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">Needs attention</h2>
            <span className="flex-1" />
            <span className={cn(MONO, "text-[11px] text-zinc-500")}>
              {untagged.length} untagged
            </span>
          </div>
          <ul className="mt-1 border-t border-white/10">
            {untagged.slice(0, 20).map((file) => (
              <li
                key={file.id}
                className="flex flex-wrap items-center gap-2 border-b border-white/5 py-2 text-[13px] last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
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
            ))}
            {untagged.length === 0 && (
              <li className="py-2 text-[13px] text-zinc-500">Everything carries a tag.</li>
            )}
          </ul>
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
              disabled={busy || untagged.length === 0}
              onClick={() =>
                void act("Semantic tagging", async () => {
                  const submitted = await submitJob("auto-tag-v2.tag-semantic", {
                    fileIds: untagged.slice(0, 500).map((file) => file.id),
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
    </div>
  );
}
