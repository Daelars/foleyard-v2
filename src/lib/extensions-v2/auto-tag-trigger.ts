import { AUTO_TAG_V2_ID, AUTO_TAG_V2_TAG_FILES, MAX_TAG_FILES } from "@foleyard/auto-tag-v2";

import { getFileIdsScannedSince } from "@/lib/db";

import { getAppV2Host, isV2ExtensionEnabled } from "./host";
import { getV2GrantedPermissions } from "./policy";

/**
 * Post-scan auto-tag trigger (#194). A finished scan hands its arrival
 * list to the auto-tag tool as background jobs: one job per 500 files
 * with a stable idempotency key per chunk, so a repeated completion
 * never double-tags. Nothing submits unless the tool is both enabled
 * and approved for tag writes.
 *
 * Pure seam: every collaborator injects through deps and only the
 * defaults touch production singletons, so tests drive the whole
 * decision table without a database or a host.
 */

export type AutoTagTriggerDeps = {
  isEnabled?: (extensionId: string) => boolean;
  granted?: (extensionId: string) => readonly string[];
  arrivalsSince?: (sinceIso: string) => string[];
  submit?: (fileIds: string[], idempotencyKey: string, batchId: string) => Promise<unknown>;
};

export async function triggerAutoTagAfterScan(
  startedAtIso: string,
  deps: AutoTagTriggerDeps = {},
): Promise<{ submitted: number; files: number }> {
  const isEnabled = deps.isEnabled ?? isV2ExtensionEnabled;
  if (!isEnabled(AUTO_TAG_V2_ID)) return { submitted: 0, files: 0 };
  const granted = deps.granted ?? getV2GrantedPermissions;
  if (!granted(AUTO_TAG_V2_ID).includes("tags:write")) return { submitted: 0, files: 0 };

  const arrivals = (deps.arrivalsSince ?? getFileIdsScannedSince)(startedAtIso);
  if (arrivals.length === 0) return { submitted: 0, files: 0 };

  const submit =
    deps.submit ??
    ((fileIds, idempotencyKey, batchId) =>
      getAppV2Host().submitJob({
        extensionId: AUTO_TAG_V2_ID,
        commandId: AUTO_TAG_V2_TAG_FILES,
        input: { fileIds, batchId, scanStartedAt: startedAtIso },
        idempotencyKey,
      }));
  let submitted = 0;
  for (let index = 0; index < arrivals.length; index += MAX_TAG_FILES) {
    await submit(
      arrivals.slice(index, index + MAX_TAG_FILES),
      `auto-tag-scan-${startedAtIso}-${index / MAX_TAG_FILES}`,
      `scan:${startedAtIso}`,
    );
    submitted += 1;
  }
  return { submitted, files: arrivals.length };
}
