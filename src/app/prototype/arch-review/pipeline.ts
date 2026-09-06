// PROTOTYPE (throwaway): ONE end-to-end slice through all seven deepening points.
// Story: select files, run a pack-style tool, report completion.
// Old architecture vs deepened architecture, same inputs, side-by-side verdicts.
// Run: node src/app/prototype/arch-review/run-all.ts (prints both runs)

const BEHAVIORS_SPEC = "./proto-5-canonical-behaviors.ts";
const GATE_SPEC = "./proto-1-filesystem-seam.ts";

type Namers = {
  canonicalUnique: (planned: Set<string>, onDisk: Set<string>, base: string) => string;
  makePackUnique: (planned: Set<string>, base: string) => string;
};
type GateMaker = {
  makeGate: (
    store: Map<string, string>,
    roots: string[],
    grants: string[],
  ) => {
    read: (path: string) => string;
    write: (path: string, content: string) => void;
    remove: (path: string) => void;
  };
};

// Filenames live behind variables so tsc's no-.ts-import rule stays quiet;
// node resolves them at runtime with type stripping.
const { canonicalUnique, makePackUnique } = (await import(BEHAVIORS_SPEC)) as Namers;
const { makeGate } = (await import(GATE_SPEC)) as GateMaker;

export type ArchMode = "old" | "new";

export type LibraryFile = { id: string; name: string; path: string };

export type StageLine = { stage: string; text: string; bad?: boolean };

export type PipelineResult = {
  lines: StageLine[];
  queries: number;
  deniedWrites: number;
  overwrites: number;
  reported: boolean;
  outputs: string[];
};

// The world both architectures run against.
export function buildWorld() {
  return {
    files: new Map<string, LibraryFile>([
      ["f1", { id: "f1", name: "kick.wav", path: "/lib/kick.wav" }],
      ["f2", { id: "f2", name: "mix.wav", path: "/lib/mix.wav" }],
      ["f3", { id: "f3", name: "evil.wav", path: "/tmp/evil.wav" }],
    ]),
    disk: new Map<string, string>([
      ["/lib/kick.wav", "audio"],
      ["/lib/mix.wav", "audio"],
      ["/out/pack-1/mix.wav", "someone else's pack"],
    ]),
    roots: ["/lib"],
    grants: ["/out/pack-1"],
  };
}
export type World = ReturnType<typeof buildWorld>;

// --- old architecture: today's shapes, composed ---
function runOld(world: World, selectedIds: string[]): PipelineResult {
  const lines: StageLine[] = [];
  let queries = 0;
  let overwrites = 0;
  const deniedWrites = 0;
  const outputs: string[] = [];

  // P3-old: each handler spells its own checks, divergent messages.
  const hydrated: LibraryFile[] = [];
  for (const id of selectedIds) {
    queries++; // P6-old: getFileById per id
    const file = world.files.get(id);
    if (!file) {
      lines.push({ stage: "route", text: `hydrate ${id}: missing id (200 with null row)`, bad: true });
      continue;
    }
    hydrated.push(file);
  }
  lines.push({ stage: "route", text: `hydrated ${hydrated.length}/${selectedIds.length} in ${queries} queries` });

  // P1-old + P5-old: raw fs, planned-only names.
  const planned = new Set<string>();
  for (const file of hydrated) {
    const outName = makePackUnique(planned, file.name);
    const outPath = `/out/pack-1/${outName}`;
    const existed = world.disk.has(outPath);
    if (existed) overwrites++;
    world.disk.set(outPath, `packed:${file.id}`); // no root check: /tmp/evil.wav packs fine
    outputs.push(outPath);
    lines.push({
      stage: "tool",
      text: `${file.path} -> ${outPath}${existed ? " (OVERWROTE on-disk file)" : ""}`,
      bad: existed || !file.path.startsWith("/lib"),
    });
  }

  // P7-old: renderer emits a renamed string channel; main never hears it.
  const emitted: string = "pack:finished";
  const mainListens: string = "pack:done";
  const reported = emitted === mainListens;
  lines.push({ stage: "report", text: `emitted '${emitted}', main listens '${mainListens}': ${reported ? "heard" : "dropped silently"}`, bad: !reported });

  void deniedWrites;
  return { lines, queries, deniedWrites, overwrites, reported, outputs };
}

// --- new architecture: the seven deepenings, composed ---
function runNew(world: World, selectedIds: string[]): PipelineResult {
  const lines: StageLine[] = [];
  let deniedWrites = 0;
  const overwrites = 0;
  const outputs: string[] = [];

  // P3-new: one adapter, uniform envelopes.
  const hydrated: LibraryFile[] = [];
  for (const id of selectedIds) {
    const file = world.files.get(id);
    if (!file) {
      lines.push({ stage: "route", text: `hydrate ${id}: 404 File not found` });
      continue;
    }
    hydrated.push(file);
  }
  const queries = 1; // P6-new: one chunked read for the whole selection
  lines.push({ stage: "route", text: `hydrated ${hydrated.length}/${selectedIds.length} in ${queries} query` });

  // P1-new + P5-new: mandatory gate, canonical names. Outputs collide only
  // with files already in the destination, not with same-named library files.
  const gate = makeGate(world.disk, world.roots, world.grants);
  const planned = new Set<string>();
  const destPrefix = "/out/pack-1/";
  const onDiskNames = new Set(
    [...world.disk.keys()].filter((p) => p.startsWith(destPrefix)).map((p) => p.split("/").pop() ?? ""),
  );
  const CHANNELS = { "pack:finished": ["outputs"] } as const; // P7-new: typed registry
  for (const file of hydrated) {
    try {
      gate.read(file.path); // inputs from outside roots never reach the tool
    } catch (error) {
      deniedWrites++;
      lines.push({ stage: "tool", text: `${file.path}: ${(error as Error).message}`, bad: true });
      continue;
    }
    const outName = canonicalUnique(planned, onDiskNames, file.name);
    const outPath = `/out/pack-1/${outName}`;
    try {
      gate.write(outPath, `packed:${file.id}`);
      outputs.push(outPath);
      lines.push({ stage: "tool", text: `${file.path} -> ${outPath}` });
    } catch (error) {
      deniedWrites++;
      lines.push({ stage: "tool", text: `${file.path}: ${(error as Error).message}`, bad: true });
    }
  }

  // P7-new: emit through the registry; unknown channels don't compile.
  const emit = (channel: keyof typeof CHANNELS) => channel === "pack:finished";
  const reported = emit("pack:finished");
  lines.push({ stage: "report", text: `registry (${Object.keys(CHANNELS).length} channel) emit 'pack:finished': heard`, bad: !reported });

  void overwrites;
  return { lines, queries, deniedWrites, overwrites, reported, outputs };
}

export function runPipeline(mode: ArchMode, selectedIds: string[]): PipelineResult {
  const world = buildWorld(); // fresh world per run: P4-style isolation, P2-style id selection
  return mode === "old" ? runOld(world, selectedIds) : runNew(world, selectedIds);
}

export function run() {
  console.log("--- P0: one pipeline through all seven points ---");
  const ids = ["f1", "f2", "f3", "ghost"];
  for (const mode of ["old", "new"] as const) {
    const r = runPipeline(mode, ids);
    console.log(` ${mode}: queries=${r.queries} denied=${r.deniedWrites} overwrites=${r.overwrites} reported=${r.reported}`);
    for (const line of r.lines) console.log(`   [${line.stage}] ${line.text}`);
  }
  console.log("verdict: same inputs; old leaks, overwrites, N+1s and drops the report — new gates, batches, suffixes and is heard.");
}
