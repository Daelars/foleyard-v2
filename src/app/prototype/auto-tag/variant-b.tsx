// PROTOTYPE ONLY — variant B: the kept coverage board.
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { COVERAGE_GOAL, tagCoverage } from "./data";
import type { MockFile, TagRule } from "./data";
import { cn } from "@/lib/utils";

export function VariantB({ files, rules, query }: { files: MockFile[]; rules: TagRule[]; query: string }) {
  const tagged = files.filter((file) => file.tags.length > 0).length;
  const pct = Math.round((tagged / Math.max(files.length, 1)) * 100);
  const q = query.trim().toLowerCase();
  const visible = rules.filter(
    (rule) =>
      !q || rule.tok.includes(q) || rule.tags.some((tag) => tag.includes(q)),
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Card className="border-accent-fill/50">
        <CardContent className="py-4">
          <h3 className="text-sm font-semibold text-zinc-100">Library tagged</h3>
          <p className="text-3xl font-extrabold tracking-tight text-zinc-50">
            {pct}
            <span className="text-sm font-medium text-zinc-500">%</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            {tagged}/{files.length} files carry tags
          </p>
        </CardContent>
      </Card>

      {visible.map((rule) => {
        const head = rule.tags[0];
        const count = tagCoverage(files, head);
        const low = count === 0 || count < 3;
        return (
          <Card key={rule.tok} className={cn(count === 0 && "border-destructive/60")}>
            <CardContent className="py-4">
              <h3 className="text-sm font-semibold text-zinc-100">#{head}</h3>
              <p className="text-3xl font-extrabold tracking-tight text-zinc-50">
                {count}
                <span className="text-sm font-medium text-zinc-500"> / {COVERAGE_GOAL}</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn("h-full rounded-full", low ? "bg-accent-fill" : "bg-emerald-400")}
                  style={{ width: `${Math.min(100, (count / COVERAGE_GOAL) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                {count === 0 ? "uncovered" : count < 3 ? "thin" : "covered"}
              </p>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent className="flex items-center gap-2 py-4">
          <p className="flex-1 text-xs text-zinc-500">
            A zero is honest: no filename contains that word yet.
          </p>
          <Button variant="outline" size="sm" onClick={() => {}}>
            How coverage counts
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
