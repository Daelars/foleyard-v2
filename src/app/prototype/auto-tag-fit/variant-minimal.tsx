// PROTOTYPE ONLY — variant "minimal": both cuts applied. The candidate queue
// collapses to a summary with its top 3 and an expander (one place, Coverage
// only — the origins-tab copy is gone), and the Tag origins tab is gone
// entirely: M/D/AI marks and the filter stay in the library rows, bulk remove
// hides in the command bar's Manage menu, Find similar moves to the row menu.

"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Download, Ellipsis, ScanText, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BoardScaffold } from "./scaffold";
import { VariantNote } from "./notes";
import {
  LAST_CLAP_RUN,
  LAST_RULES_RUN,
  QUEUE,
  QUEUE_COMPACT,
  QUEUE_TOTAL,
  TOTAL_FILES,
  UNTAGGED_FILES,
  fmt,
} from "./data";

const PANEL = "rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4";
const MONO = "font-mono";
const EYEBROW = "font-mono text-[10px] uppercase tracking-widest text-zinc-500";

function PinnedCommandBar() {
  const [manageOpen, setManageOpen] = useState(false);
  return (
    <section className={PANEL} aria-label="Auto-tag commands">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="shrink-0">
          <p className="font-mono text-3xl font-extrabold tabular-nums tracking-tight text-zinc-50">{fmt(UNTAGGED_FILES)}</p>
          <p className={cn(EYEBROW, "mt-0.5")}>untagged of {fmt(TOTAL_FILES)}</p>
        </div>
        <div className="hidden h-10 w-px bg-white/10 sm:block" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <span className={cn(MONO, "text-[11px] text-zinc-500")}>ready</span>
          <Button variant="ghost" size="sm" disabled className="h-9 rounded-xl px-3 text-xs text-zinc-600">
            <Download className="size-4" />
            Download model
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-2 rounded-xl px-3 text-xs">
            <ScanText className="size-4" />
            Tag with filename rules
          </Button>
          <Button size="sm" className="h-9 gap-2 rounded-xl px-3 text-xs">
            <Sparkles className="size-4" />
            Analyze with CLAP
          </Button>
          <span className="relative">
            <Button variant="ghost" size="icon" className="size-9 rounded-xl text-zinc-400" onClick={() => setManageOpen((v) => !v)} aria-expanded={manageOpen} aria-label="Manage auto-tag" title="Manage auto-tag">
              <Ellipsis className="size-4" />
            </Button>
            {manageOpen && (
              <span className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-white/10 bg-zinc-950 p-1 shadow-xl">
                <span className="block px-2.5 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  Manual tags preserved
                </span>
                <Button variant="ghost" size="xs" className="w-full justify-start text-zinc-300">
                  Remove deterministic tags
                </Button>
                <Button variant="ghost" size="xs" className="w-full justify-start text-zinc-300">
                  Remove semantic AI tags
                </Button>
              </span>
            )}
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3">
        <span className={EYEBROW}>last runs</span>
        <Badge variant="outline" className="h-6 gap-1.5 px-2.5 font-mono text-[10px] tabular-nums">
          <span className="inline-block size-1.5 rounded-full bg-chart-3" />
          rules · {LAST_RULES_RUN.at} — {fmt(LAST_RULES_RUN.tagged)} tagged
        </Badge>
        <Badge variant="outline" className="h-6 gap-1.5 px-2.5 font-mono text-[10px] tabular-nums">
          <span className="inline-block size-1.5 rounded-full bg-amber-400" />
          CLAP · {LAST_CLAP_RUN.at} — {LAST_CLAP_RUN.tagged} tagged · {LAST_CLAP_RUN.skipped} skipped
        </Badge>
      </div>
    </section>
  );
}

function QueueMinimized() {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? QUEUE : QUEUE_COMPACT;
  if (QUEUE.length === 0) {
    return (
      <section className={PANEL}>
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Candidate queue</h2>
          <span className="flex-1" />
          <p className={cn(EYEBROW)}>every word is covered</p>
        </div>
      </section>
    );
  }
  return (
    <section className={PANEL}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">
          Candidate queue{" "}
          <span className="font-mono text-[11px] font-normal tabular-nums text-zinc-500">· {QUEUE_TOTAL}</span>
        </h2>
        <span className="flex-1" />
        <p className={cn(EYEBROW, "flex items-center gap-1.5")}>
          <span className="inline-block size-1.5 rounded-full bg-amber-400" />
          0 of 500 cleared the bar — promoting grows the CLAP vocabulary
        </p>
      </div>
      <ul className="mt-2 border-t border-white/10">
        {shown.map((item) => (
          <li key={item.word} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-2 text-[13px] last:border-0">
            <span className="min-w-0 flex-1 truncate text-zinc-200">{item.line}</span>
            <Button variant="outline" size="xs" className="border-accent-fill/25 text-accent-text hover:border-accent-fill/40 hover:bg-accent-fill/10 hover:text-accent-text">
              <Check />
              Promote
            </Button>
            <Button variant="ghost" size="xs" className="text-zinc-500">
              <X />
              Dismiss
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-mono text-[11px] tabular-nums text-zinc-500">
          {shown.length} of {QUEUE_TOTAL} shown
        </span>
        <span className="flex-1" />
        <Button variant="ghost" size="xs" className="text-zinc-400" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronUp /> : <ChevronDown />}
          {expanded ? "Show less" : "Show all"}
        </Button>
      </div>
    </section>
  );
}

export function VariantMinimal() {
  return (
    <div className="space-y-3">
      <VariantNote title="what changed — queue collapsed, origins tab removed">
        <p>
          Queue: one summary (`{QUEUE_TOTAL}`) with the top {QUEUE_COMPACT.length} and a Show all
          expander, Promote accent-split from Dismiss, Coverage only. Origins tab: deleted — M/D/AI
          marks and the filter stay in the library rows (title tooltips teach the language), bulk
          remove hides in the command bar&apos;s Manage menu, Find similar moves to the row menu.
        </p>
      </VariantNote>

      {/* No workspace tabs — single Coverage view */}
      <PinnedCommandBar />
      <BoardScaffold>
        <QueueMinimized />
      </BoardScaffold>
    </div>
  );
}
