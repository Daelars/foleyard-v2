// PROTOTYPE ONLY — variant "passes": the FULL current board, each tab where
// it lives. On Coverage the two run panels merge into one "Tagging passes"
// panel (rules + CLAP are the same verb on the same untagged set) with a
// shared row anatomy; the count moves into the button label; the empty-run
// advice moves to the queue eyebrow. The origin pills get fixed on the Tag
// origins tab, not moved onto coverage.

"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, ScanText, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { BoardScaffold, OriginsScaffold } from "./scaffold";
import { VariantNote } from "./notes";
import {
  LAST_CLAP_RUN,
  LAST_RULES_RUN,
  ORIGIN_FILES,
  ORIGIN_FILTERS,
  ORIGIN_SUMMARY,
  QUEUE,
  QUEUE_TOTAL,
  TOTAL_FILES,
  UNTAGGED_FILES,
  fmt,
} from "./data";

const PANEL = "rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4";
const EYEBROW = "font-mono text-[10px] uppercase tracking-widest text-zinc-500";

function QueuePanel({ eyebrow }: { eyebrow?: boolean }) {
  return (
    <section className={PANEL}>
      <h2 className="text-sm font-semibold text-zinc-100">Candidate queue</h2>
      {eyebrow ? (
        <p className={cn(EYEBROW, "mt-0.5 flex items-center gap-1.5")}>
          <span className="inline-block size-1.5 rounded-full bg-amber-400" />
          0 of 500 cleared the bar last run — promoting words grows the CLAP vocabulary
        </p>
      ) : (
        <p className={cn(EYEBROW, "mt-0.5")}>explicit accept only</p>
      )}
      <ul className="mt-2 border-t border-white/10">
        {QUEUE.map((item) => (
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
      <div className="mt-3 flex items-center gap-2">
        <span className="font-mono text-[11px] tabular-nums text-zinc-500">1–{QUEUE.length} of {QUEUE_TOTAL}</span>
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
  );
}

function OriginsFilter() {
  const [filter, setFilter] = useState("all");
  return (
    <section className={PANEL}>
      <h2 className="text-sm font-semibold text-zinc-100">Origins</h2>
      <p className={cn(EYEBROW, "mt-0.5")}>{fmt(ORIGIN_SUMMARY.total)} files · counts overlap — a file can carry several origins</p>
      {/* 6 · pills → shared Tabs tray, counts riding inside the triggers */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v)} className="mt-3">
        <TabsList aria-label="Filter files by tag origin">
          {ORIGIN_FILTERS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="px-2.5 text-[11px]">
              {item.label}
              <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                {item.value === "all" && fmt(ORIGIN_SUMMARY.total)}
                {item.value === "manual" && fmt(ORIGIN_SUMMARY.manual)}
                {item.value === "deterministic" && fmt(ORIGIN_SUMMARY.rule)}
                {item.value === "semantic_ai" && ORIGIN_SUMMARY.ai}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </section>
  );
}

function OriginsFileList() {
  return (
    <div className={PANEL}>
      <ul className="border-t border-white/10">
        {ORIGIN_FILES.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-white/5 py-2 text-[13px] last:border-0">
            <span className="min-w-0 flex-1 truncate text-zinc-200">{file.filename}</span>
            <span className="flex shrink-0 gap-1">
              {file.tags.length ? (
                file.tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary" className="flex h-4 items-center gap-1 px-1.5 text-[10px]">#{tag.name}</Badge>
                ))
              ) : (
                <span className="text-[12px] text-zinc-600">untagged</span>
              )}
            </span>
            <Button variant="ghost" size="xs" className="text-zinc-500">Find similar</Button>
            {file.fired.length > 0 && (
              <p className="w-full pl-4 font-mono text-[11px] text-zinc-600">
                fired {file.fired.map((r) => `“${r.token}” → ${r.tags.map((t) => `#${t}`).join(", ")}`).join("; ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VariantPasses() {
  return (
    <div className="space-y-3">
      <VariantNote title="what changed — one pass panel instead of two orphans">
        <p>
          Rules and CLAP both run a pass over the same {fmt(UNTAGGED_FILES)} untagged files — one
          panel, two rows, shared anatomy (icon, name + constraint, last run, action). The count
          moves into the button label. The origin pills stay on the Tag origins tab, fixed there.
        </p>
      </VariantNote>

      <Tabs defaultValue="coverage" className="space-y-3">
        <TabsList variant="line" aria-label="Auto Tag workspace">
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="origins">Tag origins</TabsTrigger>
        </TabsList>

        <TabsContent value="coverage">
          <BoardScaffold>
            {/* 7 · one panel, two passes, shared row anatomy */}
            <section className={PANEL}>
              <h2 className="text-sm font-semibold text-zinc-100">Tagging passes</h2>
              <p className={cn(EYEBROW, "mt-0.5")}>each pass works the untagged set · {fmt(UNTAGGED_FILES)} of {fmt(TOTAL_FILES)} waiting</p>

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-300">
                  <ScanText className="size-4" />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-[13px] font-semibold text-zinc-100">Filename rules</p>
                  <p className="mt-0.5 text-[12px] text-zinc-500">Deterministic — matches tokens in file names. Manual tags always win.</p>
                </div>
                <span className="hidden font-mono text-[11px] tabular-nums text-zinc-500 sm:block">last {LAST_RULES_RUN.at} · {fmt(LAST_RULES_RUN.tagged)} tagged</span>
                <Button variant="outline" size="sm">Run rules</Button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/5 pt-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-fill/12 text-accent-text">
                  <Sparkles className="size-4" />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-[13px] font-semibold text-zinc-100">Semantic · CLAP</p>
                  <p className="mt-0.5 text-[12px] text-zinc-500">Matches audio against your tag vocabulary.</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="gap-1.5 font-mono text-[10px]">
                      <span className="inline-block size-1.5 rounded-full bg-chart-3" />
                      model ready
                    </Badge>
                    <Button variant="ghost" size="xs" disabled className="text-zinc-600">
                      <Download />
                      Download model (~400 MB)
                    </Button>
                  </div>
                </div>
                <span className="hidden font-mono text-[11px] tabular-nums text-zinc-500 sm:block">
                  last {LAST_CLAP_RUN.at} · {LAST_CLAP_RUN.tagged} tagged · <span className="text-amber-300/90">{LAST_CLAP_RUN.skipped} skipped</span>
                </span>
                <Button size="sm">Analyze {fmt(UNTAGGED_FILES)} files</Button>
              </div>
            </section>

            {/* 8 · queue guidance as eyebrow */}
            <QueuePanel eyebrow />
          </BoardScaffold>
        </TabsContent>

        <TabsContent value="origins">
          <OriginsScaffold filter={<OriginsFilter />} fileList={<OriginsFileList />} queue={<QueuePanel />} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
