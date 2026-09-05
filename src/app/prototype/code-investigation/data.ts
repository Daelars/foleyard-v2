// PROTOTYPE ONLY — throwaway audit surface for the code-reduction audit.
// Three variants of the same findings, switchable via `?variant=`, on the
// throwaway `/prototype/code-investigation` route. No persistence, no tests.

export type Confidence = "CONFIRMED" | "HIGH CONFIDENCE" | "POSSIBLE";

export interface AuditFinding {
  id: string;
  title: string;
  area: string;
  files: string[];
  loc: string;
  confidence: Confidence;
  risk: string;
  benefit: string;
}

export const BASELINE = {
  prodLoc: 19185,
  prodFiles: 210,
  prototypeLoc: 9063,
  testLoc: 4514,
  apiRoutes: 29,
  expectedLow: 16700,
  expectedHigh: 17400,
};

export const FINDINGS: AuditFinding[] = [
  {
    id: "F1",
    title: "page.tsx god-component — 44 states, 74 callbacks",
    area: "split",
    files: ["src/app/page.tsx:123-211", "src/app/page.tsx:2178-2748"],
    loc: "-250–450",
    confidence: "CONFIRMED",
    risk: "Medium — touches every path",
    benefit: "One hook per feature instead of one 2.5k file",
  },
  {
    id: "F2",
    title: "Extension route epilogue ×11 + guards ×6",
    area: "duplicate",
    files: ["src/app/api/extensions/*:26-30 ×11", "src/app/api/extensions/host-outcome.ts:29-47"],
    loc: "-200–350",
    confidence: "CONFIRMED",
    risk: "Low — pure extraction",
    benefit: "One outcome helper; silent catch{} fixed once",
  },
  {
    id: "F3",
    title: "Settings-KV stores ×4 + dual DB wiring",
    area: "duplicate",
    files: ["src/lib/extensions/*-store.ts", "src/lib/database/settings-repository.ts", "src/lib/db.ts vs composition-root.ts"],
    loc: "-150–250",
    confidence: "HIGH CONFIDENCE",
    risk: "Low-medium — preserve keys verbatim",
    benefit: "One KV helper; one SQLite connection",
  },
  {
    id: "F4",
    title: "yard-core: 15 files for 7 one-line types + stale contracts",
    area: "combine",
    files: ["packages/yard-core/src/extensions/*", "packages/yard-core/src/services/search/search-service.ts"],
    loc: "-100–200",
    confidence: "HIGH CONFIDENCE",
    risk: "Low for collapse; med for contracts",
    benefit: "5 files answer 'what is an extension?'",
  },
  {
    id: "F5",
    title: "Five file-record shapes + 5 hydration projections",
    area: "types",
    files: ["FileTable/types.ts:1", "AudioPlayer/types.ts:1", "src/app/page.tsx:56", "src/lib/db.ts:61"],
    loc: "-80–150",
    confidence: "HIGH CONFIDENCE",
    risk: "Low — mechanical",
    benefit: "One YardFile; kills .aif MIME drift",
  },
  {
    id: "F6",
    title: "SettingsDialog 1,828 lines — 6 tabs + drop-rules",
    area: "split",
    files: ["src/components/SettingsDialog.tsx:540-1437"],
    loc: "flat ±5%",
    confidence: "CONFIRMED",
    risk: "Low — panel extraction",
    benefit: "NamedEntityRow kills 3 confirm-row clones",
  },
  {
    id: "D1",
    title: "Dead UI inventory: table.tsx, select.tsx, 4 schema aliases",
    area: "delete",
    files: ["src/components/ui/table.tsx", "src/components/ui/select.tsx", "src/lib/schema.ts:65-68", "src/lib/utils.ts:15"],
    loc: "-180",
    confidence: "CONFIRMED",
    risk: "None — zero importers",
    benefit: "Delete + prune test inventory refs",
  },
  {
    id: "D2",
    title: "validateLibraryRoot exact clone",
    area: "delete",
    files: ["src/lib/scanner/validation.ts:7-32", "src/lib/scanner/scan-runner.ts:241-266"],
    loc: "-25",
    confidence: "CONFIRMED",
    risk: "None — delegate",
    benefit: "One validator",
  },
  {
    id: "S1",
    title: "Debounced + shelf state duplicated; 6 ref-mirrors",
    area: "state",
    files: ["src/app/page.tsx:149,193-194", "src/app/page.tsx:207-238,672,842,1388"],
    loc: "-80–150",
    confidence: "HIGH CONFIDENCE",
    risk: "Low — useDeferredValue + hook",
    benefit: "Deletes timer + sync effects",
  },
  {
    id: "B1",
    title: "browse-repository subdirectory loops diverge",
    area: "duplicate",
    files: ["src/lib/database/browse-repository.ts:46-95"],
    loc: "-30–50",
    confidence: "CONFIRMED",
    risk: "Medium — Windows separator behaviour differs",
    benefit: "One loop + regression test",
  },
  {
    id: "X1",
    title: "Prototype bulk ~9k LOC in bundle tree",
    area: "delete",
    files: ["src/app/prototype/redesign/workspace.tsx:2099", "src/app/prototype/*"],
    loc: "quarantine 9,063",
    confidence: "HIGH CONFIDENCE",
    risk: "None — throwaway branch",
    benefit: "Search + build signal cleaned",
  },
  {
    id: "N1",
    title: "Do not change: scanner, FileTable/AudioPlayer splits, yard-tools",
    area: "keep",
    files: ["src/lib/scanner/scan-runner.ts", "src/components/FileTable/*", "packages/yard-tools/*"],
    loc: "0",
    confidence: "CONFIRMED",
    risk: "Splitting cohesive code hurts",
    benefit: "Protects load-bearing seams",
  },
];

export const ORDER = [
  { step: 1, name: "Dead code / removals", ids: ["D1", "D2", "X1"] },
  { step: 2, name: "Duplicate consolidation", ids: ["F2", "F3", "F5", "B1"] },
  { step: 3, name: "Unnecessary abstractions", ids: ["F4"] },
  { step: 4, name: "State simplification", ids: ["S1"] },
  { step: 5, name: "Oversized files", ids: ["F1", "F6"] },
  { step: 6, name: "Boundaries + low-impact", ids: ["N1"] },
];
