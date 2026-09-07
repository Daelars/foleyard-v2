import {
  immediateV2Result,
  isV2JobCancellation,
  reviewV2Result,
  V2OperationError,
  type ExtensionV2Host,
  type V2HandlerContext,
} from "yard-core";

import {
  MAKE_PACK_V2_ID,
  MAKE_PACK_V2_SOURCE_RECENT,
  MAKE_PACK_V2_SOURCE_SELECTION,
  MAKE_PACK_V2_SOURCE_SHELF,
  type MakePackV2Format,
  type MakePackV2Source,
} from "./definition";
import {
  buildManifestText,
  commonParentDir,
  dedupeIds,
  detectZipConflicts,
  MANIFEST_NAME,
  MAX_PACK_FILES,
  planFolderNames,
  resolvePackOptions,
  type PlannedPackOptions,
} from "./policy";

/**
 * Make Pack v2 command handlers (Yard Tools context, R8).
 *
 * Every privileged effect runs through the invocation's v2 operation
 * services: Library reads, named selection sources, authorized
 * file/archive output, namespaced settings, the job reporter, and
 * job-owned workspace disposal. No v1 imports, no direct filesystem
 * access, no guessed temporary filenames.
 *
 * Flow per command: resolve source IDs → preview (host-validated
 * review plan through the generic preview channel) → export on
 * apply, immediate execute with a destination grant, or job submit
 * with a destination grant. Cancellation removes job-owned
 * incomplete output and rethrows; unrelated destination contents
 * are never deleted.
 */

const SOURCE_NAMES: Record<MakePackV2Source, string> = {
  selection: "selection",
  shelf: "shelf",
  recent: "recent",
};

export type MakePackV2Result = {
  packName: string;
  outputFormat: MakePackV2Format;
  outputPath: string;
  copied: number;
  skipped: string[];
  missing: string[];
  failedFiles: string[];
  failedReasons: string[];
  manifestIncluded: boolean;
  revealCapability: string;
};

type StoredPackOptions = {
  packName: string;
  outputFormat: MakePackV2Format;
  includeManifest: boolean;
  grantId?: string;
};

function readSettings(ctx: V2HandlerContext): {
  packName: string;
  defaultFormat: unknown;
  includeManifest: unknown;
} {
  return {
    packName: (ctx.operations.settings.get("make-pack-v2.pack-name", "") as string) ?? "",
    defaultFormat: ctx.operations.settings.get("make-pack-v2.default-format", "folder"),
    includeManifest: ctx.operations.settings.get("make-pack-v2.include-manifest", true),
  };
}

async function resolveSourceIds(
  source: MakePackV2Source,
  ctx: V2HandlerContext,
): Promise<string[]> {
  if (source === "selection") {
    const ids = dedupeIds(ctx.files.map((file) => file.id));
    if (ids.length === 0) {
      throw new V2OperationError(
        "input-invalid",
        "No sounds found for that pack source; select at least one sound and retry.",
      );
    }
    return ids;
  }
  try {
    const records = await ctx.operations.selection.resolveSource(SOURCE_NAMES[source]);
    return dedupeIds(records.map((record) => record.id));
  } catch (error) {
    if (error instanceof V2OperationError) throw error;
    throw new V2OperationError(
      "input-invalid",
      `The ${source} source is unavailable: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function failInvalid(message: string): never {
  throw new V2OperationError("input-invalid", message);
}

export async function runMakePackCommand(
  source: MakePackV2Source,
  ctx: V2HandlerContext,
) {
  const rawInput =
    typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
      ? (ctx.invocation.input as Record<string, unknown>)
      : {};
  let options: PlannedPackOptions;
  try {
    options = resolvePackOptions({ raw: rawInput, settings: readSettings(ctx), source });
  } catch (error) {
    failInvalid(error instanceof Error ? error.message : String(error));
  }

  const requestedIds = await resolveSourceIds(source, ctx);
  if (requestedIds.length > MAX_PACK_FILES) {
    failInvalid(
      `This pack holds ${requestedIds.length} sounds; the limit is ${MAX_PACK_FILES}. Narrow the selection and retry.`,
    );
  }

  // Liveness against the Library index: removed records report as
  // missing instead of failing the whole preview.
  const missing: string[] = [];
  const live: Array<{
    id: string;
    filename: string;
    format: string | null;
    duration: number | null;
    fileSize: number | null;
  }> = [];
  for (const id of requestedIds) {
    const record = ctx.operations.library.getFile(id);
    if (!record) {
      missing.push(id);
      continue;
    }
    live.push({
      id: record.id,
      filename: record.filename || `${record.id}.bin`,
      format: record.format ?? null,
      duration: record.duration ?? null,
      fileSize: record.fileSize ?? null,
    });
  }
  if (live.length === 0) {
    failInvalid(
      missing.length > 0
        ? `None of the requested sounds are still in the Library (${missing.length} missing); refresh the ${source} source and retry.`
        : "None of the requested sounds exist on disk.",
    );
  }

  const storedOptions: StoredPackOptions = {
    packName: options!.packName,
    outputFormat: options!.outputFormat,
    includeManifest: options!.includeManifest,
    ...(options!.grantId ? { grantId: options!.grantId } : {}),
  };

  // ZIP entry names are Library filenames verbatim (core archive
  // behavior): block case-insensitive collisions and manifest
  // reservation conflicts in the preview instead of failing mid-write.
  if (storedOptions.outputFormat === "zip") {
    const conflicts = detectZipConflicts(
      live.map((file) => file.filename),
      storedOptions.includeManifest,
    );
    if (conflicts.length > 0) {
      const detail = conflicts
        .map((conflict) =>
          conflict.kind === "manifest-collision"
            ? `"${conflict.name}" is reserved for the manifest`
            : `entries ${conflict.names.map((name) => JSON.stringify(name)).join(" and ")} collide (case-insensitive)`,
        )
        .join("; ");
      failInvalid(
        `ZIP packs keep Library filenames verbatim, so this selection cannot archive: ${detail}. Use folder output (which renames collisions) or narrow the selection.`,
      );
    }
  }

  const planned =
    storedOptions.outputFormat === "folder"
      ? planFolderNames(
          live.map((file) => ({ fileId: file.id, filename: file.filename })),
          storedOptions.includeManifest,
        )
      : {
          files: live.map((file) => ({
            fileId: file.id,
            filename: file.filename,
            outputName: file.filename,
            renamed: false,
          })),
          notices: [] as string[],
        };

  const byId = new Map(planned.files.map((file) => [file.fileId, file]));
  const summary = `Pack ${live.length} sound${live.length === 1 ? "" : "s"} as ${storedOptions.outputFormat} "${storedOptions.packName}"`;
  const preview = {
    summary,
    tables: [
      {
        id: "sources",
        title: "Sources",
        columns: ["Sound", "Pack name", "Status"],
        rows: live.map((file) => [
          file.filename,
          byId.get(file.id)?.outputName ?? file.filename,
          "ready",
        ]),
      },
    ],
    notices: [
      ...missing.map((id) => ({
        tone: "warning" as const,
        message: `Sound "${id}" is no longer in the Library and is skipped; refresh the ${source} source to clear it.`,
      })),
      ...planned.notices.map((message) => ({ tone: "info" as const, message })),
      {
        tone: "info" as const,
        message:
          "Existing destination files are never overwritten: colliding names fail with a reason instead.",
      },
    ],
    details: {
      sources: live.map((file) => file.id),
      names: live.map((file) => byId.get(file.id)?.outputName ?? file.filename),
      format: storedOptions.outputFormat,
      destination: storedOptions.grantId ?? null,
      conflicts: [] as string[],
      missing,
      manifestChoice: storedOptions.includeManifest,
    },
    reversibility: "irreversible-files" as const,
    reversibilityNote:
      "Finished packs stay in the destination. Cancelling removes only unfinished job-owned output; unrelated files are never deleted.",
  };

  // Run-mode contract: `direct` previews without side effects (the
  // generic preview UI renders the tables/notices/details above, with
  // the destination bound when one was picked); `apply` and `job`
  // export, carrying the destination from the reviewed plan or the
  // submitted input respectively.
  if (ctx.runMode === "direct") {
    const prepared = ctx.operations.plans.prepare({
      targets: { fileIds: live.map((file) => file.id) },
      options: storedOptions,
      grantIds: storedOptions.grantId ? [storedOptions.grantId] : [],
      preview,
    });
    return reviewV2Result(prepared.planId, summary, prepared.expiresAt);
  }

  const applyOptions = ctx.plan?.options as StoredPackOptions | undefined;
  const grantId = applyOptions?.grantId ?? storedOptions.grantId;
  if (!grantId) {
    failInvalid(
      "Choose a destination folder to write the pack: run the preview again with a destination grant.",
    );
  }
  const effective: StoredPackOptions & { grantId: string } = ctx.plan
    ? {
        packName: applyOptions?.packName ?? storedOptions.packName,
        outputFormat: applyOptions?.outputFormat ?? storedOptions.outputFormat,
        includeManifest: applyOptions?.includeManifest ?? storedOptions.includeManifest,
        grantId,
      }
    : { ...storedOptions, grantId };

  return immediateV2Result(
    await exportPack(source, ctx, live, planned.files, missing, effective),
  );
}

async function exportPack(
  source: MakePackV2Source,
  ctx: V2HandlerContext,
  live: Array<{
    id: string;
    filename: string;
    format: string | null;
    duration: number | null;
    fileSize: number | null;
  }>,
  planned: Array<{ fileId: string; filename: string; outputName: string }>,
  missing: string[],
  options: StoredPackOptions & { grantId: string },
): Promise<MakePackV2Result> {
  const skipped: string[] = [];
  const failedFiles: string[] = [];
  const failedReasons: string[] = [];
  const copiedPaths: string[] = [];
  const copiedIds = new Set<string>();
  const byId = new Map(planned.map((file) => [file.fileId, file]));
  const total = live.length + (options.includeManifest ? 1 : 0);
  let done = 0;
  const progress = (): void => {
    ctx.operations.jobs.reportProgress(done, total);
  };

  const fail = (filename: string, reason: string): void => {
    failedFiles.push(filename);
    failedReasons.push(reason);
  };

  const cancelled = async (error: unknown): Promise<never> => {
    // Cancellation policy: remove job-owned incomplete output, keep
    // unrelated destination contents, then rethrow so the job
    // settles as cancelled (never as a misleading success).
    await ctx.operations.workspace.dispose();
    throw error;
  };

  if (options.outputFormat === "zip") {
    ctx.operations.jobs.throwIfCancelled();
    // Manifest lists the archived entries; with atomic ZIP output the
    // entry list is the full live set (a mid-write failure fails the
    // run instead of producing a misleading partial archive).
    const fullManifest = options.includeManifest
      ? buildManifestText({
          packName: options.packName,
          source,
          outputFormat: options.outputFormat,
          createdAt: new Date().toISOString(),
          files: live.map((file) => ({
            id: file.id,
            filename: file.filename,
            outputName: byId.get(file.id)?.outputName ?? file.filename,
            format: file.format,
            duration: file.duration,
            fileSize: file.fileSize,
          })),
          skipped: [],
          missing,
        })
      : undefined;
    try {
      const created = await ctx.operations.archive.createZip(
        options.grantId,
        `${options.packName}.zip`,
        live.map((file) => file.id),
        fullManifest !== undefined ? { manifestText: fullManifest } : {},
      );
      done = total;
      progress();
      for (const file of live) copiedIds.add(file.id);
      return {
        packName: options.packName,
        outputFormat: options.outputFormat,
        outputPath: created.path,
        copied: live.length,
        skipped,
        missing,
        failedFiles,
        failedReasons,
        manifestIncluded: fullManifest !== undefined,
        revealCapability: "desktop:reveal",
      };
    } catch (error) {
      if (isV2JobCancellation(error)) await cancelled(error);
      const reason = error instanceof Error ? error.message : String(error);
      for (const file of live) {
        if (!copiedIds.has(file.id)) fail(file.filename, reasonFor(file.filename, reason));
      }
      done = total;
      progress();
      return {
        packName: options.packName,
        outputFormat: options.outputFormat,
        outputPath: "",
        copied: 0,
        skipped,
        missing,
        failedFiles,
        failedReasons,
        manifestIncluded: false,
        revealCapability: "desktop:reveal",
      };
    }
  }

  let manifestIncluded = false;
  try {
    for (const file of live) {
      try {
        ctx.operations.jobs.throwIfCancelled();
      } catch (error) {
        await cancelled(error);
      }
    const record = ctx.operations.library.getFile(file.id);
      if (!record) {
        missing.push(file.id);
        done += 1;
        progress();
        continue;
      }
      const outputName = byId.get(file.id)?.outputName ?? file.filename;
      try {
        const created = await ctx.operations.files.copyToOutput(
          file.id,
          outputName,
          options.grantId,
        );
        copiedPaths.push(created.path);
        copiedIds.add(file.id);
      } catch (error) {
        if (isV2JobCancellation(error)) await cancelled(error);
        const reason = error instanceof Error ? error.message : String(error);
        if (/not in the Library index/i.test(reason)) {
          missing.push(file.id);
        } else if (/ENOENT|not readable|missing/i.test(reason)) {
          skipped.push(file.filename);
        } else {
          fail(file.filename, reason);
        }
      }
      done += 1;
      progress();
    }

    if (options.includeManifest) {
      try {
        ctx.operations.jobs.throwIfCancelled();
      } catch (error) {
        await cancelled(error);
      }
      const manifestText = buildManifestText({
        packName: options.packName,
        source,
        outputFormat: options.outputFormat,
        createdAt: new Date().toISOString(),
        files: live
          .filter((file) => copiedIds.has(file.id))
          .map((file) => ({
            id: file.id,
            filename: file.filename,
            outputName: byId.get(file.id)?.outputName ?? file.filename,
            format: file.format,
            duration: file.duration,
            fileSize: file.fileSize,
          })),
        skipped,
        missing,
      });
      try {
        const created = await ctx.operations.files.createOutputText(
          options.grantId,
          MANIFEST_NAME,
          manifestText,
        );
        copiedPaths.push(created.path);
        manifestIncluded = true;
      } catch (error) {
        if (isV2JobCancellation(error)) await cancelled(error);
        fail(MANIFEST_NAME, error instanceof Error ? error.message : String(error));
      }
      done += 1;
      progress();
    }
  } catch (error) {
    // Reporter- or checkpoint-raised cancellation anywhere in the
    // folder export disposes job-owned partials before settling.
    if (isV2JobCancellation(error)) await cancelled(error);
    throw error;
  }

  return {
    packName: options.packName,
    outputFormat: options.outputFormat,
    outputPath: commonParentDir(copiedPaths),
    copied: copiedIds.size,
    skipped,
    missing,
    failedFiles,
    failedReasons,
    manifestIncluded,
    revealCapability: "desktop:reveal",
  };
}

function reasonFor(filename: string, reason: string): string {
  if (/already exists/i.test(reason)) {
    return `"${filename}": ${reason}`;
  }
  return `"${filename}": ${reason}`;
}

/** Register all three source commands on a v2 host. */
export function registerMakePackV2Handlers(host: ExtensionV2Host): void {
  host.registerHandler(MAKE_PACK_V2_ID, MAKE_PACK_V2_SOURCE_SELECTION, (ctx) =>
    runMakePackCommand("selection", ctx),
  );
  host.registerHandler(MAKE_PACK_V2_ID, MAKE_PACK_V2_SOURCE_SHELF, (ctx) =>
    runMakePackCommand("shelf", ctx),
  );
  host.registerHandler(MAKE_PACK_V2_ID, MAKE_PACK_V2_SOURCE_RECENT, (ctx) =>
    runMakePackCommand("recent", ctx),
  );
}
