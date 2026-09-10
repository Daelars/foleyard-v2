// PROTOTYPE ONLY — variant "compact": the command-bar idea squeezed into one
// viewport. Same command bar (count + both passes + last-run chips), same
// rail/chart/arrivals and queue — but every block is tightened (smaller hero,
// shorter trend, capped rows, hover-reveal queue actions) so the whole
// coverage board fits without scrolling.

"use client";

import { Check, ChevronLeft, ChevronRight, Download, ScanText, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BoardScaffold } from "./scaffold";
import { VariantNote } from "./notes";
import {
  LAST_CLAP_RUN,
  LAST_RULES_RUN,
  QUEUE_COMPACT,
  QUEUE_TOTAL,
  TOTAL_FILES,
  UNTAGGED_FILES,
  fmt,
} from "./data";

const PANEL = "rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3";
const EYEBROW = "font-mono text-[10px] uppercase tracking-widest text-zinc-500";

export function VariantCompact() {
  return (
    <div className="space-y-2">
      <VariantNote title="what changed — command bar, sized to one viewport">
        <p>
          Same command-bar idea — {fmt(UNTAGGED_FILES)} pinned next to both passes — but every block
          is tightened: smaller hero %, shorter trend, the all-tags grid folded away (the rail still
          shows the same bars), arrivals and queue capped, and queue actions reveal on hover. The
          whole coverage board fits without scrolling.
        </p>
      </VariantNote>

      {/* 7 · command bar, tight */}
      <section className={PANEL}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="shrink-0">
            <p className="font-mono text-2xl font-extrabold tabular-nums tracking-tight text-zinc-50">{fmt(UNTAGGED_FILES)}</p>
            <p className={cn(EYEBROW, "mt-0")}>untagged of {fmt(TOTAL_FILES)}</p>
          </div>
          <div className="hidden h-9 w-px bg-white/10 sm:block" />
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
            <Badge variant="secondary" className="gap-1.5 font-mono text-[10px]">
              <span className="inline-block size-1.5 rounded-full bg-chart-3" />
              model ready
            </Badge>
            <Button variant="ghost" size="xs" disabled className="text-zinc-600">
              <Download />
              Download model
            </Button>
            <Button variant="outline" size="sm">
              <ScanText />
              Tag with rules
            </Button>
            <Button size="sm">
              <Sparkles />
              Analyze with CLAP
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2">
          <span className={EYEBROW}>last runs</span>
          <Badge variant="outline" className="h-5 gap-1.5 px-2 font-mono text-[10px] tabular-nums">
            <span className="inline-block size-1.5 rounded-full bg-chart-3" />
            rules · {LAST_RULES_RUN.at} — {fmt(LAST_RULES_RUN.tagged)}
          </Badge>
          <Badge variant="outline" className="h-5 gap-1.5 px-2 font-mono text-[10px] tabular-nums">
            <span className="inline-block size-1.5 rounded-full bg-amber-400" />
            CLAP · {LAST_CLAP_RUN.at} — {LAST_CLAP_RUN.tagged} tagged · {LAST_CLAP_RUN.skipped} skipped
          </Badge>
        </div>
      </section>

      {/* Board, tightened: smaller hero, shorter trend, capped rail + arrivals */}
      <BoardScaffold compact>
        {/* 1+2+8 · queue, capped at 3 with hover actions */}
        <section className={PANEL}>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">Candidate queue</h2>
            <span className="flex-1" />
            <p className={cn(EYEBROW, "flex items-center gap-1.5")}>
              <span className="inline-block size-1.5 rounded-full bg-amber-400" />
              0 of 500 cleared the bar — promote to grow the vocabulary
            </p>
          </div>
          <ul className="mt-1.5 border-t border-white/10">
            {QUEUE_COMPACT.map((item) => (
              <li key={item.word} className="group flex flex-wrap items-center gap-2 border-b border-white/5 py-1.5 text-[13px] last:border-0">
                <span className="min-w-0 flex-1 truncate text-zinc-200">{item.line}</span>
                <span className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button variant="outline" size="xs" className="border-accent-fill/25 text-accent-text hover:border-accent-fill/40 hover:bg-accent-fill/10 hover:text-accent-text">
                    <Check />
                    Promote
                  </Button>
                  <Button variant="ghost" size="xs" className="text-zinc-500">
                    <X />
                    Dismiss
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-[11px] tabular-nums text-zinc-500">1–{QUEUE_COMPACT.length} of {QUEUE_TOTAL}</span>
            <span className="flex-1" />
            <Button variant="outline" size="xs" disabled>
              <ChevronLeft />
              Prev
            </Button>
            <Button variant="outline" size="xs">
              Next
              <ChevronRight />
            </Button>
          </div>
        </section>
      </BoardScaffold>
    </div>
  );
}
