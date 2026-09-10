// PROTOTYPE ONLY — variant "current": the actual shipped AutoTagBoard,
// mounted live, with the findings rail beneath it. Actions here are REAL
// (they hit the dev server's extension APIs) — the other three variants are
// static mock-data sketches.

"use client";

import { useState } from "react";

import { AutoTagBoard } from "@/components/AutoTagBoard/board";
import { FindingPin } from "./notes";

const FINDINGS: Array<{ n: number; where: string; title: string; body: string }> = [
  {
    n: 1,
    where: "Candidate queue / pagination",
    title: "Ghost chips read as metadata, not actions.",
    body: "Promote, Dismiss, Prev and Next render at 10px mono in zinc-500 — dimmer than the 13px body text in the same row. The page's verbs disappear into the furniture, and by skipping the shared Button they also lose the focus ring every other action has.",
  },
  {
    n: 2,
    where: "Candidate queue",
    title: "Constructive and destructive are identical.",
    body: "Promote grows the vocabulary CLAP matches against; Dismiss throws the word away. Same chip, same colour, 8px apart — nothing separates “more of this” from “never again”.",
  },
  {
    n: 3,
    where: "Filename rules / Semantic tagging",
    title: "The verb is the quietest thing in the panel.",
    body: "Both run actions are 11px mono ghosts sitting under 14px semibold titles. Scanning for what you can do surfaces headers, footnotes and log lines first.",
  },
  {
    n: 4,
    where: "Semantic tagging",
    title: "Status is prose you have to parse.",
    body: "“tagged 0, attached 0, skipped 500” buries the one fact that matters — nothing got tagged — in the middle of a sentence. Structured chips would make the zero scannable.",
  },
  {
    n: 5,
    where: "All three panels",
    title: "Right-floated notes take headline rank.",
    body: "“deterministic · manual tags always win”, “explicit accept only” and “ready” are constraints, but they sit in the header's prime spot and read as competing mini-titles. The origins panel's eyebrow-under-title pattern already solves this.",
  },
  {
    n: 6,
    where: "Tag origins tab",
    title: "The pills invent a third selection idiom.",
    body: "The workspace tabs use the line variant; the origins filter hand-rolls a segmented control (bg-white/10 + bold active). The shared Tabs default variant — bg-white/5 tray, accent-active trigger — exists for exactly this shape.",
  },
  {
    n: 7,
    where: "Filename rules + Semantic tagging",
    title: "One workflow, two orphan panels.",
    body: "Rules and CLAP both mean “run a pass over the same untagged set” — same anatomy (name, constraint, action, status) but different layouts, and the count that justifies both actions sits under only one of them, below the button.",
  },
  {
    n: 8,
    where: "Semantic tagging",
    title: "Guidance lives away from its subject.",
    body: "“Nothing cleared the bar…” is advice about the queue, rendered in the semantic panel as a fifth mono line. It belongs on the queue, styled as a callout, shown when a run comes back empty.",
  },
];

export function VariantCurrent() {
  const [page, setPage] = useState<"coverage" | "origins">("coverage");

  return (
    <div className="space-y-3">
      {/* The shipped board, untouched — rail, coverage chart, arrivals,
          queue and both run panels exactly as they exist today */}
      <AutoTagBoard enabled page={page} onPageChange={setPage} />

      {/* Findings rail — the reasoning. Pins key findings to the section
          names above (the live board can't be injected with pins). */}
      <aside className="rounded-xl border border-dashed border-amber-400/40 bg-amber-400/[0.04] px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-amber-300">
          findings &amp; reasoning · the board above is live — its buttons run real commands
        </p>
        <ol className="mt-3 space-y-2.5">
          {FINDINGS.map((finding) => (
            <li key={finding.n} className="flex gap-2.5 text-[12px] leading-relaxed">
              <FindingPin n={finding.n} className="mt-0.5" />
              <p className="text-zinc-300">
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  {finding.where} ·{" "}
                </span>
                <span className="font-semibold text-zinc-100">{finding.title}</span> {finding.body}
              </p>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
