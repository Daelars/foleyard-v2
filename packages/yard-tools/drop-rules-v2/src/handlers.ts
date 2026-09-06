import {
  immediateV2Result,
  isV2JobCancellation,
  reviewV2Result,
  V2OperationError,
  type ExtensionV2Host,
  type V2HandlerContext,
} from "yard-core";

import {
  DROP_RULES_V2_APPLY,
  DROP_RULES_V2_ID,
  DROP_RULES_V2_OPEN_SETTINGS,
  DROP_RULES_V2_PREPARE_DRAG,
  DROP_RULES_V2_PREVIEW,
  DROP_RULES_V2_SETTINGS,
} from "./definition";
import {
  DEFAULT_RENAME_PATTERN,
  MAX_DROP_FILES,
  planDropNames,
  type DropRuleSettings,
} from "./policy";

/**
 * Drop Rules v2 command handlers (Yard Tools context, D6 #181).
 *
 * Control what happens when a sound leaves Foleyard. The drop payload
 * (Library IDs + destination/staging grants) arrives as command input;
 * drop-scope availability (a validated OS drop) is enforced by the host
 * before the handler runs, and the declared `drop:read`/`drop:modify`
 * permissions gate execution the same way.
 *
 * - `preview` settles immediately: plans output names, no side effects.
 * - `apply` in `direct` mode returns a review plan; `apply`/`job` copy
 *   each planned file into the destination grant (never overwrites: a
 *   colliding name fails with a reason) and write the used-sounds
 *   report when `mark-used` is on. Cancellation disposes job-owned
 *   partials and rethrows so the job settles cancelled, never as a
 *   misleading success.
 * - `prepare-drag` stages one sound into the staging grant for
 *   drag-out; when no copy or rename is needed it hands back the
 *   Library path unstaged.
 * - `open-settings` settles immediately with the settings surface.
 *
 * No v1 imports, no direct filesystem access, no raw staging paths:
 * every effect runs through the invocation's v2 operation services.
 */

export type DropRulesV2PreviewResult = {
  fileIds: string[];
  outputNames: string[];
  warnings: string[];
  missing: string[];
};

export type DropRulesV2ApplyResult = {
  copied: number;
  skipped: string[];
  missing: string[];
  failedFiles: string[];
  failedReasons: string[];
  usedReportWritten: boolean;
  warnings: string[];
};

export type DropRulesV2PrepareDragResult = {
  fileId: string;
  outputName: string;
  dragPath: string;
  staged: boolean;
};

function readSettings(ctx: V2HandlerContext): DropRuleSettings {
  const get = ctx.operations.settings.get.bind(ctx.operations.settings);
  const copyOnDrop = get("drop-rules-v2.copy-on-drop", true);
  const renameOnDrop = get("drop-rules-v2.rename-on-drop", true);
  const renamePattern = get("drop-rules-v2.rename-pattern", DEFAULT_RENAME_PATTERN);
  const markUsed = get("drop-rules-v2.mark-used", true);
  return {
    copyOnDrop: typeof copyOnDrop === "boolean" ? copyOnDrop : true,
    renameOnDrop: typeof renameOnDrop === "boolean" ? renameOnDrop : true,
    renamePattern:
      typeof renamePattern === "string" && renamePattern.length > 0
        ? renamePattern
        : DEFAULT_RENAME_PATTERN,
    markUsed: typeof markUsed === "boolean" ? markUsed : true,
  };
}

function readDropInput(ctx: V2HandlerContext): {
  fileIds: string[];
  destGrantId: string | null;
  settings: DropRuleSettings;
} {
  const raw =
    typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
      ? (ctx.invocation.input as Record<string, unknown>)
      : {};
  const seen = new Set<string>();
  const fileIds: string[] = [];
  for (const id of Array.isArray(raw.fileIds) ? raw.fileIds : []) {
    if (typeof id === "string" && id.length > 0 && !seen.has(id)) {
      seen.add(id);
      fileIds.push(id);
    }
  }
  if (fileIds.length === 0) {
    throw new V2OperationError(
      "input-invalid",
      "No dropped sounds were provided; drop sounds onto the target and retry.",
    );
  }
  if (fileIds.length > MAX_DROP_FILES) {
    throw new V2OperationError(
      "input-invalid",
      `This drop holds ${fileIds.length} sounds; the limit is ${MAX_DROP_FILES}. Drop fewer sounds and retry.`,
    );
  }
  const stored = readSettings(ctx);
  return {
    fileIds,
    destGrantId:
      typeof raw.destGrantId === "string" && raw.destGrantId.trim().length > 0
        ? raw.destGrantId
        : null,
    settings: {
      copyOnDrop: typeof raw.copyOnDrop === "boolean" ? raw.copyOnDrop : stored.copyOnDrop,
      renameOnDrop: typeof raw.renameOnDrop === "boolean" ? raw.renameOnDrop : stored.renameOnDrop,
      renamePattern:
        typeof raw.renamePattern === "string" && raw.renamePattern.length > 0
          ? raw.renamePattern
          : stored.renamePattern,
      markUsed: typeof raw.markUsed === "boolean" ? raw.markUsed : stored.markUsed,
    },
  };
}

type LiveDropFile = {
  fileId: string;
  sourcePath: string;
  filename: string;
  format: string | null;
};

/** Resolve dropped IDs against the Library index; unknown IDs report as missing, never silent. */
function resolveLiveFiles(ctx: V2HandlerContext, fileIds: string[]): { live: LiveDropFile[]; missing: string[] } {
  const live: LiveDropFile[] = [];
  const missing: string[] = [];
  for (const id of fileIds) {
    const record = ctx.operations.library.getFile(id);
    if (!record) {
      missing.push(id);
      continue;
    }
    live.push({
      fileId: record.id,
      sourcePath: record.path,
      filename: record.filename || `${record.id}.bin`,
      format: record.format ?? null,
    });
  }
  return { live, missing };
}

function failInvalid(message: string): never {
  throw new V2OperationError("input-invalid", message);
}

export function runPreview(ctx: V2HandlerContext) {
  const { fileIds, settings } = readDropInput(ctx);
  const { live, missing } = resolveLiveFiles(ctx, fileIds);
  if (live.length === 0) {
    failInvalid(
      `None of the dropped sounds are still in the Library (${missing.length} missing); refresh the drop and retry.`,
    );
  }
  const planned = planDropNames(
    live.map((file) => ({
      fileId: file.fileId,
      sourcePath: file.sourcePath,
      filename: file.filename,
      format: file.format,
    })),
    settings,
  );
  return immediateV2Result({
    fileIds: planned.map((file) => file.fileId),
    outputNames: planned.map((file) => file.outputName),
    warnings: missing.map((id) => `Sound "${id}" is no longer in the Library and is skipped.`),
    missing,
  } satisfies DropRulesV2PreviewResult);
}

export async function runApply(ctx: V2HandlerContext) {
  const { fileIds, destGrantId, settings } = readDropInput(ctx);
  const { live, missing } = resolveLiveFiles(ctx, fileIds);
  if (live.length === 0) {
    failInvalid(
      `None of the dropped sounds are still in the Library (${missing.length} missing); refresh the drop and retry.`,
    );
  }
  const planned = planDropNames(
    live.map((file) => ({
      fileId: file.fileId,
      sourcePath: file.sourcePath,
      filename: file.filename,
      format: file.format,
    })),
    settings,
  );

  if (ctx.runMode === "direct") {
    const summary = `Drop ${live.length} sound${live.length === 1 ? "" : "s"} with Drop Rules`;
    const prepared = ctx.operations.plans.prepare({
      targets: { fileIds: live.map((file) => file.fileId) },
      options: {
        fileIds,
        destGrantId,
        copyOnDrop: settings.copyOnDrop,
        renameOnDrop: settings.renameOnDrop,
        renamePattern: settings.renamePattern,
        markUsed: settings.markUsed,
      },
      ...(destGrantId ? { grantIds: [destGrantId] } : {}),
      preview: {
        summary,
        tables: [
          {
            id: "drops",
            title: "Drops",
            columns: ["Sound", "Drop name", "Status"],
            rows: planned.map((file) => [file.filename, file.outputName, "ready"]),
          },
        ],
        notices: [
          ...missing.map((id) => ({
            tone: "warning" as const,
            message: `Sound "${id}" is no longer in the Library and is skipped.`,
          })),
          {
            tone: "info" as const,
            message:
              "Existing destination files are never overwritten: colliding names fail with a reason instead.",
          },
        ],
        details: {
          sources: planned.map((file) => file.fileId),
          names: planned.map((file) => file.outputName),
          destination: destGrantId,
          conflicts: [] as string[],
          missing,
        },
        reversibility: "irreversible-files" as const,
        reversibilityNote:
          "Dropped copies stay in the destination. Cancelling removes only unfinished job-owned output; unrelated files are never deleted.",
      },
    });
    return reviewV2Result(prepared.planId, summary, prepared.expiresAt);
  }

  const applyOptions = ctx.plan?.options as
    | { fileIds?: unknown; destGrantId?: unknown }
    | undefined;
  const grantId =
    (typeof applyOptions?.destGrantId === "string" && applyOptions.destGrantId) || destGrantId;
  if (!grantId) {
    failInvalid("Choose a destination folder for the drop: run the preview again with a destination grant.");
  }

  const skipped: string[] = [];
  const failedFiles: string[] = [];
  const failedReasons: string[] = [];
  const copied: Array<{ fileId: string; sourcePath: string; outputPath: string }> = [];
  let done = 0;
  const total = planned.length + (settings.markUsed ? 1 : 0);

  const cancelled = async (error: unknown): Promise<never> => {
    await ctx.operations.workspace.dispose();
    throw error;
  };

  try {
    for (const file of planned) {
      try {
        ctx.operations.jobs.throwIfCancelled();
      } catch (error) {
        await cancelled(error);
      }
      const record = ctx.operations.library.getFile(file.fileId);
      if (!record) {
        missing.push(file.fileId);
        done += 1;
        ctx.operations.jobs.reportProgress(done, total);
        continue;
      }
      const shouldCopy = settings.copyOnDrop || file.outputName !== file.filename;
      if (!shouldCopy) {
        skipped.push(file.filename);
        done += 1;
        ctx.operations.jobs.reportProgress(done, total);
        continue;
      }
      try {
        const created = await ctx.operations.files.copyToOutput(file.fileId, file.outputName, grantId);
        copied.push({ fileId: file.fileId, sourcePath: file.sourcePath, outputPath: created.path });
      } catch (error) {
        if (isV2JobCancellation(error)) await cancelled(error);
        const reason = error instanceof Error ? error.message : String(error);
        if (/not in the Library index/i.test(reason)) {
          missing.push(file.fileId);
        } else {
          failedFiles.push(file.filename);
          failedReasons.push(`"${file.filename}": ${reason}`);
        }
      }
      done += 1;
      ctx.operations.jobs.reportProgress(done, total);
    }

    let usedReportWritten = false;
    if (settings.markUsed) {
      try {
        ctx.operations.jobs.throwIfCancelled();
      } catch (error) {
        await cancelled(error);
      }
      const report = JSON.stringify(
        { updatedAt: new Date().toISOString(), files: copied },
        null,
        2,
      );
      try {
        await ctx.operations.files.createOutputText(grantId, "foleyard-used.json", report);
        usedReportWritten = true;
      } catch (error) {
        // The used report is bookkeeping: a collision on a previous
        // report never fails the drop itself.
        skipped.push("foleyard-used.json");
        failedReasons.push(
          `"foleyard-used.json": used report not written: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      done += 1;
      ctx.operations.jobs.reportProgress(done, total);
    }

    return immediateV2Result({
      copied: copied.length,
      skipped,
      missing,
      failedFiles,
      failedReasons,
      usedReportWritten,
      warnings: missing.map((id) => `Sound "${id}" is no longer in the Library and is skipped.`),
    } satisfies DropRulesV2ApplyResult);
  } catch (error) {
    if (isV2JobCancellation(error)) await cancelled(error);
    throw error;
  }
}

export async function runPrepareDrag(ctx: V2HandlerContext) {
  const raw =
    typeof ctx.invocation.input === "object" && ctx.invocation.input !== null
      ? (ctx.invocation.input as Record<string, unknown>)
      : {};
  const fileId = typeof raw.fileId === "string" ? raw.fileId : "";
  if (!fileId) {
    failInvalid("No sound was provided for drag-out; drop a sound onto the target and retry.");
  }
  const stagingGrantId =
    typeof raw.stagingGrantId === "string" && raw.stagingGrantId.trim().length > 0
      ? raw.stagingGrantId
      : null;
  const stored = readSettings(ctx);
  const settings: DropRuleSettings = {
    copyOnDrop: typeof raw.copyOnDrop === "boolean" ? raw.copyOnDrop : stored.copyOnDrop,
    renameOnDrop: typeof raw.renameOnDrop === "boolean" ? raw.renameOnDrop : stored.renameOnDrop,
    renamePattern:
      typeof raw.renamePattern === "string" && raw.renamePattern.length > 0
        ? raw.renamePattern
        : stored.renamePattern,
    markUsed: typeof raw.markUsed === "boolean" ? raw.markUsed : stored.markUsed,
  };
  const record = ctx.operations.library.getFile(fileId);
  if (!record) {
    failInvalid(`Sound "${fileId}" is no longer in the Library; refresh the drop and retry.`);
  }
  const filename = record!.filename || `${record!.id}.bin`;
  const [planned] = planDropNames(
    [{ fileId: record!.id, sourcePath: record!.path, filename, format: record!.format ?? null }],
    settings,
  );
  const needsStage = settings.copyOnDrop || planned.outputName !== filename;
  if (!needsStage) {
    return immediateV2Result({
      fileId: record!.id,
      outputName: filename,
      dragPath: record!.path,
      staged: false,
    } satisfies DropRulesV2PrepareDragResult);
  }
  if (!stagingGrantId) {
    failInvalid("Choose a staging folder for the drag-out: run again with a staging grant.");
  }
  try {
    ctx.operations.jobs.throwIfCancelled();
    const created = await ctx.operations.files.copyToOutput(record!.id, planned.outputName, stagingGrantId);
    return immediateV2Result({
      fileId: record!.id,
      outputName: planned.outputName,
      dragPath: created.path,
      staged: true,
    } satisfies DropRulesV2PrepareDragResult);
  } catch (error) {
    if (isV2JobCancellation(error)) {
      await ctx.operations.workspace.dispose();
    }
    throw error;
  }
}

export function runOpenSettings(): ReturnType<typeof immediateV2Result> {
  return immediateV2Result({ settings: [...DROP_RULES_V2_SETTINGS] });
}

/** Register all four drop-rules commands on a v2 host. */
export function registerDropRulesV2Handlers(host: ExtensionV2Host): void {
  host.registerHandler(DROP_RULES_V2_ID, DROP_RULES_V2_PREVIEW, runPreview);
  host.registerHandler(DROP_RULES_V2_ID, DROP_RULES_V2_APPLY, (ctx) => runApply(ctx));
  host.registerHandler(DROP_RULES_V2_ID, DROP_RULES_V2_PREPARE_DRAG, (ctx) => runPrepareDrag(ctx));
  host.registerHandler(DROP_RULES_V2_ID, DROP_RULES_V2_OPEN_SETTINGS, runOpenSettings);
}
