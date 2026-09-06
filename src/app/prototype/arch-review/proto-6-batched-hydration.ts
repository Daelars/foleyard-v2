// PROTOTYPE (throwaway) for improvement point 6: batched hydration.
// Question: how do per-id loops vs chunked reads scale, and do chunk
// boundaries (999 vars) or missing ids change the answer?
// Run: node src/app/prototype/arch-review/run-all.ts

const CHUNK = 999; // SQLITE_MAX_VARIABLES - 1, as in sql-parameters.ts

export function makeDb(size: number) {
  const rows = new Map<string, string>();
  for (let i = 0; i < size; i++) rows.set(`id-${i}`, `file-${i}.wav`);
  let queries = 0;
  let cells = 0;
  return {
    getById: (id: string) => {
      queries++;
      cells++;
      return rows.get(id) ?? null;
    },
    getMany: (ids: string[]) => {
      const out: Array<string | null> = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        queries++;
        const slice = ids.slice(i, i + CHUNK);
        cells += slice.length;
        for (const id of slice) out.push(rows.get(id) ?? null);
      }
      return out;
    },
    markRemovedMany: (ids: string[]) => {
      queries++; // one transaction, one prepared statement
      return ids.length;
    },
    markRemovedLoop: (ids: string[]) => {
      for (const id of ids) {
        queries += 2; // getFileById + markFileRemoved per id, no txn
        void rows.get(id);
      }
      return ids.length;
    },
    stats: () => ({ queries, cells }),
  };
}
export const HYDRATION_CHUNK = CHUNK; // re-exported for the interactive section

export function compareHydration(size: number, ids: string[]) {
  const a = makeDb(size);
  const loopOut = ids.map((id) => a.getById(id));
  const b = makeDb(size);
  const batchOut = b.getMany(ids);
  return {
    loopQueries: a.stats().queries,
    batchQueries: b.stats().queries,
    identical: JSON.stringify(loopOut) === JSON.stringify(batchOut),
  };
}

function scenario(label: string, size: number, ids: string[]) {
  const a = makeDb(size);
  const loopOut = ids.map((id) => a.getById(id));
  const loopStats = a.stats();
  const b = makeDb(size);
  const batchOut = b.getMany(ids);
  const batchStats = b.stats();
  const same = JSON.stringify(loopOut) === JSON.stringify(batchOut);
  console.log(
    ` ${label.padEnd(28)} loop=${String(loopStats.queries).padStart(5)}q batched=${String(batchStats.queries).padStart(4)}q identical=${same}`,
  );
}

export function run() {
  console.log("--- P6: batched hydration ---");
  console.log("Scenario A — read scale (incl. missing ids and chunk edges):");
  const small = Array.from({ length: 10 }, (_, i) => `id-${i}`);
  scenario("10 ids", 10, small);
  scenario("500 ids", 500, Array.from({ length: 500 }, (_, i) => `id-${i}`));
  scenario("500 + 3 missing", 500, [...Array.from({ length: 500 }, (_, i) => `id-${i}`), "ghost-1", "ghost-2", "ghost-3"]);
  scenario("999 ids (chunk edge)", 1000, Array.from({ length: 999 }, (_, i) => `id-${i}`));
  scenario("1000 ids (chunk+1)", 1000, Array.from({ length: 1000 }, (_, i) => `id-${i}`));
  scenario("5000 ids", 5000, Array.from({ length: 5000 }, (_, i) => `id-${i}`));

  console.log("Scenario B — write path (mark-removed, 200 ids):");
  const c = makeDb(200);
  c.markRemovedLoop(Array.from({ length: 200 }, (_, i) => `id-${i}`));
  const d = makeDb(200);
  d.markRemovedMany(Array.from({ length: 200 }, (_, i) => `id-${i}`));
  console.log(` loop writes:   ${c.stats().queries} queries (2N, no transaction)`);
  console.log(` batched write: ${d.stats().queries} queries (one transaction)`);

  console.log("verdict: reads collapse to ceil(N/999); writes collapse 2N unbatched to 1; missing ids and chunk edges change nothing.");
}
