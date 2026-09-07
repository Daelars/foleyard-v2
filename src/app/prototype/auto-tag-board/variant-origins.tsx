// PROTOTYPE ONLY — throwaway origins variant for /prototype/auto-tag-board.
// Answers: how do manual / deterministic / semantic_ai origins look next to
// each other, and where does "find similar" live? All origins and CLAP
// outputs below are mock. Nothing here touches the app.
//
// Styling follows variant-console: flat white/[0.03] panels, zinc text,
// mono micro-labels, small badges. No shadcn cards.
"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { filenameMatchesToken, tagsForFilename } from "../auto-tag/data";
import type { MockFile, TagRule } from "../auto-tag/data";
import { cn } from "@/lib/utils";

const MONO = "font-mono";

type Origin = "manual" | "deterministic" | "semantic";

// Demo-only: pretend the user hand-added these.
const MANUAL: Record<string, string[]> = {
  f01: ["thunder"],
  f03: ["gravel"],
  f08: ["night"],
};

// Demo-only: pretend CLAP suggested these with confidence.
const SEMANTIC: Record<string, { tag: string; confidence: number }[]> = {
  f06: [{ tag: "leather", confidence: 0.71 }],
  f07: [{ tag: "glass", confidence: 0.83 }],
  f04: [{ tag: "creak", confidence: 0.64 }],
};

type ShownTag = { tag: string; origin: Origin; confidence: number | null };

function shownTags(file: MockFile, rules: TagRule[], promoted: Record<string, string[]>): ShownTag[] {
  const out: ShownTag[] = [];
  const seen = new Set<string>();
  const push = (tag: string, origin: Origin, confidence: number | null) => {
    if (seen.has(tag)) return;
    seen.add(tag);
    out.push({ tag, origin, confidence });
  };
  // Manual wins: listed first, deterministic never overrides it.
  for (const tag of MANUAL[file.id] ?? []) push(tag, "manual", null);
  for (const tag of promoted[file.id] ?? []) push(tag, "deterministic", null);
  for (const tag of tagsForFilename(file.filename, rules)) {
    if (MANUAL[file.id]?.includes(tag)) continue; // manual already claimed it
    push(tag, "deterministic", null);
  }
  for (const tag of file.tags) {
    if (seen.has(tag)) continue;
    push(tag, "deterministic", null);
  }
  for (const s of SEMANTIC[file.id] ?? []) push(s.tag, "semantic", s.confidence);
  return out;
}

function OriginMark({ origin, confidence }: { origin: Origin; confidence: number | null }) {
  if (origin === "manual")
    return (
      <span className={cn(MONO, "text-[10px] font-bold text-zinc-300")} title="Added by hand">
        M
      </span>
    );
  if (origin === "deterministic")
    return (
      <span className={cn(MONO, "text-[10px] font-bold text-accent-text")} title="Fired by a filename rule">
        D
      </span>
    );
  return (
    <span
      className={cn(MONO, "text-[10px] font-bold text-emerald-400")}
      title={`Suggested by CLAP at ${confidence}`}
    >
      AI{confidence == null ? "" : ` ${confidence.toFixed(2)}`}
    </span>
  );
}

const FILTERS = ["all", "manual", "deterministic", "semantic"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  manual: "Manual",
  deterministic: "Deterministic",
  semantic: "Semantic AI",
};

export function VariantOrigins({ files, rules }: { files: MockFile[]; rules: TagRule[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [promoted, setPromoted] = useState<Record<string, string[]>>({});
  const [similarFor, setSimilarFor] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      files.map((file) => {
        const tags = shownTags(file, rules, promoted);
        const fired = rules.filter((rule) => filenameMatchesToken(file.filename, rule.tok));
        return { file, tags, fired };
      }),
    [files, rules, promoted],
  );

  const visible =
    filter === "all" ? rows : rows.filter((row) => row.tags.some((t) => t.origin === filter));

  // Missed tokens are the candidate queue: words no rule fires on.
  const candidates = useMemo(() => {
    const seen = new Map<string, string>();
    for (const { file } of rows) {
      for (const w of file.filename.toLowerCase().split(/[^a-z0-9]+/)) {
        if (!w || w === "wav" || w.length < 3) continue;
        if (rules.some((rule) => filenameMatchesToken(w, rule.tok))) continue;
        if (!seen.has(w)) seen.set(w, file.filename);
      }
    }
    return [...seen.entries()].slice(0, 6);
  }, [rows, rules]);

  const similar = useMemo(() => {
    if (!similarFor) return [];
    const target = rows.find((row) => row.file.id === similarFor);
    if (!target) return [];
    const tags = new Set(target.tags.map((t) => t.tag));
    return rows
      .filter((row) => row.file.id !== similarFor && row.tags.some((t) => tags.has(t.tag)))
      .slice(0, 3);
  }, [rows, similarFor]);

  const targetName = rows.find((row) => row.file.id === similarFor)?.file.filename;

  const counts = {
    manual: rows.filter((r) => r.tags.some((t) => t.origin === "manual")).length,
    deterministic: rows.filter((r) => r.tags.some((t) => t.origin === "deterministic")).length,
    semantic: rows.filter((r) => r.tags.some((t) => t.origin === "semantic")).length,
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Origins</h2>
          <span className="flex-1" />
          <span className={cn(MONO, "text-[11px] tabular-nums text-zinc-500")}>
            {files.length} files · <span className="text-zinc-300">{counts.manual} manual</span> ·{" "}
            <span className="text-accent-text">{counts.deterministic} rule</span> ·{" "}
            <span className="text-emerald-400">{counts.semantic} AI</span>
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                MONO,
                "rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-white/[0.06]",
                filter === f ? "bg-white/10 font-bold text-zinc-100" : "text-zinc-500",
              )}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>

        <ul className="mt-2 border-t border-white/10">
          {visible.map(({ file, tags, fired }) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-white/5 py-2 text-[13px] last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
              <span className="flex shrink-0 gap-1">
                {tags.map((t) => (
                  <Badge key={t.tag} variant="secondary" className="flex h-4 items-center gap-1 px-1.5 text-[10px]">
                    #{t.tag}
                    <OriginMark origin={t.origin} confidence={t.confidence} />
                  </Badge>
                ))}
              </span>
              {tags.length === 0 && <span className="text-[12px] text-zinc-600">untagged</span>}
              <button
                type="button"
                onClick={() => setSimilarFor(similarFor === file.id ? null : file.id)}
                className={cn(
                  MONO,
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-white/[0.06]",
                  similarFor === file.id ? "font-bold text-zinc-100" : "text-zinc-500",
                )}
              >
                {similarFor === file.id ? "Hide similar" : "Find similar"}
              </button>
              {fired.length > 0 && (
                <span className={cn(MONO, "w-full pl-4 text-[11px] text-zinc-600")}>
                  fired {fired.map((rule) => `"${rule.tok}"`).join(", ")}
                </span>
              )}
            </li>
          ))}
        </ul>

        <p className={cn(MONO, "mt-2 text-[11px] text-zinc-600")}>
          f01 thunder shows M even though the thunder rule fires: manual wins. Semantic tags show
          confidence and stay revertible by origin.
        </p>
      </div>

      {similarFor && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">Similar</h2>
            <span className="flex-1" />
            <span className={cn(MONO, "truncate text-[11px] text-zinc-500")}>{targetName}</span>
          </div>
          <p className={cn(MONO, "mt-1 text-[10px] uppercase tracking-widest text-zinc-500")}>
            Mock · shared-tag stand-in for embedding search
          </p>
          <ul className="mt-1 border-t border-white/10">
            {similar.map(({ file }) => (
              <li
                key={file.id}
                className="border-b border-white/5 py-2 text-[13px] text-zinc-200 last:border-0"
              >
                {file.filename}
              </li>
            ))}
            {similar.length === 0 && (
              <li className="py-2 text-[13px] text-zinc-500">
                Nothing close. Real search would use vectors.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Candidate queue</h2>
          <span className="flex-1" />
          <span className={cn(MONO, "text-[11px] text-zinc-500")}>explicit accept only</span>
        </div>
        <ul className="mt-1 border-t border-white/10">
          {candidates.map(([word, example]) => (
            <li
              key={word}
              className="flex flex-wrap items-center gap-2 border-b border-white/5 py-2 text-[13px] last:border-0"
            >
              <code className="font-mono text-[13px] font-bold text-zinc-100">{word}</code>
              <span className="min-w-0 flex-1 truncate text-zinc-600">from {example}</span>
              <button
                type="button"
                onClick={() => {
                  const owner = files.find((f) => f.filename === example);
                  if (!owner) return;
                  setPromoted((prev) => ({ ...prev, [owner.id]: [...(prev[owner.id] ?? []), word] }));
                }}
                className={cn(
                  MONO,
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-100",
                )}
              >
                Promote to tag
              </button>
            </li>
          ))}
          {candidates.length === 0 && (
            <li className="py-2 text-[13px] text-zinc-500">Queue empty. Every word is covered.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
