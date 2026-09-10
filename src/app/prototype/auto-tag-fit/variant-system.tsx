// PROTOTYPE ONLY — variant "system": the FULL current board, each tab shown
// where it actually lives. Coverage keeps rail/chart/arrivals + queue/rules/
// semantic; the flagged pieces snap to shared components without moving.
// The Tag origins tab shows its pills fixed in place (they live there, not
// on coverage). The low-risk pass.

"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { BoardScaffold, OriginsScaffold } from "./scaffold";
import { VariantNote } from "./notes";
import {
  LAST_CLAP_RUN,
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

function QueuePanel() {
  return (
    <section className={PANEL}>
      <h2 className="text-sm font-semibold text-zinc-100">Candidate queue</h2>
      <p className={cn(EYEBROW, "mt-0.5")}>explicit accept only</p>
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
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">Origins</h2>
        <span className="flex-1" />
        <span className="font-mono text-[11px] tabular-nums text-zinc-500">
          {fmt(ORIGIN_SUMMARY.total)} files · <span className="text-zinc-300">{fmt(ORIGIN_SUMMARY.manual)} manual</span> ·{" "}
          <span className="text-accent-text">{fmt(ORIGIN_SUMMARY.rule)} rule</span> · <span className="text-emerald-400">{ORIGIN_SUMMARY.ai} AI</span>
        </span>
      </div>
      <p className={cn(EYEBROW, "mt-1")}>A file can count in more than one origin category</p>
      {/* 6 · pills → the shared Tabs tray, same component as the workspace tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v)} className="mt-3">
        <TabsList aria-label="Filter files by tag origin">
          {ORIGIN_FILTERS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="px-2.5 text-[11px]">
              {item.label}
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

export function VariantSystem() {
  return (
    <div className="space-y-3">
      <VariantNote title="what changed — the current board, kept whole, per tab">
        <p>
          Same rail, same coverage chart, same arrivals, same panels in the same places. Only the
          flagged pieces snap to the shared vocabulary.           The origin pills live on the Tag origins tab
          — they&apos;re fixed there, not moved onto coverage.
        </p>
      </VariantNote>

      <Tabs defaultValue="coverage" className="space-y-3">
        <TabsList variant="line" aria-label="Auto Tag workspace">
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="origins">Tag origins</TabsTrigger>
        </TabsList>

        <TabsContent value="coverage">
          <BoardScaffold>
            {/* 1+2 · queue: real Buttons, Promote accent-split from Dismiss */}
            <QueuePanel />

            {/* 5 · note drops to eyebrow; 3 · action is a real Button */}
            <section className={PANEL}>
              <h2 className="text-sm font-semibold text-zinc-100">Filename rules</h2>
              <p className={cn(EYEBROW, "mt-0.5")}>deterministic · manual tags always win</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm">Tag untagged files with filename rules</Button>
                <span className="flex-1" />
                <span className="font-mono text-[11px] tabular-nums text-zinc-500">{fmt(UNTAGGED_FILES)} untagged</span>
              </div>
            </section>

            {/* 3+4+5 · semantic: primary first + accent, model state as badge, log as chips */}
            <section className={PANEL}>
              <h2 className="text-sm font-semibold text-zinc-100">Semantic tagging</h2>
              <p className={cn(EYEBROW, "mt-0.5 flex items-center gap-1.5")}>
                <span className="inline-block size-1.5 rounded-full bg-chart-3" />
                CLAP · model ready
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm">Analyze untagged files with CLAP</Button>
                <Button variant="outline" size="sm" disabled>Download model</Button>
                <span className="flex-1" />
                <span className="font-mono text-[11px] tabular-nums text-zinc-500">{fmt(UNTAGGED_FILES)} untagged of {fmt(TOTAL_FILES)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3">
                <span className="font-mono text-[11px] text-zinc-500">Last run {LAST_CLAP_RUN.at} · CLAP</span>
                <Badge variant="secondary" className="font-mono text-[10px] tabular-nums">tagged 0</Badge>
                <Badge variant="secondary" className="font-mono text-[10px] tabular-nums">attached 0</Badge>
                <Badge variant="secondary" className="font-mono text-[10px] tabular-nums text-amber-300/90">skipped 500</Badge>
              </div>
            </section>
          </BoardScaffold>
        </TabsContent>

        <TabsContent value="origins">
          <OriginsScaffold filter={<OriginsFilter />} fileList={<OriginsFileList />} queue={<QueuePanel />} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
