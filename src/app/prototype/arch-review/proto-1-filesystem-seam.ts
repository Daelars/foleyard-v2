// PROTOTYPE (throwaway) for improvement point 1: mandatory filesystem seam.
// Question: exactly which operations escape policy under the optional seam,
// and does the mandatory seam close every one of them?
// Run: node src/app/prototype/arch-review/run-all.ts

type RawStore = Map<string, string>; // path -> content. Stands in for node:fs.
export type { RawStore as ProtoStore };

type Gate = {
  read: (path: string) => string;
  write: (path: string, content: string) => void;
  remove: (path: string) => void;
};
export type { Gate as ProtoGate };

function normalize(path: string): string {
  const parts: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return "/" + parts.join("/");
}

function makeGate(store: RawStore, roots: string[], grants: string[]): Gate {
  const allowed = (raw: string) => {
    const path = normalize(raw);
    return (
      roots.some((r) => path === r || path.startsWith(r + "/")) ||
      grants.some((g) => path === g || path.startsWith(g + "/"))
    );
  };
  const check = (op: string, raw: string) => {
    if (!allowed(raw)) throw new Error(`${op} DENIED: ${raw} (normalized: ${normalize(raw)})`);
  };
  const read = (raw: string) => {
    check("read", raw);
    const hit = store.get(normalize(raw));
    if (hit === undefined) throw new Error(`read NOT-FOUND: ${raw}`);
    return hit;
  };
  return {
    read,
    write: (raw, content) => {
      check("write", raw);
      store.set(normalize(raw), content);
    },
    remove: (raw) => {
      check("remove", raw);
      if (!store.delete(normalize(raw))) throw new Error(`remove NOT-FOUND: ${raw}`);
    },
  };
}

// Today's shape: tools that receive no `filesystem` touch the raw store.
function unguardedTool(store: RawStore, op: "read" | "write" | "remove", target: string) {
  if (op === "read") return store.get(target) ?? "missing";
  if (op === "write") {
    store.set(target, "tool output");
    return "wrote";
  }
  store.delete(target);
  return "removed";
}

export { normalize, makeGate };

function attempt(label: string, fn: () => string) {
  try {
    return `${label}: ${fn()}`;
  } catch (error) {
    return `${label}: ${(error as Error).message}`;
  }
}

export function run() {
  console.log("--- P1: mandatory filesystem seam ---");
  console.log("Scenario A — today's optional seam (raw store, no gate):");
  const open: RawStore = new Map([["/lib/kick.wav", "audio"]]);
  console.log(" " + attempt("read  /etc/shadow   ", () => unguardedTool(open, "read", "/etc/shadow")));
  console.log(" " + attempt("write /etc/evil.wav ", () => unguardedTool(open, "write", "/etc/evil.wav")));
  console.log(" " + attempt("remove /lib/kick.wav", () => unguardedTool(open, "remove", "/lib/kick.wav")));

  console.log("Scenario B — mandatory gate, full operation matrix:");
  const store: RawStore = new Map([
    ["/lib/kick.wav", "audio"],
    ["/out/pack-1/mix.wav", "audio"],
  ]);
  const gate = makeGate(store, ["/lib"], ["/out/pack-1"]);
  const cases: Array<[string, string]> = [
    ["read ", "/lib/kick.wav"],
    ["read ", "/lib/../etc/shadow"],
    ["read ", "/lib/missing.wav"],
    ["write", "/lib/snare.wav"],
    ["write", "/lib/../etc/evil.wav"],
    ["write", "/out/pack-1/mix.wav"],
    ["write", "/out/other/mix.wav"],
    ["remove", "/out/pack-1/mix.wav"],
    ["remove", "/lib/kick.wav"],
  ];
  for (const [op, target] of cases) {
    const fn =
      op === "read " ? () => gate.read(target) : op === "write" ? () => (gate.write(target, "x"), "wrote") : () => (gate.remove(target), "removed");
    console.log(` ${op} ${target.padEnd(22)} -> ${attempt("", fn).slice(2)}`);
  }

  console.log("Scenario C — grant expiry mid-session:");
  const liveGrants = ["/out/pack-1"];
  const gate2 = makeGate(store, ["/lib"], liveGrants);
  console.log(" " + attempt("write while granted ", () => (gate2.write("/out/pack-1/a.wav", "x"), "wrote")));
  liveGrants.length = 0; // restart/token expiry clears the grant list
  console.log(" " + attempt("write after expiry  ", () => (gate2.write("/out/pack-1/b.wav", "x"), "wrote")));

  console.log("verdict: optional seam escapes on read/write/remove incl. traversal; mandatory gate closes all three, normalizes .., and honors expiry.");
}
