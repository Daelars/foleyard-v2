"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bug, CheckCircle2, Eye, EyeOff, Info, Search, Trash2 } from "lucide-react";

import { AREAS, DECISIONS, FINDINGS, type Kind, type Severity } from "./audit-data";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const KINDS: Kind[] = ["security", "bug", "dead", "improvement", "decision"];

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "border-destructive/60 bg-destructive/10 text-destructive",
  high: "border-accent-fill/60 bg-accent-fill/10 text-accent-text",
  medium: "border-white/15 bg-white/[0.04] text-zinc-200",
  low: "border-white/10 bg-transparent text-zinc-500",
};

const KIND_ICON: Record<Kind, React.ReactNode> = {
  security: <AlertTriangle className="size-3.5 shrink-0" />,
  bug: <Bug className="size-3.5 shrink-0" />,
  dead: <Trash2 className="size-3.5 shrink-0" />,
  improvement: <Info className="size-3.5 shrink-0" />,
  decision: <CheckCircle2 className="size-3.5 shrink-0" />,
};

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95 ${
        active
          ? "border-accent-fill/50 bg-accent-fill/15 text-accent-text"
          : "border-white/10 bg-white/[0.04] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

export default function AuditPage() {
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [area, setArea] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showDecisions, setShowDecisions] = useState(false);

  const counts = useMemo(() => {
    const by: Record<string, number> = { all: FINDINGS.length };
    for (const level of SEVERITIES) {
      by[level] = FINDINGS.filter((finding) => finding.severity === level).length;
    }
    by.verified = FINDINGS.filter((finding) => finding.verified).length;
    return by;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FINDINGS.filter((finding) => {
      if (severity !== "all" && finding.severity !== severity) {
        return false;
      }
      if (kind !== "all" && finding.kind !== kind) {
        return false;
      }
      if (area !== "all" && finding.area !== area) {
        return false;
      }
      if (verifiedOnly && !finding.verified) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        finding.title.toLowerCase().includes(q) ||
        finding.detail.toLowerCase().includes(q) ||
        finding.files.some((file) => file.toLowerCase().includes(q))
      );
    });
  }, [severity, kind, area, query, verifiedOnly]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-canvas pb-20 font-sans text-zinc-100 antialiased">
      <p className="border-b border-white/10 bg-black/40 px-4 py-1.5 text-center font-mono text-[11px] text-accent-text">
        AUDIT — read-only review. Findings, not fixes. Nothing here changes the app.
      </p>

      <div className="mx-auto w-full max-w-5xl px-4 pt-8 md:px-6">
        <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">Audit</h1>
        <p className="mt-1.5 max-w-2xl text-sm font-medium text-zinc-400">
          Every component reviewed for bugs, dead code, improvements, and the
          decisions behind them. {counts.verified} of {counts.all} findings
          verified firsthand against the source; the rest carry file:line
          evidence from the review pass.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <button
            type="button"
            onClick={() => setSeverity("all")}
            className={`rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-white/20 ${severity === "all" ? "ring-1 ring-inset ring-accent-fill/50" : ""}`}
          >
            <p className="font-mono text-2xl font-bold tabular-nums text-zinc-50">{counts.all}</p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Findings</p>
          </button>
          {SEVERITIES.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setSeverity(severity === level ? "all" : level)}
              className={`rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-white/20 ${severity === level ? "ring-1 ring-inset ring-accent-fill/50" : ""}`}
            >
              <p className="font-mono text-2xl font-bold tabular-nums text-zinc-50">{counts[level]}</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{level}</p>
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex min-w-52 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3">
            <Search className="size-4 shrink-0 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by text, file, or path…"
              aria-label="Filter findings"
              className="w-full bg-transparent py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={kind === "all"} onClick={() => setKind("all")} label="All kinds" />
            {KINDS.map((option) => (
              <FilterChip
                key={option}
                active={kind === option}
                onClick={() => setKind(kind === option ? "all" : option)}
                label={option[0].toUpperCase() + option.slice(1)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={area === "all"} onClick={() => setArea("all")} label="All areas" />
            {AREAS.map((option) => (
              <FilterChip
                key={option}
                active={area === option}
                onClick={() => setArea(area === option ? "all" : option)}
                label={option}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setVerifiedOnly((value) => !value)}
            aria-pressed={verifiedOnly}
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors ${
              verifiedOnly
                ? "border-accent-fill/50 bg-accent-fill/15 text-accent-text"
                : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {verifiedOnly ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            Verified ({counts.verified})
          </button>
          <button
            type="button"
            onClick={() => setShowDecisions((value) => !value)}
            aria-pressed={showDecisions}
            className={`h-9 rounded-xl border px-3 text-xs font-medium transition-colors ${
              showDecisions
                ? "border-accent-fill/50 bg-accent-fill/15 text-accent-text"
                : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-100"
            }`}
          >
            Decisions ({DECISIONS.length})
          </button>
        </div>

        {showDecisions ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
              {DECISIONS.map((decision) => (
                <div key={decision.title} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent-text" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-100">{decision.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{decision.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-2xl font-semibold text-zinc-500">
              Nothing matches.
            </p>
          ) : (
            filtered.map((finding) => (
              <article
                key={finding.id}
                className={`rounded-2xl border p-4 transition-colors ${SEVERITY_STYLE[finding.severity]}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-bold">{finding.id}</span>
                  <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest opacity-80">
                    {KIND_ICON[finding.kind]}
                    {finding.kind}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">
                    {finding.severity} · {finding.area}
                  </span>
                  <span className="flex-1" />
                  {finding.verified ? (
                    <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-emerald-300">
                      Verified
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      Reported
                    </span>
                  )}
                </div>
                <h2 className="mt-1.5 text-[15px] font-semibold text-zinc-50">{finding.title}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">{finding.detail}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {finding.files.map((file) => (
                    <code
                      key={file}
                      className="rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400"
                    >
                      {file}
                    </code>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
