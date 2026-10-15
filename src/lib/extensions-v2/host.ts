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

import { getAvailableCapabilityIds } from "@/lib/capabilities";

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
import { getV2Runtime } from "./runtime";
import { getV2SourceGrantStore } from "./source-grants";
import { ensureMakePackV2Registered } from "./make-pack-v2";
import { ensureSoundShelfV2Registered } from "./sound-shelf-v2";
import { ensureSmartCollectionsV2Registered } from "./smart-collections-v2";
import { ensureFolderJanitorV2Registered } from "./folder-janitor-v2";
import { ensureDropRulesV2Registered } from "./drop-rules-v2";
import { ensureLibraryGathererV2Registered } from "./library-gatherer-v2";
import { ensureAutoTagV2Registered } from "./auto-tag-v2";
import { getV2GrantedPermissions } from "./policy";
import { createV2ExtensionStatePorts, createV2SettingsPorts, getV2WorkflowState } from "./settings-state";
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
 * through here. Make Pack v2 registers in `make-pack-v2.ts` (#171).
 *
 * Registration, execution, plans, jobs, enablement, approvals, grants,
 * and events all live on the one process-wide runtime (`runtime.ts`),
 * not on module state: Next compiles each route into its own bundle, so
 * module state forks per route subtree while the process is one realm.
 * Every route observes the same registry, the same host, the same plan
 * manager, and the same enablement/approval/grant state.
 */

function ensureEnablementLoaded(): void {
  const runtime = getV2Runtime();
  if (runtime.enablementLoaded) return;
  try {
    // Retirement adoption first: retired v1 tools hand their
    // enablement and approvals to their v2 port exactly once.
    adoptRetiredV1Enablement(
      (v2ExtensionId) => getV2Registry().get(v2ExtensionId)?.permissions ?? [],
    );
    for (const extensionId of listPersistedEnabled()) {
      runtime.enabled.add(extensionId);
    }
    runtime.enablementLoaded = true;
    runtime.policyDegraded = null;
  } catch {
    // Missing or broken settings storage: memory-only enablement,
    // disabled by default. `enablementLoaded` stays false so the next
    // call retries instead of freezing on a partial read.
    runtime.policyDegraded =
      "Extension enablement could not be read; extensions stay disabled until storage recovers.";
  }
}

export function getV2Registry(): ExtensionV2Registry {
  return getV2Runtime().registry;
}

/**
 * Register a v2 definition through the production registry and notify
 * renderer adapters. Registration never enables: extensions stay
 * opt-in and disabled by default.
 */
export function registerV2Extension(
  definition: Parameters<ExtensionV2Registry["register"]>[0],
): void {
  getV2Registry().register(definition);
  getV2Events().emit("contributions-changed", "*");
}

/**
 * Unregister removes the extension completely: its handlers, its jobs and
 * its enablement, then the definition. A later re-registration must
 * register handlers again — stale handlers can never execute. Bundled
 * code has no hot-reload path; this is the supported unload operation
 * (see the authoring guide).
 */
export function unregisterV2Extension(extensionId: string): void {
  getAppV2Host().unregisterExtensionHandlers(extensionId);
  getV2JobManager().cancelExtensionJobs(
    extensionId,
    `Extension "${extensionId}" was unregistered; register it again to run its commands.`,
  );
  getV2Registry().unregister(extensionId);
  getV2Runtime().enabled.delete(extensionId);
  try {
    writePersistedEnabled(extensionId, false);
  } catch {
    // The in-memory removal stands (the extension is gone from this
    // process); the persisted disablement could not be written, so
    // record the degraded state rather than claiming durability.
    getV2Runtime().policyDegraded =
      `Disablement of "${extensionId}" could not be persisted; a restart may re-enable it.`;
  }
  getV2Events().emit("contributions-changed", "*");
}

export function isV2ExtensionEnabled(extensionId: string): boolean {
  ensureEnablementLoaded();
  return getV2Runtime().enabled.has(extensionId);
}

/**
 * Invoke one declared lifecycle hook. Hooks run after enablement is
 * persisted and before the `contributions-changed` notification. A hook
 * failure is isolated and reported: the enablement change stands, and the
 * caller never sees a rejection.
 */
async function runV2LifecycleHook(
  extensionId: string,
  hook: "onEnabled" | "onDisabled",
): Promise<void> {
  const commandId = getV2Registry().get(extensionId)?.lifecycle?.[hook]?.commandId;
  if (!commandId) return;
  try {
    // The lifecycle path skips only the enabled gate, so a disable hook
    // can run after the extension is disabled while every other check
    // (ownership, availability, permissions, grants) still applies.
    const result = await getAppV2Host().runLifecycleHook({
      extensionId,
      commandId,
      selection: { fileIds: [] },
    });
    if (!result.ok) {
      console.error(
        `v2 lifecycle hook ${hook} for "${extensionId}" failed: ${result.code}: ${result.message}`,
      );
    }
  } catch (error) {
    console.error(`v2 lifecycle hook ${hook} for "${extensionId}" failed`, error);
  }
}

/**
 * V2 extensions are disabled by default and persist explicit enablement.
 * State and persistence update synchronously; declared lifecycle hooks run
 * after persist and before notify (async callers can await that ordering).
 *
 * Durability (#266): a write failure is never reported as success.
 * Enabling rolls back (no unpersisted enablement); disabling stays
 * fail-closed in memory (the extension is disabled now) and records an
 * explicit degraded state, because it may return on restart.
 */
export async function setV2ExtensionEnabled(
  extensionId: string,
  value: boolean,
): Promise<void> {
  ensureEnablementLoaded();
  const runtime = getV2Runtime();
  const before = runtime.enabled.has(extensionId);
  if (value) {
    runtime.enabled.add(extensionId);
  } else {
    runtime.enabled.delete(extensionId);
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
    runtime.policyDegraded = null;
  } catch (error) {
    if (value) runtime.enabled.delete(extensionId);
    runtime.policyDegraded = value
      ? "Extension enablement could not be persisted; it was not enabled."
      : "Extension disablement could not be persisted; it is disabled now but may return on restart.";
    throw error;
  }
  if (before !== value) {
    // Persist precedes notify; the hook runs between them.
    await runV2LifecycleHook(extensionId, value ? "onEnabled" : "onDisabled");
    getV2Events().emit("contributions-changed", "*");
  }
}

function createOperations(binding: {
  extensionId: string;
  invocationId: string;
  effectivePermissions: string[];
  resolveEffectivePermissions?: () => readonly string[];
  reporter?: V2JobReporter;
}): V2OperationServices {
  const declarations = getV2Registry().get(binding.extensionId)?.settings;
  const library = createV2LibraryPorts();
  const extensionState = createV2ExtensionStatePorts();
  // Live view of the effective set: the host passes a provider that
  // re-reads the approval policy, so a revocation is enforced at a
  // running handler's next permission check (base and extended groups).
  const effectivePermissions =
    binding.resolveEffectivePermissions ?? binding.effectivePermissions;
  const base = createV2OperationServices({
    ...binding,
    effectivePermissions,
    grants: getV2GrantStore(),
    sources: getV2SourceGrantStore(),
    library,
    files: createV2FileContentPorts(),
    archive: createV2ArchivePorts(),
    settings: createV2SettingsPorts(),
    extensionState,
    // The one process-wide versioned store for this extension: the host
    // and the job runner share it, so concurrent jobs serialize their
    // state read-modify-writes instead of losing updates.
    workflowState: getV2WorkflowState(binding.extensionId, extensionState),
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
      effectivePermissions,
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
 * Process-wide v2 host: shares the registry, enablement, plans, grants,
 * and the one job manager every route polls, so a request ending or a
 * reload never strands job ownership on a per-request instance, and a
 * plan prepared by execution is the same plan the plan routes read.
 * The host lives on the runtime so separate route bundles compose it
 * exactly once.
 */
export function getAppV2Host(): ExtensionV2Host {
  const runtime = getV2Runtime();
  if (!runtime.host) {
    runtime.host = new ExtensionV2Host({
      registry: runtime.registry,
      isEnabled: isV2ExtensionEnabled,
      capabilities: getAvailableCapabilityIds({
        hasServerServices: true,
        desktopAvailable: process.env.FOLEYARD_DESKTOP === "1",
      }),
      grantedPermissions: (extensionId) => getV2GrantedPermissions(extensionId),
      ports: createV2LibraryPorts(),
      createOperations,
      authorizeGrant: authorizeV2Grant,
      jobManager: getV2JobManager(),
      planManager: runtime.plans,
    });
  }
  return runtime.host;
}

/** Effective-permission catalog: renderers enforce exactly what execution denies. */
export function buildAppV2Catalog() {
  return buildEffectiveV2Catalog(getV2Registry(), (extensionId) =>
    getV2GrantedPermissions(extensionId),
  );
}

/**
 * Register the bundled ports one by one, isolating failures: a malformed
 * definition is reported and skipped instead of aborting the route bundle
 * that imports this module (#247). Returns the ids/labels that failed.
 */
export function registerBundledV2Extensions(
  registrations: ReadonlyArray<readonly [string, () => void]>,
): string[] {
  const failed: string[] = [];
  for (const [label, register] of registrations) {
    try {
      register();
    } catch (error) {
      failed.push(label);
      console.error(
        `v2 bundled registration failed for "${label}"; the extension is unavailable until fixed`,
        error,
      );
    }
  }
  return failed;
}

// Bundled internal example (R8): Make Pack v2 registers here so every
// v2 route serves it without per-route branches. Registration never
// enables and never approves: the extension stays opt-in and denied
// by default until explicit enable + approval. The import cycle with
// `make-pack-v2.ts` is safe: that module only binds host functions
// for later calls and runs no top-level effects.
registerBundledV2Extensions([
  ["make-pack-v2", ensureMakePackV2Registered],
  ["sound-shelf-v2", ensureSoundShelfV2Registered],
  ["smart-collections-v2", ensureSmartCollectionsV2Registered],
  ["folder-janitor-v2", ensureFolderJanitorV2Registered],
  ["drop-rules-v2", ensureDropRulesV2Registered],
  ["library-gatherer-v2", ensureLibraryGathererV2Registered],
  ["auto-tag-v2", ensureAutoTagV2Registered],
]);
