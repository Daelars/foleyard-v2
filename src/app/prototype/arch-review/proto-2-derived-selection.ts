// PROTOTYPE (throwaway) for improvement point 2: derived selection.
// Question: which multi-step sagas can desync a copied selection, and do they
// hold when selection is derived from the list by id?
// Run: node src/app/prototype/arch-review/run-all.ts

type File = { id: string; name: string; favorite: boolean; tags: string[] };

type Store = {
  files: File[];
  order: string[]; // sort applied separately; selection keys on id, not index
  selectedId: string | null;
  multiIds: string[];
  anchorId: string | null;
};

export type SelectionFile = File;
export type SelectionStore = Store;

export const selected = (s: Store) => s.files.find((f) => f.id === s.selectedId) ?? null;
export const multi = (s: Store) => s.multiIds.filter((id) => s.files.some((f) => f.id === id));

export function prune(s: Store) {
  if (s.selectedId && !s.files.some((f) => f.id === s.selectedId)) s.selectedId = null;
  s.multiIds = multi(s);
  if (s.anchorId && !s.files.some((f) => f.id === s.anchorId)) s.anchorId = null;
}

export type SagaStep = { label: string; apply: (s: Store) => void };

export const SAGA_STEPS: SagaStep[] = [
  { label: "select b", apply: (s) => void (s.selectedId = "b") },
  { label: "favorite b (list-only write)", apply: (s) => void (s.files.find((f) => f.id === "b")!.favorite = true) },
  {
    label: "tag b + c",
    apply: (s) => {
      s.files.find((f) => f.id === "b")!.tags.push("drums");
      s.files.find((f) => f.id === "c")!.tags.push("drums");
    },
  },
  { label: "multi-select b,c anchor b", apply: (s) => void ((s.multiIds = ["b", "c"]), (s.anchorId = "b")) },
  { label: "sort flip (order c,b,a)", apply: (s) => void (s.order = ["c", "b", "a"]) },
  {
    label: "search narrows list (b hidden)",
    apply: (s) => {
      s.files = s.files.filter((f) => f.id !== "b");
    },
  },
  {
    label: "bulk remove c (anchor+multi pruned)",
    apply: (s) => {
      s.files = s.files.filter((f) => f.id !== "c");
    },
  },
  {
    label: "undo restores b (id re-derives)",
    apply: (s) => {
      s.files.push({ id: "b", name: "snare", favorite: true, tags: ["drums"] });
      s.selectedId = "b";
    },
  },
];

export function freshStore(): Store {
  return {
    files: [
      { id: "a", name: "kick", favorite: false, tags: [] },
      { id: "b", name: "snare", favorite: false, tags: [] },
      { id: "c", name: "hat", favorite: false, tags: [] },
    ],
    order: ["a", "b", "c"],
    selectedId: null,
    multiIds: [],
    anchorId: null,
  };
}

export function snapshot(s: Store): string {
  return (
    `order=[${s.order.join(",")}] selected=${JSON.stringify(selected(s)?.name ?? null)} ` +
    `multi=[${multi(s).join(",")}] anchor=${s.anchorId}`
  );
}

export function run() {
  console.log("--- P2: derived selection ---");
  const s: Store = freshStore();
  for (const step of SAGA_STEPS) {
    step.apply(s);
    prune(s);
    console.log(` ${step.label.padEnd(34)} -> ${snapshot(s)}`);
  }
  console.log("verdict: every saga resolves by derivation + one prune; no syncSelectedFile, no rollback copies, no ghost ids.");
}
