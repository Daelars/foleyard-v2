// Library-adoption review, 2026-09-07. Should foleyard bring in zod, zustand,
// or arktype? Grounded in the current source; verdicts are recommendations,
// not decisions. Effort and risk notes are estimates until a spike measures them.

export type Verdict = "adopt-selectively" | "adopt-targeted" | "hold";

export type LibraryVerdict = {
  lib: string;
  role: string;
  verdict: Verdict;
  verdictLabel: string;
  oneLine: string;
  why: string;
  where: string;
  how: string;
  cost: string;
  present: string;
  source: string;
};

export const libraries: LibraryVerdict[] = [
  {
    lib: "zod",
    role: "Runtime validation + inferred types",
    verdict: "adopt-selectively",
    verdictLabel: "Adopt at the untrusted-input boundary only",
    oneLine:
      "Good fit where we parse untrusted JSON into typed values. A poor fit for the catalog schema, which must stay serializable.",
    why: "The execute route hands raw request bodies straight in as `unknown`, and 27 files call JSON.parse on stored strings (smart-collection filters, extension settings, the kv-store), mostly followed by an `as` cast. That is the parse-don't-validate gap zod handles well: one schema gives both the runtime check and the inferred type, and it replaces the cast.",
    where:
      "src/app/api/extensions-v2/execute/route.ts (body: unknown), src/app/library/use-library-view.ts (JSON.parse(collection.filter) as { q?: string }), src/lib/smart-collection-filter.ts, extension settings + kv-store.",
    how: "Add zod as a direct dependency (already in the lockfile transitively). Define schemas for the parsed shapes and swap `JSON.parse(x) as T` for `Schema.parse(JSON.parse(x))`. Leave the extension catalog DSL alone.",
    cost: "Low. Incremental, one parse site at a time. No change to the wire format or the renderer.",
    present: "Already transitive: zod@3.25.76 + zod-to-json-schema@3.25.2 via tooling.",
    source: "src/app/api/extensions-v2/execute/route.ts",
  },
  {
    lib: "zustand",
    role: "Client state store",
    verdict: "adopt-targeted",
    verdictLabel: "Adopt for the cross-hook coordination in page.tsx",
    oneLine:
      "The route shell already leaks the exact pain zustand removes: four useRef bridges that exist only so hooks can read each other's state.",
    why: "page.tsx is ~1140 lines composing about fifteen hooks, wired together through selectionApiRef, navigateRef, scanSettledRef, and selectedCollectionMirrorRef. Those refs are a hand-built store; they exist because a hook can't reach another hook's state without threading a callback. use-library-view.ts has already split its transitions into pure applyX reducers, which lift into a store with almost no rework.",
    where:
      "src/app/page.tsx (the four ref bridges), src/app/library/use-library-view.ts (pure applyX reducers), plus use-selection and use-library-organization, which coordinate through those refs today.",
    how: "Move the view + selection + organization coordination into one store (or a few slices). Keep server reads in the existing fetch hooks. The store holds view and selection state, not fetched rows. Delete the refs as each cross-slice call moves onto the store.",
    cost: "Medium. A real refactor with test churn across the library hooks. Best done slice by slice, behind the existing hook return shapes.",
    present: "Not present. New direct dependency (~1 KB core).",
    source: "src/app/page.tsx",
  },
  {
    lib: "arktype",
    role: "Runtime validation + inferred types",
    verdict: "hold",
    verdictLabel: "Hold: it competes with zod for the same slot",
    oneLine:
      "Solves the same problem as zod on the same surface. Running both means two validation idioms; running it instead of zod trades a mature, already-present library for a smaller one for no gain here.",
    why: "arktype's edges (TS-native syntax, faster validation) don't pay off at this volume. Extension inputs are small objects validated once per command, not a hot path. It shares zod's blocker on the catalog: its schemas are closures, not JSON, so they can't replace the serializable DSL either. And there is no arktype in the tree, while zod is already resolved.",
    where:
      "Same surface as zod: the execute boundary and the JSON.parse sites. There is no surface where arktype wins that zod loses.",
    how: "No adoption path recommended now. Revisit only if a validation hot path appears (bulk import, per-row streaming) where arktype's throughput would measurably matter.",
    cost: "N/A. Recommending against.",
    present: "Not present, no transitive pull.",
    source: "packages/yard-core/src/extensions-v2/definition.ts",
  },
];

// The three code surfaces the question actually touches, and what each library
// would (or would not) do to each one. This is where the nuance lives.
export type Surface = {
  id: string;
  name: string;
  role: string;
  detail: string;
  constraint: string;
  source: string;
  fit: { lib: string; note: string; good: boolean }[];
};

export const surfaces: Surface[] = [
  {
    id: "wire-schema",
    name: "Extension catalog schema (the DSL)",
    role: "Serializable contract sent to the renderer",
    detail:
      "ExtensionV2ValueSchema + checkV2SchemaShape + validateV2Value in one framework-free module, reused across 7 tool packages. The comment states the intent outright: schemas are data, so they validate at runtime and serialize into catalogs.",
    constraint:
      "Must stay plain JSON. This is the reason to keep the hand-rolled DSL: a zod or arktype schema is a closure and cannot cross the wire to the catalog.",
    source: "packages/yard-core/src/extensions-v2/definition.ts",
    fit: [
      { lib: "zod", note: "Wrong tool. Would break catalog serialization if it replaced the DSL. At most, generate the DSL from zod via zod-to-json-schema, but that adds a build step for little gain.", good: false },
      { lib: "zustand", note: "Not applicable. This is a schema, not state.", good: false },
      { lib: "arktype", note: "Same blocker as zod: not serializable.", good: false },
    ],
  },
  {
    id: "input-boundary",
    name: "Untrusted-input boundary",
    role: "Turning request bodies and stored JSON into typed values",
    detail:
      "The execute route accepts body: unknown; 27 files call JSON.parse and mostly cast the result. validateV2Value covers extension command input, but the app's own JSON.parse sites (smart-collection filters, settings) are unchecked casts.",
    constraint:
      "The casts are where malformed stored data becomes a silent runtime bug. This is real parse-don't-validate territory.",
    source: "src/app/library/use-library-view.ts",
    fit: [
      { lib: "zod", note: "Best fit. One schema replaces the cast and gives the inferred type. Adopt here first.", good: true },
      { lib: "zustand", note: "Not applicable.", good: false },
      { lib: "arktype", note: "Would also work, but zod is already resolved and the team has no arktype. No reason to prefer it.", good: false },
    ],
  },
  {
    id: "app-state",
    name: "Client view + selection state",
    role: "Coordinating what the library UI is showing and what is selected",
    detail:
      "page.tsx composes ~15 hooks and bridges them with four useRef objects so a navigation can clear selection, a deleted collection can restore selection on rollback, and a settled scan can refetch. use-library-view already isolates the transitions as pure reducers.",
    constraint:
      "The refs are the smell. They are a store built by hand, with no devtools and easy to wire wrong.",
    source: "src/app/page.tsx",
    fit: [
      { lib: "zod", note: "Not applicable. This is state, not parsing.", good: false },
      { lib: "zustand", note: "Best fit. A store replaces the ref bridges and the reducers lift straight in.", good: true },
      { lib: "arktype", note: "Not applicable.", good: false },
    ],
  },
];

// Recommended order if the verdicts are accepted. Smallest, safest, highest-signal first.
export type Step = {
  order: number;
  title: string;
  lib: string;
  effort: "S" | "M" | "L";
  risk: "low" | "medium";
  detail: string;
  source: string;
};

export const sequence: Step[] = [
  {
    order: 1,
    title: "zod at one JSON.parse cast, as a spike",
    lib: "zod",
    effort: "S",
    risk: "low",
    detail:
      "Replace JSON.parse(collection.filter) as { q?: string } with a zod schema. One file, reversible, proves the pattern and the bundle cost before spreading it.",
    source: "src/app/library/use-library-view.ts",
  },
  {
    order: 2,
    title: "zod across the remaining untrusted-input sites",
    lib: "zod",
    effort: "M",
    risk: "low",
    detail:
      "Extend the same pattern to smart-collection filters, extension settings, and the kv-store. Leave the extension catalog DSL untouched.",
    source: "src/lib/smart-collection-filter.ts",
  },
  {
    order: 3,
    title: "zustand for view + selection, one slice",
    lib: "zustand",
    effort: "M",
    risk: "medium",
    detail:
      "Lift use-library-view's applyX reducers into a store slice and delete navigateRef + selectedCollectionMirrorRef. Keep the hook's return shape so page.tsx doesn't change yet.",
    source: "src/app/library/use-library-view.ts",
  },
  {
    order: 4,
    title: "zustand for the remaining ref bridges",
    lib: "zustand",
    effort: "L",
    risk: "medium",
    detail:
      "Fold selection and organization coordination into the store and remove selectionApiRef + scanSettledRef. Server reads stay in their fetch hooks.",
    source: "src/app/page.tsx",
  },
];

export const summary = {
  headline: "Two yeses and a no",
  body:
    "zod belongs at the untrusted-input boundary, where casts quietly let malformed data through. zustand belongs in page.tsx, where four useRef bridges are already a store built by hand. arktype doesn't earn a slot: it does the same job as zod, and zod is already in the tree. The one thing to avoid is pointing either validator at the extension catalog DSL, which has to stay serializable and is the one hand-rolled schema worth keeping.",
};
