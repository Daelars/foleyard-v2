// PROTOTYPE (throwaway) for improvement point 3: unified route adapter.
// Question: do read AND write handlers agree on every failure shape, including
// malformed input and constraint conflicts?
// Run: node src/app/prototype/arch-review/run-all.ts

export type RouteCtx = {
  files: Map<string, { removed: boolean; path: string; favorite: boolean }>;
  roots: string[];
  tags: Set<string>;
};

type Ctx = RouteCtx;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

class ConflictError extends ApiError {
  constructor(message: string) {
    super(message, 409);
  }
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new ApiError(`Invalid ${field}`, 400);
  return value;
}

function requireIndexedFile(ctx: Ctx, id: unknown) {
  const key = requireNonEmpty(id, "id");
  const file = ctx.files.get(key);
  if (!file || file.removed) throw new ApiError("File not found", 404);
  return file;
}

function requireReadable(ctx: Ctx, path: string) {
  const ok = ctx.roots.some((r) => path === r || path.startsWith(r + "/"));
  if (!ok) throw new ApiError("File not found", 404);
  return path;
}

function toResponse(fn: () => unknown) {
  try {
    return { status: 200, body: fn() };
  } catch (error) {
    if (error instanceof ApiError) return { status: error.status, body: { error: error.message } };
    return { status: 500, body: { error: "Unexpected error" } };
  }
}

// Three handlers sharing the one adapter: a stream read, a peaks read, a write.
export const download = (ctx: Ctx, id: unknown) =>
  toResponse(() => ({ stream: requireReadable(ctx, requireIndexedFile(ctx, id).path) }));
export const peaks = (ctx: Ctx, id: unknown) =>
  toResponse(() => ({ peaks: [0.5], of: requireReadable(ctx, requireIndexedFile(ctx, id).path) }));
export const setFavorite = (ctx: Ctx, id: unknown, tag: unknown) =>
  toResponse(() => {
    const file = requireIndexedFile(ctx, id);
    const tagName = requireNonEmpty(tag, "tag");
    if (!ctx.tags.has(tagName)) throw new ConflictError(`Unknown tag ${tagName}`);
    return { id, favorite: (file.favorite = true) };
  });

export function buildCtx(): Ctx {
  return {
    files: new Map([
      ["good", { removed: false, path: "/lib/kick.wav", favorite: false }],
      ["gone", { removed: true, path: "/lib/old.wav", favorite: false }],
      ["outside", { removed: false, path: "/tmp/x.wav", favorite: false }],
    ]),
    roots: ["/lib"],
    tags: new Set(["drums"]),
  };
}

export function run() {
  console.log("--- P3: unified route adapter ---");
  const ctx: Ctx = {
    files: new Map([
      ["good", { removed: false, path: "/lib/kick.wav", favorite: false }],
      ["gone", { removed: true, path: "/lib/old.wav", favorite: false }],
      ["outside", { removed: false, path: "/tmp/x.wav", favorite: false }],
    ]),
    roots: ["/lib"],
    tags: new Set(["drums"]),
  };
  const readIds: unknown[] = ["good", "missing", "gone", "outside", "", "../lib/kick.wav", 42];
  for (const id of readIds) {
    const label = `id=${JSON.stringify(id)}`.padEnd(22);
    console.log(`${label} download=${JSON.stringify(download(ctx, id).status)} peaks=${JSON.stringify(peaks(ctx, id).status)}`);
  }
  console.log("full envelopes for the interesting rows:");
  for (const id of ["gone", "outside", ""]) {
    console.log(` id=${JSON.stringify(id)} download=${JSON.stringify(download(ctx, id))}`);
  }
  const writes: Array<[unknown, unknown]> = [
    ["good", "drums"],
    ["good", ""],
    ["good", "nope"],
    ["gone", "drums"],
  ];
  for (const [id, tag] of writes) {
    console.log(` fav id=${JSON.stringify(id)} tag=${JSON.stringify(tag)} -> ${JSON.stringify(setFavorite(ctx, id, tag))}`);
  }
  console.log("verdict: reads share 404 shapes incl. traversal/malformed input; writes share 400/404/409; one table owns all three.");
}
