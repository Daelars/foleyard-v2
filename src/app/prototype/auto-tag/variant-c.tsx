// PROTOTYPE ONLY — variant C: the extension's sidebar as it would really render,
// through the production generic v2 sidebar renderer with mock resolved items.
"use client";

import { useMemo, useState } from "react";
import type { V2ResolvedContribution } from "@yard-core";
import { V2SidebarPanel } from "@/components/extensions-v2/sidebar";
import type { V2SidebarItem } from "@/components/extensions-v2/sidebar";
import { COVERAGE_GOAL, filenameMatchesToken, tagCoverage } from "./data";
import type { MockFile, TagRule } from "./data";

export function VariantC({ files, rules }: { files: MockFile[]; rules: TagRule[] }) {
  const [lastInvoked, setLastInvoked] = useState<string | null>(null);

  const panelItems: V2SidebarItem[] = useMemo(
    () =>
      rules.map((rule) => {
        const head = rule.tags[0];
        const count = tagCoverage(files, head);
        const hits = files.filter((file) => filenameMatchesToken(file.filename, rule.tok)).length;
        const item: V2ResolvedContribution = {
          key: `v2:auto-tag:coverage.${rule.tok}`,
          extensionId: "auto-tag",
          extensionName: "Auto Tag",
          contributionId: `coverage.${rule.tok}`,
          contributionType: "sidebar",
          point: "sidebar",
          commandId: "auto-tag.coverage",
          title: `#${head} — ${count}/${COVERAGE_GOAL}`,
          order: 100,
          availability: { available: true },
        };
        return { item, subtitle: `${hits} filename hits · rule “${rule.tok}”` };
      }),
    [files, rules],
  );

  return (
    <div className="max-w-md">
      <V2SidebarPanel
        title="Auto Tag coverage"
        panelItems={panelItems}
        state={{ status: "ready" }}
        onInvoke={(item) => setLastInvoked(item.key)}
        emptyHint="Add a rule to start watching coverage."
      />
      <p className="mt-2 font-mono text-[11px] text-zinc-500">
        {lastInvoked ? `invoked ${lastInvoked}` : "activate a row — the generic panel calls onInvoke with the stable key."}
      </p>
    </div>
  );
}
