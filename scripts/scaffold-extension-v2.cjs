#!/usr/bin/env node
/**
 * Scaffold a minimal v2 extension package (Application context, R9).
 *
 * Usage:
 *   node scripts/scaffold-extension-v2.cjs --name <kebab-case> [--out <dir>] [--title "..."] [--description "..."] [--force]
 *
 * The default output is `packages/yard-tools/<name>`. The generated
 * package is a valid minimal v2 extension: a definition with one
 * command, one setting, and palette/settings contributions, a
 * runMode-aware handler file, a vitest suite that registers the
 * definition and executes it through the real `ExtensionV2Host`, and
 * a README with the explicit static registration snippet.
 *
 * Verify a scaffolded package with:
 *   bunx tsc --noEmit
 *   bunx vitest run packages/yard-tools/<name> --no-coverage
 *
 * Bundled packages use explicit static registration (an import plus
 * one registration call in application code); there is no installer.
 * The generated README shows the exact snippet. This script never
 * edits existing files: it only writes the new package directory
 * (refusing to overwrite unless --force is given).
 */

const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  console.error(`scaffold-extension-v2: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { name: null, out: null, title: null, description: null, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--name") args.name = argv[(i += 1)];
    else if (token === "--out") args.out = argv[(i += 1)];
    else if (token === "--title") args.title = argv[(i += 1)];
    else if (token === "--description") args.description = argv[(i += 1)];
    else if (token === "--force") args.force = true;
    else if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node scripts/scaffold-extension-v2.cjs --name <kebab-case> [--out <dir>] [--title ...] [--description ...] [--force]",
      );
      process.exit(0);
    } else fail(`unknown argument ${JSON.stringify(token)} (see --help)`);
  }
  return args;
}

function toPascal(slug) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function packageJson(slug) {
  return `{
  "name": "@foleyard/${slug}",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "yard-core": "workspace:*"
  }
}
`;
}

function definitionSource(slug, pascal, title, description) {
  return `import {
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
} from "yard-core";

/**
 * ${title} (v2 extension definition).
 *
 * Framework-free data: identity, API version, declared permissions,
 * one command, one setting, and data-only UI contributions. No React,
 * no routes, no database handles, no v1 extension imports. The host
 * derives registration, catalog metadata, input validation, and
 * settings controls from this single definition.
 */

export const EXTENSION_ID = "${slug}";
export const COMMAND_DESCRIBE = "${slug}.describe";
export const SETTING_PREFIX = "${slug}.prefix";

export function create${pascal}Definition(): ExtensionV2Definition {
  return {
    id: EXTENSION_ID,
    name: "${title}",
    version: "0.1.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description: "${description}",
    permissions: ["library:read", "settings:read"],
    commands: [
      {
        id: COMMAND_DESCRIBE,
        title: "${title} describe",
        description: "Describe the current invocation without side effects.",
        scope: "global",
        input: {
          kind: "object",
          properties: { note: { kind: "string", maxLength: 280 } },
        },
        result: { kind: "string" },
      },
    ],
    settings: [
      {
        id: SETTING_PREFIX,
        label: "Prefix",
        description: "Text prepended to the describe output.",
        type: "string",
        defaultValue: "${slug}",
      },
    ],
    contributions: [
      {
        id: "${slug}.palette-describe",
        type: "command-palette",
        commandId: COMMAND_DESCRIBE,
      },
      {
        id: "${slug}.settings-entry",
        type: "settings",
        commandId: COMMAND_DESCRIBE,
        title: "${title} settings",
      },
    ],
    docsRefs: [{ id: "commands", title: "Command authoring" }],
  };
}
`;
}

function handlersSource(slug, pascal) {
  return `import {
  immediateV2Result,
  type ExtensionV2Host,
  type V2HandlerContext,
  type V2HandlerResult,
} from "yard-core";

import { COMMAND_DESCRIBE, EXTENSION_ID, SETTING_PREFIX } from "./definition";

/**
 * ${slug} command handlers.
 *
 * Every privileged effect runs through the invocation's v2 operation
 * services (here: one namespaced settings read). The handler branches
 * on \`context.runMode\` when preview and execution differ: \`direct\`
 * previews without side effects, \`apply\` runs after a reviewed plan,
 * and \`job\` runs in the background. This describe command is pure in
 * every mode and echoes the mode so the execution inspector can show
 * how the run was reached. No v1 imports, no direct filesystem access.
 */

export function describe${pascal}(context: V2HandlerContext): V2HandlerResult {
  const input = (context.invocation.input ?? {}) as { note?: unknown };
  const note =
    typeof input.note === "string" && input.note.length > 0 ? input.note : "no note";
  const prefix = context.operations.settings.get(SETTING_PREFIX, "${slug}");
  return immediateV2Result(
    String(prefix) +
      ": " +
      note +
      " (" +
      context.files.length +
      " file(s) in scope, runMode=" +
      context.runMode +
      ")",
  );
}

/** Register every command on a v2 host (ownership-keyed, no name tables). */
export function register${pascal}Handlers(host: ExtensionV2Host): void {
  host.registerHandler(EXTENSION_ID, COMMAND_DESCRIBE, (context) =>
    describe${pascal}(context),
  );
}
`;
}

function indexSource(pascal) {
  return `export {
  COMMAND_DESCRIBE,
  EXTENSION_ID,
  SETTING_PREFIX,
  create${pascal}Definition,
} from "./definition";
export { describe${pascal}, register${pascal}Handlers } from "./handlers";
`;
}

function testSource(slug, pascal, title) {
  return `import { describe, expect, it } from "vitest";

import {
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  parseCatalog,
  serializeCatalog,
  V2GrantStore,
  type V2ArchivePorts,
  type V2ExtensionStatePorts,
  type V2FileContentPorts,
  type V2HostServices,
  type V2LibraryReadPorts,
  type V2SettingsPorts,
} from "yard-core";

import {
  COMMAND_DESCRIBE,
  create${pascal}Definition,
  EXTENSION_ID,
} from "./definition";
import { register${pascal}Handlers } from "./handlers";

// Area: extension v2 R9 (scaffold output). The scaffolded package must
// typecheck (covered by the repo \`bunx tsc --noEmit\`) and run: the
// definition registers, its catalog round-trips serializable, and the
// command executes through the real host with observable behavior.

function unusedFiles(): V2FileContentPorts {
  const unused = async (): Promise<never> => {
    throw new Error("unused in this test");
  };
  return {
    readFileBytes: unused,
    copyFile: unused,
    writeFileBytes: unused,
    deleteFile: unused,
    exists: async () => false,
    libraryRoots: () => [],
    pathIo: () => ({
      realpath: unused,
      lstat: unused,
    }),
  };
}

function unusedArchive(): V2ArchivePorts {
  return {
    createZipArchive: async () => {
      throw new Error("unused in this test");
    },
  };
}

function memorySettings(): V2SettingsPorts {
  const store = new Map<string, unknown>();
  return {
    readRaw: (key) => store.get(key),
    writeRaw: (key, value) => {
      store.set(key, value);
    },
  };
}

function memoryState(): V2ExtensionStatePorts {
  const store = new Map<string, Record<string, unknown>>();
  return {
    readAll: (extensionId) => store.get(extensionId) ?? {},
    writeAll: (extensionId, state) => {
      store.set(extensionId, state);
    },
  };
}

function services(registry: ExtensionV2Registry): V2HostServices {
  const library: V2LibraryReadPorts = {
    getFileById: () => null,
    getFilesByIds: () => [],
    listPage: () => ({ files: [], nextCursor: null }),
  };
  const settings = memorySettings();
  const extensionState = memoryState();
  return {
    registry,
    isEnabled: () => true,
    capabilities: [],
    grantedPermissions: () => ["library:read", "settings:read"],
    ports: library,
    createOperations: (binding) =>
      createV2OperationServices({
        ...binding,
        grants: new V2GrantStore(),
        library,
        files: unusedFiles(),
        archive: unusedArchive(),
        settings,
        extensionState,
        settingsDeclarations: registry.get(binding.extensionId)?.settings,
      }),
  };
}

function testHost(): ExtensionV2Host {
  const registry = new ExtensionV2Registry();
  registry.register(create${pascal}Definition());
  const host = new ExtensionV2Host(services(registry));
  register${pascal}Handlers(host);
  return host;
}

describe("${title} (scaffolded v2 package)", () => {
  it("registers and projects a serializable catalog", () => {
    const registry = new ExtensionV2Registry();
    registry.register(create${pascal}Definition());
    const roundTripped = parseCatalog(serializeCatalog(registry.buildCatalog()));
    expect(roundTripped.entries.map((entry) => entry.id)).toEqual([EXTENSION_ID]);
  });

  it("executes the describe command and echoes the run mode", async () => {
    const result = await testHost().execute({
      extensionId: EXTENSION_ID,
      commandId: COMMAND_DESCRIBE,
      input: { note: "hello" },
      selection: { fileIds: [] },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.outcome.kind === "immediate") {
      expect(result.outcome.value).toContain("runMode=direct");
      expect(result.outcome.value).toContain("hello");
    } else {
      expect.unreachable("expected an immediate string outcome");
    }
  });

  it("denies execution while disabled and rejects mistyped input", async () => {
    const registry = new ExtensionV2Registry();
    registry.register(create${pascal}Definition());
    const disabled = new ExtensionV2Host({ ...services(registry), isEnabled: () => false });
    register${pascal}Handlers(disabled);
    const denied = await disabled.execute({
      extensionId: EXTENSION_ID,
      commandId: COMMAND_DESCRIBE,
      selection: { fileIds: [] },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("extension-disabled");

    const mistyped = await testHost().execute({
      extensionId: EXTENSION_ID,
      commandId: COMMAND_DESCRIBE,
      input: { note: 42 },
      selection: { fileIds: [] },
    });
    expect(mistyped.ok).toBe(false);
    if (!mistyped.ok) expect(mistyped.code).toBe("input-invalid");
  });
});
`;
}

function readmeSource(slug, pascal, title, description) {
  return `# ${title} (v2 extension)

${description}

Minimal v2 extension package generated by
\`node scripts/scaffold-extension-v2.cjs --name ${slug}\`.
Conformance example, not a production workflow: one global command
(\`${slug}.describe\`), one namespaced setting (\`${slug}.prefix\`),
and command-palette plus settings contributions.

## Run

\`\`\`sh
bunx tsc --noEmit
bunx vitest run packages/yard-tools/${slug} --no-coverage
\`\`\`

## Enable (explicit static registration)

Bundled v2 packages use explicit static registration; there is no
installer. Registration never enables and never approves permissions:

\`\`\`ts
import { create${pascal}Definition, register${pascal}Handlers } from "@foleyard/${slug}";
import { getAppV2Host, registerV2Extension } from "@/lib/extensions-v2/host";

registerV2Extension(create${pascal}Definition());
register${pascal}Handlers(getAppV2Host());
\`\`\`

Then enable the extension through \`PATCH
/api/extensions-v2/extensions/${slug}\` and approve its declared
permissions through the approvals route. The extension stays disabled
and denied by default until both steps complete.

## Conformance notes

- The definition is the single source for registration, catalog
  metadata, input validation, and settings controls.
- The handler reads only its own namespaced setting through v2
  operation services and echoes \`runMode\` so the execution
  inspector shows how the run was reached.
- No v1 extension imports; no React, routes, or database handles.
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.name) fail("--name <kebab-case> is required");
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(args.name)) {
    fail(
      `--name must be kebab-case starting with a letter (got ${JSON.stringify(args.name)})`,
    );
  }
  const slug = args.name;
  const pascal = toPascal(slug);
  const title = args.title ?? pascal;
  const description =
    args.description ?? `Minimal v2 extension example generated by the repository scaffold.`;
  const repoRoot = path.resolve(__dirname, "..");
  const outDir = path.resolve(repoRoot, args.out ?? path.join("packages", "yard-tools", slug));
  if (!outDir.startsWith(repoRoot + path.sep)) {
    fail(`--out must stay inside the repository (got ${JSON.stringify(args.out)})`);
  }
  if (fs.existsSync(outDir) && !args.force) {
    fail(`output ${outDir} already exists (pass --force to overwrite)`);
  }
  const files = {
    "package.json": packageJson(slug),
    "src/definition.ts": definitionSource(slug, pascal, title, description),
    "src/handlers.ts": handlersSource(slug, pascal),
    "src/index.ts": indexSource(pascal),
    "src/handlers.test.ts": testSource(slug, pascal, title),
    "README.md": readmeSource(slug, pascal, title, description),
  };
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(outDir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  console.log(`scaffolded v2 extension "${slug}" in ${path.relative(repoRoot, outDir)}`);
  for (const relative of Object.keys(files)) console.log(`  created ${relative}`);
  console.log("verify with:");
  console.log("  bunx tsc --noEmit");
  console.log(`  bunx vitest run ${path.relative(repoRoot, outDir)} --no-coverage`);
}

main();
