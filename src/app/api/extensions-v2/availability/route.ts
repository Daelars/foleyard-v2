import { NextRequest, NextResponse } from "next/server";

import { handleV2HttpAvailability } from "@yard-core";
import { getV2Registry, isV2ExtensionEnabled } from "@/lib/extensions-v2/host";
import { getV2GrantedPermissions } from "@/lib/extensions-v2/policy";

export const dynamic = "force-dynamic";

/**
 * GET /api/extensions-v2/availability — shared availability evaluator
 * over query params. Never executes commands or hydrates selections.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const extensionId = params.get("extensionId") ?? "";
  const commandId = params.get("commandId") ?? "";
  const fileIds = params.get("fileIds")?.split(",").filter(Boolean);
  const folderPath = params.get("folderPath") ?? undefined;
  const collectionId = params.get("collectionId") ?? undefined;
  const dropRaw = params.get("dropFileCount");
  const dropFileCount = dropRaw === null ? undefined : Number.parseInt(dropRaw, 10);
  let input: unknown;
  const inputRaw = params.get("input");
  if (inputRaw !== null) {
    try {
      input = JSON.parse(inputRaw) as unknown;
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "input-invalid", message: "input must be JSON." } },
        { status: 400 },
      );
    }
  }
  const response = handleV2HttpAvailability(
    getV2Registry(),
    {
      isEnabled: isV2ExtensionEnabled,
      capabilities: {},
      grantedPermissions: (id) => getV2GrantedPermissions(id),
    },
    {
      extensionId,
      commandId,
      ...(fileIds !== undefined ? { fileIds } : {}),
      ...(folderPath !== undefined ? { folderPath } : {}),
      ...(collectionId !== undefined ? { collectionId } : {}),
      ...(dropFileCount !== undefined && Number.isFinite(dropFileCount) ? { dropFileCount } : {}),
      ...(input !== undefined ? { input } : {}),
    },
  );
  return NextResponse.json(response.body, { status: response.status });
}
