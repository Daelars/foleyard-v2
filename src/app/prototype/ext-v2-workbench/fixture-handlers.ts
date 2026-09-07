import {
  immediateV2Result,
  V2OperationError,
  type ExtensionV2Host,
  type V2HandlerContext,
  type V2HandlerResult,
} from "@yard-core";

import {
  createSurfaceFixtureDefinition,
  createWorkerFixtureDefinition,
  registerV2DevFixtures,
} from "@/lib/extensions-v2/fixtures";
import { getAppV2Host } from "@/lib/extensions-v2/host";

/**
 * Dev-only v2 fixture handlers (prototype workbench, R9).
 *
 * The fixture *definitions* live in `src/lib/extensions-v2/fixtures.ts`
 * (dev-gated registration, never in production catalogs); the
 * executable handlers live here so invoking a fixture command against
 * the disposable dev Library behaves observably. Every handler echoes
 * `context.runMode` (`direct`/`apply`/`job`) in its result so the
 * execution inspector surfaces how the run was reached. No v1
 * extension modules are imported here.
 *
 * - `fixture-surface`: one pure describe per otherwise-unused
 *   contribution/context type (file/folder context menus, collection
 *   and drop scopes, toolbar/sidebar/settings entries). Read-only;
 *   never writes.
 * - `fixture-worker`: a cancellable Library count through
 *   `operations.library.listPage` with reporter progress, a caught
 *   `files:write` denial probe (that permission is deliberately
 *   undeclared), and an isolated `last-count` workflow-state write
 *   only its own namespace can read.
 */

function modeOf(context: V2HandlerContext): string {
  return `runMode=${context.runMode}`;
}

function surfaceResult(label: string, detail: string, context: V2HandlerContext): V2HandlerResult {
  return immediateV2Result(`fixture-surface/${label}: ${detail} (${modeOf(context)})`);
}

function surfaceHandlers(): Array<{ commandId: string; run: (context: V2HandlerContext) => V2HandlerResult }> {
  return [
    {
      commandId: "fixture-surface.inspect-selection",
      run: (context) =>
        surfaceResult(
          "selection",
          `${context.files.length} file(s) [${context.files.map((file) => file.id).join(", ")}]`,
          context,
        ),
    },
    {
      commandId: "fixture-surface.inspect-file",
      run: (context) =>
        surfaceResult(
          "file",
          context.files.length > 0
            ? `${context.files[0]!.id} (${context.files[0]!.filename})`
            : "no file in scope",
          context,
        ),
    },
    {
      commandId: "fixture-surface.inspect-folder",
      run: (context) =>
        surfaceResult("folder", context.folderPath ?? "no folder in scope", context),
    },
    {
      commandId: "fixture-surface.inspect-collection",
      run: (context) =>
        surfaceResult("collection", context.collectionId ?? "no collection in scope", context),
    },
    {
      commandId: "fixture-surface.inspect-drop",
      run: (context) =>
        surfaceResult(
          "drop",
          `${context.invocation.selection.dropFileCount ?? 0} dropped file(s)`,
          context,
        ),
    },
    {
      commandId: "fixture-surface.ping",
      run: (context) => {
        const input = (context.invocation.input ?? {}) as { note?: unknown };
        const note =
          typeof input.note === "string" && input.note.length > 0 ? input.note : "pong";
        return surfaceResult("ping", note, context);
      },
    },
  ];
}

async function runWorkerCount(context: V2HandlerContext): Promise<V2HandlerResult> {
  // Permission probe first: `files:write` is deliberately undeclared for
  // this fixture, so the narrow services must deny it even though the
  // handler itself asks. The denial name travels in the result for the
  // inspector's denied-permissions column.
  let denied = "none";
  try {
    await context.operations.files.createOutputText("probe-grant", "probe.txt", "probe");
  } catch (error) {
    if (error instanceof V2OperationError && error.failureCode === "permission-denied") {
      denied = "files:write";
    } else {
      throw error;
    }
  }

  const batchRaw = context.operations.settings.get("fixture-worker.batch-size", 100);
  const batch =
    typeof batchRaw === "number" && Number.isFinite(batchRaw) && batchRaw > 0
      ? Math.min(Math.floor(batchRaw), 500)
      : 100;
  let cursor: string | null = null;
  let total = 0;
  let pages = 0;
  for (;;) {
    context.operations.jobs.throwIfCancelled();
    const page = context.operations.library.listPage(cursor, batch);
    total += page.files.length;
    pages += 1;
    context.operations.jobs.reportProgress(total, total + (page.nextCursor ? 1 : 0));
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  context.operations.state.write("last-count", total);
  return immediateV2Result(
    `fixture-worker/count: ${total} record(s) in ${pages} page(s) (${modeOf(context)}); denied=${denied}; state=fixture-worker.last-count:${total}`,
  );
}

/** Register the surface fixture's pure handlers (ownership-keyed, no name tables). */
export function registerFixtureSurfaceHandlers(host: ExtensionV2Host): void {
  for (const handler of surfaceHandlers()) {
    if (!host.hasHandler("fixture-surface", handler.commandId)) {
      host.registerHandler("fixture-surface", handler.commandId, handler.run);
    }
  }
}

/** Register the worker fixture's job/state/permission handler. */
export function registerFixtureWorkerHandlers(host: ExtensionV2Host): void {
  if (!host.hasHandler("fixture-worker", "fixture-worker.count-library")) {
    host.registerHandler("fixture-worker", "fixture-worker.count-library", runWorkerCount);
  }
}

/**
 * Dev wiring: ensure the fixture definitions are registered through
 * the production registry path (`registerV2DevFixtures` throws in
 * production builds, registers each ID at most once) and attach both
 * handler sets to the process-wide app host. Returns the IDs that
 * gained handlers on this call, so the workbench reload action can
 * show that a second reload registers nothing twice.
 */
export function ensureV2DevFixtureHandlers(): { handlers: string[] } {
  registerV2DevFixtures();
  const host = getAppV2Host();
  const attached: string[] = [];
  const before = (id: string, command: string) => host.hasHandler(id, command);
  registerFixtureSurfaceHandlers(host);
  registerFixtureWorkerHandlers(host);
  for (const definition of [createSurfaceFixtureDefinition(), createWorkerFixtureDefinition()]) {
    for (const command of definition.commands) {
      if (!before(definition.id, command.id) && host.hasHandler(definition.id, command.id)) {
        attached.push(`${definition.id}:${command.id}`);
      }
    }
  }
  return { handlers: attached };
}
