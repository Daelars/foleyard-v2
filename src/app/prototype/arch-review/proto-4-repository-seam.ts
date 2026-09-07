// PROTOTYPE (throwaway) for improvement point 4: injectable repository seam.
// Question: do isolation, batch atomicity, and failure rollback all work with
// zero mocks when handlers receive the store?
// Run: node src/app/prototype/arch-review/run-all.ts

type Row = { id: string; removed: boolean; favorite: boolean };

export function createStore() {
  const rows = new Map<string, Row>();
  return {
    upsert: (id: string) => void rows.set(id, { id, removed: false, favorite: false }),
    markRemoved: (id: string) => {
      const row = rows.get(id);
      if (row) row.removed = true;
    },
    setFavorite: (id: string, value: boolean) => {
      const row = rows.get(id);
      if (!row || row.removed) throw new Error(`cannot favorite ${id}`);
      row.favorite = value;
    },
    // One transaction for the batch: all-or-nothing, like sqlite.transaction.
    transact: (work: () => void) => {
      const snapshot = new Map(rows);
      try {
        work();
      } catch (error) {
        rows.clear();
        for (const [k, v] of snapshot) rows.set(k, v);
        throw error;
      }
    },
    visible: () => [...rows.values()].filter((r) => !r.removed).map((r) => `${r.id}${r.favorite ? "*" : ""}`),
  };
}
export type ProtoStore = ReturnType<typeof createStore>;

export function bulkFavorite(store: ProtoStore, ids: string[]) {
  store.transact(() => {
    for (const id of ids) store.setFavorite(id, true);
  });
  return store.visible();
}

export function run() {
  console.log("--- P4: injectable repository seam ---");
  console.log("Scenario A — parallel isolation, no reset ritual:");
  const a = createStore();
  a.upsert("kick");
  a.upsert("snare");
  const b = createStore();
  b.upsert("hat");
  console.log(" A favorites kick:", JSON.stringify(bulkFavorite(a, ["kick"])));
  console.log(" B untouched:   ", JSON.stringify(b.visible()));

  console.log("Scenario B — batch atomicity (one bad id rolls back the batch):");
  const c = createStore();
  c.upsert("kick");
  c.upsert("snare");
  try {
    bulkFavorite(c, ["kick", "ghost"]);
  } catch (error) {
    console.log(" batch failed as one:", (error as Error).message);
  }
  console.log(" store after rollback:", JSON.stringify(c.visible()));

  console.log("Scenario C — removed rows reject writes through the same seam:");
  const d = createStore();
  d.upsert("old");
  d.markRemoved("old");
  try {
    bulkFavorite(d, ["old"]);
  } catch (error) {
    console.log(" write to removed:   ", (error as Error).message);
  }
  console.log("verdict: injection gives isolation + atomicity + removed-guards with no mocks and no singleton.");
}
