// Scratch in-memory workload. No user database is read or changed.
const Database = require("better-sqlite3");
const db = new Database(":memory:");
db.exec("CREATE TABLE files(id TEXT PRIMARY KEY, filename TEXT, library_root TEXT, directory TEXT, removed_at TEXT)");
db.exec("CREATE INDEX idx_files_filename ON files(filename); CREATE INDEX idx_files_library_root ON files(library_root); CREATE INDEX idx_files_directory ON files(directory); CREATE INDEX idx_files_removed_at ON files(removed_at)");
const insert = db.prepare("INSERT INTO files VALUES (?,?,?,?,NULL)");
db.transaction(() => { for (let i = 0; i < 100000; i++) insert.run(String(i), `sound-${String(100000 - i).padStart(6, '0')}.wav`, `root-${i % 4}`, `dir-${i % 200}`); })();
const sql = "SELECT id, filename FROM files WHERE library_root = ? AND directory = ? AND removed_at IS NULL ORDER BY filename, id LIMIT 100";
function measure() {
  const statement = db.prepare(sql);
  for (let i = 0; i < 5; i++) statement.all("root-0", "dir-0");
  const times = [];
  for (let i = 0; i < 50; i++) { const start = performance.now(); statement.all("root-0", "dir-0"); times.push(performance.now() - start); }
  times.sort((a,b) => a-b);
  return { p50ms: times[25], p95ms: times[47], plan: db.prepare("EXPLAIN QUERY PLAN " + sql).all("root-0", "dir-0") };
}
const baseline = measure();
db.exec("CREATE INDEX candidate_browse ON files(library_root,directory,filename,id) WHERE removed_at IS NULL");
console.log(JSON.stringify({ rows: 100000, workload: "synthetic directory page, 50 warm samples", baseline, candidate: measure(), limitation: "No disk, concurrent scan, write-cost or real-library measurements. Candidate is not a production change." }, null, 2));
db.close();
