// One-off: generate the /workspace fork from the live app tree.
// Presentation .tsx is copied; logic .ts is shared by absolute import.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const rel = (p) => path.relative(SRC, p).split(path.sep).join("/");
const abs = (p) => path.join(SRC, p);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const SKIP = new Set(["PrototypeSwitcher.tsx", "UpdateNotifier.tsx"]);

// --- build the fork map: source rel path -> dest rel path -------------------
const forkMap = new Map();

for (const p of walk(path.join(SRC, "components"))) {
  const r = rel(p);
  if (!r.endsWith(".tsx")) continue;
  if (r.includes(".test.")) continue;
  if (r.startsWith("components/ui/")) {
    forkMap.set(r, r.replace("components/ui/", "components/kit/"));
    continue;
  }
  if (SKIP.has(path.basename(r))) continue;
  forkMap.set(r, r.replace("components/", "components/workspace/"));
}
forkMap.set("app/page.tsx", "app/workspace/page.tsx");
forkMap.set("app/library/dialogs.tsx", "app/workspace/dialogs.tsx");

// --- resolve a module specifier to a source rel path ------------------------
const EXTS = [".tsx", ".ts", "/index.tsx", "/index.ts"];
function resolveRel(fromRel, spec) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  for (const ext of EXTS) if (fs.existsSync(abs(base + ext))) return base + ext;
  return null;
}
function resolveAlias(spec) {
  const base = spec.slice(2); // strip "@/"
  for (const ext of EXTS) if (fs.existsSync(abs(base + ext))) return base + ext;
  return null;
}

// --- rewrite one file -------------------------------------------------------
const SPEC_RE = /(from\s+|import\s*\(\s*)(["'])([^"']+)\2/g;

function rewrite(fromRel, toRel, code) {
  return code.replace(SPEC_RE, (whole, lead, q, spec) => {
    let target = null;
    if (spec.startsWith("@/")) target = resolveAlias(spec);
    else if (spec.startsWith(".")) target = resolveRel(fromRel, spec);
    else return whole; // bare package

    if (!target) {
      // Non-TS relative asset (e.g. package.json): re-depth it for the fork.
      if (spec.startsWith(".")) {
        const flat = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
        const back = path.posix.relative(path.posix.dirname(toRel), path.posix.dirname(flat)) || ".";
        const fixed = (back.startsWith(".") ? back : "./" + back) + "/" + path.posix.basename(flat);
        return `${lead}${q}${fixed}${q}`;
      }
      return whole;
    }

    if (forkMap.has(target)) {
      // Point at the forked copy, as an absolute alias so moved files stay correct.
      const dest = forkMap.get(target);
      return `${lead}${q}@/${dest.replace(/(\.tsx|\.ts)$/, "")}${q}`;
    }
    // Shared file: always absolute, since the fork sits at a different depth.
    return `${lead}${q}@/${target.replace(/(\.tsx|\.ts)$/, "")}${q}`;
  });
}

let count = 0;
for (const [from, to] of forkMap) {
  const code = fs.readFileSync(abs(from), "utf8");
  const out = rewrite(from, to, code);
  fs.mkdirSync(path.dirname(abs(to)), { recursive: true });
  fs.writeFileSync(abs(to), out);
  count++;
}
console.log(`forked ${count} files`);
console.log([...forkMap.values()].filter((v) => v.startsWith("components/kit")).length, "into components/kit");
