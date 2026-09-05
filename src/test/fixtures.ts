import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { NextRequest } from "next/server";

import { initializeDatabaseSchema } from "@/lib/database/migrations";
import { registerGrant } from "@/lib/filesystem-boundary";

// Shared fixtures for the integration suite. The pieces here already existed,
// copied per file — seven test files stood up their own in-memory database,
// nineteen made their own temp directories, twelve built their own requests.
// Owning them once is what makes a small suite of end-to-end tests practical.

export type TestDatabase = ReturnType<typeof createTestDatabase>;

/** An in-memory database with the real schema applied. */
export function createTestDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  initializeDatabaseSchema(sqlite);
  return sqlite;
}

export interface AudioFileOverrides {
  path?: string;
  filename?: string;
  directory?: string;
  format?: string;
  codec?: string;
  duration?: number | null;
  sampleRate?: number | null;
  bitDepth?: number | null;
  channels?: number | null;
  fileSize?: number;
  mtimeMs?: number;
  removedAt?: string | null;
  lastScannedAt?: string;
}

/**
 * A complete audio file row. Every field has a default so a test states only
 * the one property it is actually about.
 */
export function audioFileRecord(overrides: AudioFileOverrides = {}) {
  const filename = overrides.filename ?? "hit.wav";
  const directory = overrides.directory ?? "/library";
  return {
    path: overrides.path ?? `${directory}/${filename}`,
    filename,
    directory,
    format: overrides.format ?? ".wav",
    codec: overrides.codec ?? "pcm",
    duration: overrides.duration === undefined ? 1.5 : overrides.duration,
    sampleRate: overrides.sampleRate === undefined ? 44100 : overrides.sampleRate,
    bitDepth: overrides.bitDepth === undefined ? 16 : overrides.bitDepth,
    channels: overrides.channels === undefined ? 2 : overrides.channels,
    fileSize: overrides.fileSize ?? 1024,
    mtimeMs: overrides.mtimeMs ?? 1_700_000_000_000,
    removedAt: overrides.removedAt === undefined ? null : overrides.removedAt,
    lastScannedAt: overrides.lastScannedAt ?? new Date().toISOString(),
  };
}

export interface ScratchLibrary {
  /** Absolute path to the scratch root, already realpath-resolved. */
  root: string;
  /** Creates a directory under the root and returns its absolute path. */
  directory(...segments: string[]): string;
  /** Writes a file with the given contents and returns its absolute path. */
  writeFile(relativePath: string, contents?: string): string;
  /** Registers a filesystem grant for a directory under the root. */
  grant(relativePath?: string): Promise<{ path: string; grantToken: string }>;
  /** Removes the scratch root. Safe to call more than once. */
  dispose(): void;
}

/**
 * A real directory tree in the OS temp area. Tests that assert on-disk outcomes
 * — overwrites, sidecars, junction escapes — need real files, not a mock.
 *
 * The root is realpath-resolved because macOS hands out /var paths that resolve
 * to /private/var, and the filesystem boundary compares resolved paths.
 */
export function createScratchLibrary(prefix = "foleyard-test-"): ScratchLibrary {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

  return {
    root,
    directory(...segments: string[]) {
      const target = path.join(root, ...segments);
      fs.mkdirSync(target, { recursive: true });
      return target;
    },
    writeFile(relativePath: string, contents = "audio") {
      const target = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
      return target;
    },
    async grant(relativePath?: string) {
      const target = relativePath ? path.join(root, relativePath) : root;
      fs.mkdirSync(target, { recursive: true });
      return registerGrant(target);
    },
    dispose() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export interface RouteResponse<T = unknown> {
  status: number;
  body: T;
}

type RouteHandler = (request: NextRequest) => Promise<Response> | Response;

/**
 * Drives a real route handler and parses the response. Route tests should go
 * through this rather than calling the service behind the route, because the
 * envelope validation and the error mapping are part of what they verify.
 */
export async function callRoute<T = unknown>(
  handler: RouteHandler,
  options: {
    method?: string;
    url?: string;
    body?: unknown;
    /** Sent raw, bypassing JSON.stringify, to exercise malformed input. */
    rawBody?: string;
  } = {},
): Promise<RouteResponse<T>> {
  const method = options.method ?? "POST";
  const url = options.url ?? "http://localhost/api/test";
  const init: ConstructorParameters<typeof NextRequest>[1] = { method };

  if (options.rawBody !== undefined) {
    init.body = options.rawBody;
  } else if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await handler(new NextRequest(url, init));
  const text = await response.text();

  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // A route that returns non-JSON is itself a finding; hand back the text.
      body = text;
    }
  }

  return { status: response.status, body: body as T };
}

type ExtensionServices = Record<string, unknown>;

/**
 * A Yard extension context with a real permission checker. Every extension
 * service test built this by hand; the checker is the part that matters, since
 * an extension's own `permissions.require` is currently the only thing standing
 * between it and a privileged service (finding E01).
 */
export function createExtensionContext(
  permissions: string[] = ["library:read", "files:read"],
  services: ExtensionServices = {},
) {
  const granted = new Set(permissions);
  return {
    services: {
      commands: { register: () => {} },
      ...services,
    },
    selection: { fileIds: [] as string[] },
    permissions: {
      has: (permission: string) => granted.has(permission),
      require: (permission: string) => {
        if (!granted.has(permission)) {
          throw new Error(`Missing permission: ${permission}`);
        }
      },
      list: () => Array.from(granted),
    },
    // Services and permission shapes are structural across yard-core and the
    // tools; the cast keeps a single fixture usable from both sides.
  } as never;
}

/**
 * A promise a test resolves or rejects on demand, for asserting what happens
 * when requests complete out of order. B04 and B11 are both out-of-order
 * defects, and neither is reachable without this.
 */
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
