// PROTOTYPE ONLY — variant "pinned": the command-bar idea lifted out of the
// coverage flow and pinned directly under the Coverage / Tag origins tabs.
// Same bar as "command" (untagged count + both passes + last-run chips), but
// it sits above the tab content so it persists across both tabs instead of
// scrolling away with the coverage panels.

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

function PinnedCommandBar() {
  return (
    <section className={PANEL} aria-label="Auto-tag commands">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="shrink-0">
          <p className="font-mono text-3xl font-extrabold tabular-nums tracking-tight text-zinc-50">{fmt(UNTAGGED_FILES)}</p>
          <p className={cn(EYEBROW, "mt-0.5")}>untagged of {fmt(TOTAL_FILES)}</p>
        </div>
        <div className="hidden h-10 w-px bg-white/10 sm:block" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
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
            Tag with filename rules
          </Button>
          <Button size="sm">
            <Sparkles />
            Analyze with CLAP
          </Button>
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

function QueuePanel() {
  return (
    <section className={PANEL}>
      <h2 className="text-sm font-semibold text-zinc-100">Candidate queue</h2>
      <p className={cn(EYEBROW, "mt-0.5 flex items-center gap-1.5")}>
        <span className="inline-block size-1.5 rounded-full bg-amber-400" />
        0 of 500 cleared the bar last run — promote words to grow the vocabulary
      </p>
      <ul className="mt-2 border-t border-white/10">
        {QUEUE.map((item) => (
          <li key={item.word} className="group flex flex-wrap items-center gap-2 border-b border-white/5 py-2 text-[13px] last:border-0">
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
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Origins</h2>
          <p className={cn(EYEBROW, "mt-0.5")}>
            {fmt(ORIGIN_SUMMARY.total)} files · {fmt(ORIGIN_SUMMARY.manual)} manual · {fmt(ORIGIN_SUMMARY.rule)} rule · {ORIGIN_SUMMARY.ai} AI
          </p>
        </div>
        <span className="flex-1" />
        <Tabs value={filter} onValueChange={(v) => setFilter(v)}>
          <TabsList variant="line" aria-label="Filter files by tag origin">
            {ORIGIN_FILTERS.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="px-2 text-[11px]">
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
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

export function VariantPinned() {
  return (
    <div className="space-y-3">
      <VariantNote title="what changed — command bar pinned under the workspace tabs">
        <p>
          Same command bar as “command” — {fmt(UNTAGGED_FILES)} pinned next to both passes with the
          last-runs chip strip — but lifted above the tab content so it stays visible on Coverage{" "}
          <em>and</em> Tag origins instead of scrolling with the coverage panels.
        </p>
      </VariantNote>

      <Tabs defaultValue="coverage" className="space-y-3">
        <TabsList variant="line" aria-label="Auto Tag workspace">
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="origins">Tag origins</TabsTrigger>
        </TabsList>

        {/* Pinned: outside TabsContent, directly under the tab row */}
        <PinnedCommandBar />

        <TabsContent value="coverage">
          <BoardScaffold>
            <QueuePanel />
          </BoardScaffold>
        </TabsContent>

        <TabsContent value="origins">
          <OriginsScaffold filter={<OriginsFilter />} fileList={<OriginsFileList />} queue={<QueuePanel />} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
