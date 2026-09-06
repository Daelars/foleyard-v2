// PROTOTYPE runner (throwaway). One command: node src/app/prototype/arch-review/run-all.ts
// Filenames live behind a variable so tsc's no-.ts-import rule stays quiet;
// node resolves them at runtime with type stripping.
export {};
const modules = [
  "./pipeline.ts",
  "./proto-1-filesystem-seam.ts",
  "./proto-2-derived-selection.ts",
  "./proto-3-route-adapter.ts",
  "./proto-4-repository-seam.ts",
  "./proto-5-canonical-behaviors.ts",
  "./proto-6-batched-hydration.ts",
  "./proto-7-ipc-contract.ts",
];

for (const specifier of modules) {
  const mod = (await import(specifier)) as { run: () => void };
  mod.run();
  console.log("");
}
console.log("All 7 architecture prototypes ran. Throwaway code: do not import from src.");
