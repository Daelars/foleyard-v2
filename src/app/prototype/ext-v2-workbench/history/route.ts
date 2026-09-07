import { NextRequest, NextResponse } from "next/server";

import { ensureV2JobsRestored, getV2JobManager } from "@/lib/extensions-v2/jobs";
import { redactV2Json, redactV2Text, V2_DIAGNOSTIC_MAX_RECORDS } from "../redact";

export const dynamic = "force-dynamic";

/**
 * GET /prototype/ext-v2-workbench/history — dev-only sanitized job
 * history for the execution inspector.
 *
 * Projects host-owned job records down to correlation data (job and
 * invocation IDs, extension/command ownership, state, progress,
 * timestamps, cancellation markers, partial counts) with redacted
 * error text. Handler values, output paths, destinations, and raw
 * stacks never leave the host: values stay memory-only, paths redact
 * to `[path]`, and recovery notes summarize without locations. The
 * payload is bounded (default 20, max 50 records). Production builds
 * 404 here; packaged builds exclude the compiled prototype routes via
 * electron-builder.yml.
 */
export function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: { code: "not-found", message: "Not found." } },
      { status: 404 },
    );
  }
  ensureV2JobsRestored();
  const params = request.nextUrl.searchParams;
  const rawLimit = Number.parseInt(params.get("limit") ?? "20", 10);
  const limit = Math.min(
    Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1),
    Math.min(50, V2_DIAGNOSTIC_MAX_RECORDS),
  );
  const { jobs } = getV2JobManager().listJobs(null, limit);
  return NextResponse.json({
    ok: true,
    jobs: jobs.map((record) => ({
      jobId: record.jobId,
      invocationId: record.invocationId,
      extensionId: record.extensionId,
      commandId: record.commandId,
      state: record.state,
      createdAt: record.createdAt,
      ...(record.startedAt ? { startedAt: record.startedAt } : {}),
      ...(record.finishedAt ? { finishedAt: record.finishedAt } : {}),
      ...(record.cancellationRequestedAt
        ? { cancellationRequestedAt: record.cancellationRequestedAt }
        : {}),
      ...(record.stoppedAt ? { stoppedAt: record.stoppedAt } : {}),
      progress: record.partial
        ? {
            succeeded: record.partial.succeeded,
            failed: record.partial.failed.length,
            incomplete: record.partial.incomplete,
            ...(record.partial.incompleteReason
              ? { incompleteReason: redactV2Text(record.partial.incompleteReason, 280) }
              : {}),
          }
        : undefined,
      ...(record.error
        ? {
            error: {
              code: record.error.code,
              message: redactV2Text(record.error.message, 500),
            },
          }
        : {}),
      ...(record.recovery
        ? {
            recovery: redactV2Json(
              { status: record.recovery.status, cleanup: record.recovery.cleanup },
              500,
            ),
          }
        : {}),
    })),
  });
}
