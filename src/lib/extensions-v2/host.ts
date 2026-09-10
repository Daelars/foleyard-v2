import {
  buildEffectiveV2Catalog,
  createV2ExtendedOperations,
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  type V2ExtendedOperationServices,
  type V2JobReporter,
  type V2OperationServices,
} from "@yard-core";

import { createV2ArchivePorts } from "./archive";
import { createV2FileContentPorts, getV2GrantStore } from "./filesystem";
import { getV2Events } from "./events";
import { getV2JobManager } from "./jobs";
import { createV2LibraryPorts } from "./library-ports";
import { createV2LibraryMutationPorts } from "./library-mutations";
import { createV2FolderScanPorts } from "./maintenance";
import { createV2CollectionPorts, createV2TagPorts } from "./organization";
import { createV2EmbeddingPorts } from "./embeddings";
import { createV2AnalysisPorts } from "./analysis";
import { createV2ShelfPorts } from "./shelf";
import { getV2SourceGrantStore } from "./source-grants";
import { ensureMakePackV2Registered } from "./make-pack-v2";
import { ensureSoundShelfV2Registered } from "./sound-shelf-v2";
import { ensureSmartCollectionsV2Registered } from "./smart-collections-v2";
import { ensureFolderJanitorV2Registered } from "./folder-janitor-v2";
import { ensureDropRulesV2Registered } from "./drop-rules-v2";
import { ensureLibraryGathererV2Registered } from "./library-gatherer-v2";
import { ensureAutoTagV2Registered } from "./auto-tag-v2";
import { getV2GrantedPermissions } from "./policy";
import { createV2ExtensionStatePorts, createV2SettingsPorts } from "./settings-state";
import {
  adoptRetiredV1Enablement,
  listPersistedEnabled,
  writePersistedEnabled,
} from "./enablement";
import { createRecentSelectionSource, createShelfSelectionSource } from "./sources";

/**
 * Application v2 host composition (Application context, R3).
 *
 * One execution path for HTTP and direct invocation: the thin Next
 * route wrappers forward to the transport codec with this host. v1
 * endpoints, adapters, and packages are untouched and never routed
 * through here. Make Pack v2 registers in `make-pack-v2.ts` (#171);
 * development fixtures register only in tests.
 */

const registry = new ExtensionV2Registry();

/**
 * Enablement lives on `globalThis`, not module state. Next compiles
 * each route into its own bundle, so plain module-level state can
 * split per route subtree in development: enabling in one bundle
 * would still read disabled in another. The process is the sharing
 * boundary (one realm), which is exactly what the process-wide host
 * needs. The set hydrates once per boot from persisted
 * `v2:enablement:*` rows (see enablement.ts), so enablement survives
 * reloads; a missing database falls back to memory-only, disabled by
 * default, exactly like the pre-persistence behavior.
 */
const V2_ENABLED_KEY = "__foleyardV2Enabled" as const;

let bootLoaded = false;

function ensureEnablementLoaded(): void {
  if (bootLoaded) return;
  bootLoaded = true;
  try {
    // Retirement adoption first: retired v1 tools hand their
    // enablement and approvals to their v2 port exactly once.
    adoptRetiredV1Enablement(
      (v2ExtensionId) => getV2Registry().get(v2ExtensionId)?.permissions ?? [],
    );
    for (const extensionId of listPersistedEnabled()) {
      enabled.add(extensionId);
    }
  } catch {
    // Missing or broken settings storage: memory-only enablement,
    // disabled by default, same as before persistence existed.
  }
}

function getEnabledSet(): Set<string> {
  const scope = globalThis as Record<string, unknown>;
  const existing = scope[V2_ENABLED_KEY];
  if (existing instanceof Set) return existing as Set<string>;
  const created = new Set<string>();
  scope[V2_ENABLED_KEY] = created;
  return created;
}

const enabled: Set<string> = getEnabledSet();

export function getV2Registry(): ExtensionV2Registry {
  return registry;
}

/**
 * Register a v2 definition through the production registry and notify
 * renderer adapters. Registration never enables: extensions stay
 * opt-in and disabled by default.
 */
export function registerV2Extension(
  definition: Parameters<ExtensionV2Registry["register"]>[0],
): void {
  registry.register(definition);
  getV2Events().emit("contributions-changed", "*");
}

/** Unregister removes every contribution; adapters refresh on the hint. */
export function unregisterV2Extension(extensionId: string): void {
  registry.unregister(extensionId);
  enabled.delete(extensionId);
  try {
    writePersistedEnabled(extensionId, false);
  } catch {
    // Persistence failure keeps the in-memory state; harmless for fixtures.
  }
  getV2Events().emit("contributions-changed", "*");
}

export function isV2ExtensionEnabled(extensionId: string): boolean {
  ensureEnablementLoaded();
  return enabled.has(extensionId);
}

/** V2 extensions are disabled by default and persist explicit enablement. */
export function setV2ExtensionEnabled(extensionId: string, value: boolean): void {
  ensureEnablementLoaded();
  const before = enabled.has(extensionId);
  if (value) {
    enabled.add(extensionId);
  } else {
    enabled.delete(extensionId);
    // Disabling rejects new work (the enabled gate) and requests
    // cancellation of the extension's live jobs; runners observe the
    // signal cooperatively and dispose owned work after settling.
    getV2JobManager().cancelExtensionJobs(
      extensionId,
      `Extension "${extensionId}" was disabled; enable it to run its commands.`,
    );
  }
  try {
    writePersistedEnabled(extensionId, value);
  } catch {
    // Persistence failure keeps the in-memory state; the next toggle retries.
  }
  // Renderer adapters refresh on this hint and drop cached resolutions;
  // disposal is idempotent, so a no-op toggle is still safe to emit.
  if (before !== value) {
    getV2Events().emit("contributions-changed", "*");
  }
}

function createOperations(binding: {
  extensionId: string;
  invocationId: string;
  effectivePermissions: string[];
  reporter?: V2JobReporter;
}): V2OperationServices {
  const declarations = registry.get(binding.extensionId)?.settings;
  const library = createV2LibraryPorts();
  const base = createV2OperationServices({
    ...binding,
    grants: getV2GrantStore(),
    sources: getV2SourceGrantStore(),
    library,
    files: createV2FileContentPorts(),
    archive: createV2ArchivePorts(),
    settings: createV2SettingsPorts(),
    extensionState: createV2ExtensionStatePorts(),
    selectionSources: [createShelfSelectionSource(), createRecentSelectionSource()],
    ...(declarations ? { settingsDeclarations: declarations } : {}),
    ...(binding.reporter ? { jobs: binding.reporter } : {}),
  });
  // E1 #176 gaps for the remaining ports: the extended groups compose
  // over the same binding (owner, invocation, effective set), so
  // preflight, context, and services agree. Mutation ports notify
  // after persisting (see each adapter); no extra notify wiring here.
  return {
    ...base,
    ...createV2ExtendedOperations({
      extensionId: binding.extensionId,
      effectivePermissions: binding.effectivePermissions,
      library,
      mutations: createV2LibraryMutationPorts(),
      collections: createV2CollectionPorts(),
      tags: createV2TagPorts(),
      embeddings: createV2EmbeddingPorts(),
      analysis: createV2AnalysisPorts(),
      shelf: createV2ShelfPorts(),
      folders: createV2FolderScanPorts(),
      sources: getV2SourceGrantStore(),
    }),
  };
}

/** Typed access to the extended groups on a handler context. */
export function extendedOperationsOf(context: { operations: V2OperationServices }): V2ExtendedOperationServices {
  return context.operations as V2ExtendedOperationServices;
}

function authorizeV2Grant(grantId: string, extensionId: string): { ok: true } | { ok: false; message: string } {
  const authorized = getV2GrantStore().authorize(grantId, extensionId);
  return authorized.ok ? { ok: true } : { ok: false, message: authorized.message };
}

/**
 * Process-wide v2 host: shares the registry, enablement, and the one
 * job manager every job route polls, so a request ending or a reload
 * never strands job ownership on a per-request instance.
 */
let appHost: ExtensionV2Host | null = null;

export function getAppV2Host(): ExtensionV2Host {
  if (!appHost) {
    appHost = new ExtensionV2Host({
      registry,
      isEnabled: isV2ExtensionEnabled,
      capabilities: {},
      grantedPermissions: (extensionId) => getV2GrantedPermissions(extensionId),
      ports: createV2LibraryPorts(),
      createOperations,
      authorizeGrant: authorizeV2Grant,
      jobManager: getV2JobManager(),
    });
  }
  return appHost;
}

/** Effective-permission catalog: renderers enforce exactly what execution denies. */
export function buildAppV2Catalog() {
  return buildEffectiveV2Catalog(registry, (extensionId) =>
    getV2GrantedPermissions(extensionId),
  );
}

// Bundled internal example (R8): Make Pack v2 registers here so every
// v2 route serves it without per-route branches. Registration never
// enables and never approves: the extension stays opt-in and denied
// by default until explicit enable + approval. The import cycle with
// `make-pack-v2.ts` is safe: that module only binds host functions
// for later calls and runs no top-level effects.
ensureMakePackV2Registered();
ensureSoundShelfV2Registered();
ensureSmartCollectionsV2Registered();
ensureFolderJanitorV2Registered();
ensureDropRulesV2Registered();
ensureLibraryGathererV2Registered();
ensureAutoTagV2Registered();
