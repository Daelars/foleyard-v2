"use client";

// app-v3 adapter for the tag origins tab: same listing/filter/similar/remove
// contract as the original origins panel, restyled in the variant I
// language (ProvTag provenance, I dialogs for removal, I buttons/shells).
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";

import type { TagOrigin } from "@yard-core";
import {
  Alert,
  Button,
  Dialog,
  DialogDescription,
  DialogDivider,
  DialogFooter,
  DialogTitle,
  EmptyState,
  ProvTag,
  SkeletonRow,
} from "@/components/variant-i";
import { cn } from "@/lib/utils";

type Attachment = { id: string; name: string; origin: TagOrigin; confidence: number | null };
type OriginFile = {
  id: string;
  filename: string;
  tags: Attachment[];
  firedRules: Array<{ token: string; tags: string[] }>;
};
type Summary = {
  total: number;
  origins: Record<TagOrigin, number>;
  matching: number;
};
type SimilarState =
  | { kind: "loading"; source: OriginFile }
  | { kind: "unavailable"; source: OriginFile }
  | { kind: "empty"; source: OriginFile }
  | { kind: "ready"; source: OriginFile; matches: Array<{ fileId: string; filename: string; score: number }> }
  | { kind: "error"; source: OriginFile; message: string };

type CommandResult = { ok: true; value: Record<string, unknown> } | { ok: false; message: string };

const SHELL = "rounded-xl border border-[var(--vi-edge)] bg-white/[0.02]";

const MONO = "font-mono";

async function command(commandId: string, input: unknown = {}, fileIds: string[] = []): Promise<CommandResult> {
  const response = await fetch("/api/extensions-v2/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ extensionId: "auto-tag-v2", commandId, input, selection: { fileIds } }),
  });
  const body = (await response.json().catch(() => null)) as {
    outcome?: { kind?: string; value?: Record<string, unknown> };
    error?: { message?: string };
  } | null;
  if (!response.ok || body?.outcome?.kind !== "immediate") {
    return { ok: false, message: body?.error?.message ?? `Command failed (${response.status}).` };
  }
  return { ok: true, value: body.outcome.value ?? {} };
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

const FILTERS: Array<{ value: "all" | TagOrigin; label: string }> = [
  { value: "all", label: "All" },
  { value: "manual", label: "Manual" },
  { value: "deterministic", label: "Deterministic" },
  { value: "semantic_ai", label: "Semantic AI" },
];

export function V3TagOrigins() {
  const [filter, setFilter] = useState<"all" | TagOrigin>("all");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [files, setFiles] = useState<OriginFile[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<SimilarState | null>(null);
  const [queueLines, setQueueLines] = useState<string[]>([]);
  const [queueWords, setQueueWords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmOrigin, setConfirmOrigin] = useState<"deterministic" | "semantic_ai" | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const load = useCallback(async (cursor = "", append = false) => {
    setLoading(true);
    setError(null);
    const result = await command("auto-tag-v2.list-origins", { origin: filter, cursor, limit: 50 });
    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }
    const parsedSummary = parseJson<Summary>(result.value.summary);
    const entries = Array.isArray(result.value.entries)
      ? result.value.entries.map((entry) => parseJson<OriginFile>(entry)).filter((entry): entry is OriginFile => entry !== null)
      : [];
    if (!parsedSummary) {
      setError("The origins response was incomplete. Try again.");
    } else {
      setSummary(parsedSummary);
      setFiles((current) => append ? [...current, ...entries] : entries);
      setNextCursor(typeof result.value.nextCursor === "string" ? result.value.nextCursor : "");
    }
    const queued = await command("auto-tag-v2.list-candidates", {});
    if (queued.ok) {
      const words = Array.isArray(queued.value.words)
        ? queued.value.words.filter((word): word is string => typeof word === "string")
        : [];
      const lines = Array.isArray(queued.value.lines)
        ? queued.value.lines.filter((line): line is string => typeof line === "string")
        : [];
      setQueueWords(words);
      setQueueLines(lines);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function promoteCandidate(word: string) {
    setBusy(true);
    const result = await command("auto-tag-v2.promote-candidate", { word });
    if (!result.ok) {
      setBusy(false);
      toast.error(result.message);
      return;
    }
    toast.success(`Promoted “${word}” to a tag.`);
    setBusy(false);
    await load();
  }

  async function dismissCandidate(word: string) {
    setBusy(true);
    const result = await command("auto-tag-v2.dismiss-candidate", { word });
    if (!result.ok) {
      setBusy(false);
      toast.error(result.message);
      return;
    }
    setBusy(false);
    await load();
  }

  async function findSimilar(file: OriginFile) {
    setSimilar({ kind: "loading", source: file });
    const result = await command("auto-tag-v2.find-similar", { topN: 20 }, [file.id]);
    if (!result.ok) {
      setSimilar({ kind: "error", source: file, message: result.message });
      return;
    }
    if (result.value.unavailable === true) {
      setSimilar({ kind: "unavailable", source: file });
      return;
    }
    const matches = Array.isArray(result.value.matches)
      ? result.value.matches.map((value) => parseJson<{ fileId: string; filename: string; score: number }>(value)).filter((value): value is { fileId: string; filename: string; score: number } => value !== null)
      : [];
    setSimilar(matches.length ? { kind: "ready", source: file, matches } : { kind: "empty", source: file });
  }

  async function removeOrigin(origin: "deterministic" | "semantic_ai") {
    const result = await command("auto-tag-v2.remove-by-origin", { origin, confirm: true });
    if (!result.ok) return toast.error(result.message);
    toast.success(`Removed ${Number(result.value.removed ?? 0)} ${origin === "semantic_ai" ? "semantic AI" : "deterministic"} attachments.`);
    await load();
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 space-y-3">
        <div className={cn(SHELL, "px-5 py-4")}>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">Origins</h2>
            <span className="flex-1" />
            {summary && (
              <span className={cn(MONO, "text-[11px] tabular-nums text-zinc-500")}>
                {summary.total} files · <span className="text-zinc-300">{summary.origins.manual} manual</span> ·{" "}
                <span className="text-accent-text">{summary.origins.deterministic} rule</span> ·{" "}
                <span className="text-emerald-400">{summary.origins.semantic_ai} AI</span>
              </span>
            )}
          </div>
          <p className={cn(MONO, "mt-1 text-[10px] uppercase tracking-widest text-zinc-500")}>
            A file can count in more than one origin category
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter files by tag origin">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
                className={cn(
                  "rounded-md border px-2 py-1 font-mono text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
                  filter === item.value
                    ? "border-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] font-bold text-zinc-50"
                    : "border-transparent text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="space-y-3">
            <Alert tone="error" title="Could not load tag origins" body={error} />
            <Button tone="secondary" size="sm" onClick={() => void load()}>Try again</Button>
          </div>
        ) : loading && files.length === 0 ? (
          <div className={cn(SHELL, "px-5 py-4")}>
            <p className={cn(MONO, "text-[11px] text-zinc-500")}>Loading origins…</p>
            <div className="mt-3 grid gap-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className={cn(SHELL, "px-5 py-4")}>
            <EmptyState title="No files match this origin." body="" />
          </div>
        ) : (
          <div className={cn(SHELL, "px-5 py-4")}>
            <ul className="border-t border-[var(--vi-edge)]">
              {files.map((file) => (
                <li key={file.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-white/[0.06] py-2 text-[13px] last:border-0">
                  <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
                  <span className="flex shrink-0 gap-1">
                    {file.tags.length ? file.tags.map((tag) => <ProvTag key={`${tag.id}-${tag.origin}`} name={tag.name} provenance={tag.origin} confidence={tag.confidence} />) : <span className="text-[12px] text-zinc-600">untagged</span>}
                  </span>
                  <Button
                    tone="ghost"
                    size="sm"
                    onClick={() => void findSimilar(file)}
                  >
                    Find similar
                  </Button>
                  {file.firedRules.length > 0 && <p className={cn(MONO, "w-full pl-4 text-[11px] text-zinc-600")}>fired {file.firedRules.map((rule) => `“${rule.token}” → ${rule.tags.map((tag) => `#${tag}`).join(", ")}`).join("; ")}</p>}
                </li>
              ))}
            </ul>
            {nextCursor && <div className="pt-3 text-center"><Button tone="secondary" size="sm" disabled={loading} onClick={() => void load(nextCursor, true)}>{loading ? "Loading…" : "Load more"}</Button></div>}
          </div>
        )}

        <div className={cn(SHELL, "px-5 py-4")}>
          <h2 className="text-sm font-semibold text-zinc-100">Candidate queue</h2>
          <ul className="mt-1 border-t border-[var(--vi-edge)]">
            {queueLines.map((line, index) => (
              <li
                key={`${queueWords[index]}-${index}`}
                className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] py-2 text-[13px] last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-zinc-200">{line}</span>
                <Button
                  tone="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void promoteCandidate(queueWords[index] ?? "")}
                >
                  Promote to tag
                </Button>
                <Button
                  tone="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void dismissCandidate(queueWords[index] ?? "")}
                >
                  Dismiss
                </Button>
              </li>
            ))}
            {queueLines.length === 0 && (
              <li className="py-2 text-[13px] text-zinc-500">Queue empty. Every word is covered.</li>
            )}
          </ul>
        </div>
      </section>

      <aside className="space-y-3">
        <div className={cn(SHELL, "px-5 py-4")}>
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">Similar</h3>
            <span className="flex-1" />
            {similar && <span className="truncate font-mono text-[11px] text-zinc-500">{similar.source.filename}</span>}
          </div>
          {!similar ? <p className={cn(MONO, "mt-2 text-[11px] text-zinc-600")}>Choose Find Similar on any file.</p> : (
            <div className="mt-1 border-t border-[var(--vi-edge)]">
              {similar.kind === "loading" && <p className="py-2 text-[13px] text-zinc-500">Searching audio embeddings…</p>}
              {similar.kind === "unavailable" && <p className="py-2 text-[13px] text-zinc-500">Similarity unavailable until audio analysis completes.</p>}
              {similar.kind === "empty" && <p className="py-2 text-[13px] text-zinc-500">Analysis is available, but no similar files met the threshold.</p>}
              {similar.kind === "error" && <p role="alert" className="py-2 text-[13px] text-accent-text">{similar.message}</p>}
              {similar.kind === "ready" && <ul>{similar.matches.map((match) => <li key={match.fileId} className="flex gap-2 border-b border-white/[0.06] py-2 text-[13px] text-zinc-200 last:border-0"><span className="min-w-0 flex-1 truncate">{match.filename}</span><span className={cn(MONO, "text-[11px] text-zinc-500")}>{Math.round(match.score * 100)}%</span></li>)}</ul>}
            </div>
          )}
        </div>
        <div className={cn(SHELL, "px-5 py-4")}>
          <h3 className="text-sm font-semibold text-zinc-100">Remove automatic tags</h3>
          <p className={cn(MONO, "mt-1 text-[11px] text-zinc-600")}>Manual attachments are always preserved.</p>
          <div className="mt-3 flex flex-col gap-2">
            {(["deterministic", "semantic_ai"] as const).map((origin) => (
              <Button key={origin} tone="secondary" size="sm" onClick={() => setConfirmOrigin(origin)}>
                Remove {origin === "semantic_ai" ? "semantic AI" : "deterministic"} tags
              </Button>
            ))}
          </div>
        </div>
      </aside>

      <Dialog
        open={confirmOrigin !== null}
        onClose={() => setConfirmOrigin(null)}
        labelledBy={titleId}
        describedBy={descriptionId}
      >
        <DialogTitle id={titleId}>Remove automatic attachments?</DialogTitle>
        <DialogDescription id={descriptionId}>
          This removes every {confirmOrigin === "semantic_ai" ? "semantic AI" : "deterministic"} attachment. Manual tags remain.
        </DialogDescription>
        <DialogDivider />
        <DialogFooter>
          <Button tone="ghost" size="sm" onClick={() => setConfirmOrigin(null)}>
            Cancel
          </Button>
          <Button
            tone="danger"
            size="sm"
            onClick={() => {
              const origin = confirmOrigin;
              setConfirmOrigin(null);
              if (origin) void removeOrigin(origin);
            }}
          >
            Remove
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}