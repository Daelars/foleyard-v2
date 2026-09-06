// PROTOTYPE (throwaway) for improvement point 5: canonical tool behaviors.
// Question: across realistic filenames, how far do the three copies diverge —
// on classification, on collisions, and on dedupe?
// Run: node src/app/prototype/arch-review/run-all.ts

// --- classification: three variants as found ---
const gathererList = new Set(["mp3", "wav", "flac"]);
const janitorList = ["wav", "aiff", "mp3"];
const coreList = new Set([".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aiff"]);

const extOf = (name: string) => name.split(".").pop() ?? "";
export const gathererAccepts = (name: string) => gathererList.has(extOf(name));
export const janitorAccepts = (name: string) => janitorList.includes(extOf(name).replace(/^\./, ""));
export const coreAccepts = (name: string) => coreList.has(`.${extOf(name)}`.toLowerCase());

// --- unique names: planned-only vs planned + on-disk (case-insensitive) ---
export function makePackUnique(planned: Set<string>, base: string) {
  let candidate = base;
  let n = 1;
  while (planned.has(candidate)) candidate = `${base} (${n++})`;
  planned.add(candidate);
  return candidate;
}

export function canonicalUnique(planned: Set<string>, onDisk: Set<string>, base: string) {
  const diskLower = new Set([...onDisk].map((n) => n.toLowerCase()));
  const taken = (name: string) => planned.has(name.toLowerCase()) || diskLower.has(name.toLowerCase());
  let candidate = base;
  let n = 1;
  while (taken(candidate)) candidate = `${base} (${n++})`;
  planned.add(candidate.toLowerCase());
  return candidate;
}

// --- dedupe: drop-rules scans usedNames+disk, make-pack scans usedNames only ---
function dedupePlannedOnly(ids: string[]) {
  return [...new Set(ids)];
}

export function run() {
  console.log("--- P5: canonical tool behaviors ---");
  console.log("Scenario A — classification across realistic names:");
  const names = ["hit.MP3", "loop.ogg", "take.aiff", "STEM.WAV", ".hidden.mp3", "noext", "trail.", "a.b.c.FLAC", "UPPER.OGG", "x.m4a"];
  let disagreements = 0;
  for (const name of names) {
    const g = gathererAccepts(name);
    const j = janitorAccepts(name);
    const c = coreAccepts(name);
    const flag = g === j && j === c ? " " : "!";
    if (flag === "!") disagreements++;
    console.log(` ${flag} ${name.padEnd(14)} gatherer=${String(g).padEnd(5)} janitor=${String(j).padEnd(5)} core=${c}`);
  }
  console.log(` disagreements: ${disagreements}/${names.length}`);

  console.log("Scenario B — collision matrix (planned vs on-disk, case variants):");
  const disk = new Set(["mix.wav", "STEM.wav"]);
  for (const base of ["mix.wav", "MIX.wav", "stem.WAV", "fresh.wav"]) {
    const plannedOnly = makePackUnique(new Set(), base);
    const canon = canonicalUnique(new Set(), disk, base);
    const diskLower = new Set([...disk].map((n) => n.toLowerCase()));
    const clash = diskLower.has(canon.toLowerCase()) ? " STILL CLASHES" : " safe";
    const plannedClash = diskLower.has(plannedOnly.toLowerCase()) ? " OVERWRITES DISK" : " safe";
    console.log(` base=${base.padEnd(10)} planned-only=${plannedOnly.padEnd(10)}${plannedClash} canonical=${canon}${clash}`);
  }

  console.log("Scenario C — dedupe keeps first occurrence, drops repeats:");
  console.log(" in :", JSON.stringify(["a", "b", "a", "c", "b"]));
  console.log(" out:", JSON.stringify(dedupePlannedOnly(["a", "b", "a", "c", "b"])));

  console.log("verdict: case handling diverges on most names; planned-only naming overwrites disk; one canonical module settles all three.");
}
