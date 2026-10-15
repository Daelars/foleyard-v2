const { app, clipboard, nativeImage, shell } = require("electron");

const { CHANNELS } = require("./ipc-channels.cjs");

const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { getDesktopServerUrl } = require("./server-url.cjs");

process.env.FOLEYARD_GRANT_SECRET ||= randomBytes(32).toString("hex");

/**
 * Native file actions (Desktop runtime context). Drag-out is the one action
 * that leaves the app's own filesystem boundary, so it must honour the same
 * Drop Rules policy that governs incoming drops (#284): when the extension is
 * enabled the bridge asks `drop-rules-v2.prepare-drag` for a staged,
 * rename-aware copy inside a grant it mints itself, and only falls back to the
 * raw indexed file when the policy is disabled or does not apply here. An
 * enabled policy that fails is reported instead of silently dragging raw.
 */

const DROP_RULES_EXTENSION_ID = "drop-rules-v2";
const DROP_RULES_PREPARE_DRAG = "drop-rules-v2.prepare-drag";

/** Owned staging area: the bridge creates one fresh directory per drag. */
const DRAG_STAGING_DIR_NAME = "drag-staging";
const DRAG_STAGE_PREFIX = "drag-";
const DRAG_STAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Availability codes where Drop Rules policy does not apply, so the raw
 * indexed file may be dragged exactly as before the extension existed. The
 * extension being absent is the same situation: nothing governs drag-out.
 */
const POLICY_NOT_APPLICABLE_CODES = new Set([
  "disabled",
  "capability-unavailable",
  "extension-unknown",
  "command-unknown",
]);

/** One JSON exchange with the local desktop server; never throws on status. */
async function requestJson(url, init) {
  const response = await fetch(url, init);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

function errorMessage(body, fallback) {
  if (body && typeof body === "object") {
    if (typeof body.error === "string" && body.error) return body.error;
    if (body.error && typeof body.error.message === "string" && body.error.message) {
      return body.error.message;
    }
    if (typeof body.message === "string" && body.message) return body.message;
  }
  return fallback;
}

async function grantDirectoryPath(directoryPath, purpose) {
  const body = { path: directoryPath };
  if (purpose && typeof purpose === "object") {
    body.extensionId = purpose.extensionId;
    body.grantKind = purpose.grantKind;
  }
  const response = await fetch(`${getDesktopServerUrl()}/api/desktop/grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-foleyard-grant-secret": process.env.FOLEYARD_GRANT_SECRET },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  return response.ok ? result : { ok: false, error: result.error ?? "Could not grant folder access" };
}

async function resolveIndexedFile(fileId) {
  try {
    const response = await fetch(
      `${getDesktopServerUrl()}/api/desktop/file?id=${encodeURIComponent(fileId)}`,
    );
    const data = await response.json();

    if (!response.ok || !data.file) {
      return { ok: false, error: data.error ?? "File is not indexed" };
    }

    return { ok: true, file: data.file };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to resolve file",
    };
  }
}

/**
 * Which policy governs this drag. The shared availability evaluator is asked
 * once per drag: an available policy means prepare-drag must run, a
 * not-applicable code means the raw file may drag, and anything else
 * (unreachable, denied, malformed) is a visible failure. Operational errors
 * never degrade to the raw file.
 */
async function resolveDragPolicy(fileId) {
  const query = new URLSearchParams({
    extensionId: DROP_RULES_EXTENSION_ID,
    commandId: DROP_RULES_PREPARE_DRAG,
    fileIds: fileId,
    dropFileCount: "1",
  });

  let response;
  try {
    response = await requestJson(
      `${getDesktopServerUrl()}/api/extensions-v2/availability?${query.toString()}`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return {
      mode: "error",
      error: `Drop Rules could not be reached (${reason}); refusing to drag without enforcing its rules. Disable Drop Rules to drag raw files.`,
    };
  }

  const body =
    response.body && typeof response.body === "object"
      ? response.body
      : {};
  if (body.available === true) {
    return { mode: "policy" };
  }

  const code =
    typeof body.code === "string"
      ? body.code
      : body.error && typeof body.error.code === "string"
        ? body.error.code
        : null;
  if (code && POLICY_NOT_APPLICABLE_CODES.has(code)) {
    return { mode: "raw" };
  }

  return {
    mode: "error",
    error: `${errorMessage(body, `Drop Rules is unavailable (${code ?? "unknown"}).`)} Disable Drop Rules to drag raw files.`,
  };
}

/** Remove bridge-owned staging directories older than the retention window. */
async function pruneStaleDragStages(root, now = Date.now()) {
  let entries;
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (
      !entry.name.startsWith(DRAG_STAGE_PREFIX) ||
      !entry.isDirectory() ||
      entry.isSymbolicLink()
    ) {
      continue;
    }
    const candidate = path.join(root, entry.name);
    try {
      const stats = await fs.promises.lstat(candidate);
      if (stats.isSymbolicLink() || now - stats.mtimeMs < DRAG_STAGE_MAX_AGE_MS) continue;
      const canonical = await fs.promises.realpath(candidate);
      const canonicalRoot = await fs.promises.realpath(root);
      if (path.dirname(canonical) !== canonicalRoot) continue;
      await fs.promises.rm(canonical, { recursive: true, force: true });
    } catch {
      // A stage that cannot be inspected or removed is left alone; cleanup is
      // best effort and must never fail a drag.
    }
  }
}

/**
 * Create one drag's staging directory and mint the Drop Rules destination
 * grant for it. The grant is what lets the extension's copy op write there
 * without ever seeing a raw path, and the fresh directory keeps concurrent or
 * repeated drags from colliding on the same prepared name.
 */
async function createStagingGrant() {
  const root = path.join(app.getPath("userData"), DRAG_STAGING_DIR_NAME);
  try {
    await fs.promises.mkdir(root, { recursive: true });
    await pruneStaleDragStages(root);
    const stageDirectory = await fs.promises.mkdtemp(path.join(root, DRAG_STAGE_PREFIX));

    const proofResponse = await requestJson(`${getDesktopServerUrl()}/api/desktop/grants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-foleyard-grant-secret": process.env.FOLEYARD_GRANT_SECRET,
      },
      body: JSON.stringify({
        path: stageDirectory,
        extensionId: DROP_RULES_EXTENSION_ID,
        grantKind: "destination",
      }),
    });
    const proof = proofResponse.body?.proof;
    if (!proofResponse.ok || typeof proof !== "string" || !proof) {
      return {
        ok: false,
        error: errorMessage(proofResponse.body, "Drop Rules could not open a staging folder."),
      };
    }

    const grantResponse = await requestJson(
      `${getDesktopServerUrl()}/api/extensions-v2/grants`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extensionId: DROP_RULES_EXTENSION_ID, proof }),
      },
    );
    const grantId = grantResponse.body?.grantId;
    if (!grantResponse.ok || typeof grantId !== "string" || !grantId) {
      return {
        ok: false,
        error: errorMessage(grantResponse.body, "Drop Rules could not open a staging folder."),
      };
    }

    return { ok: true, grantId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Drop Rules staging failed",
    };
  }
}

/**
 * Ask Drop Rules to prepare one sound for drag-out, supplying the file input
 * and the staging grant the command's schema requires. The extension's
 * declared deterministic drag path comes back in the value envelope.
 */
async function prepareDropRulesFile(fileId, stagingGrantId) {
  let response;
  try {
    response = await requestJson(`${getDesktopServerUrl()}/api/extensions-v2/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        extensionId: DROP_RULES_EXTENSION_ID,
        commandId: DROP_RULES_PREPARE_DRAG,
        input: { fileId, stagingGrantId },
        selection: { fileIds: [fileId], dropFileCount: 1 },
      }),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Drop Rules execution failed",
    };
  }

  const value = response.body?.outcome?.value;
  if (
    !response.ok ||
    !response.body?.ok ||
    typeof value?.dragPath !== "string" ||
    !value.dragPath
  ) {
    return {
      ok: false,
      error: errorMessage(response.body, "Drop Rules did not prepare a file."),
    };
  }

  return { ok: true, dragPath: value.dragPath };
}

/**
 * Re-check every returned drag path against the same readable containment the
 * server uses (Library roots or an issued grant). An extension can never hand
 * the bridge a path to drag that the app would not read.
 */
async function verifyReadableDragPath(candidatePath) {
  try {
    const response = await requestJson(`${getDesktopServerUrl()}/api/desktop/path`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: candidatePath }),
    });
    if (!response.ok || typeof response.body?.path !== "string" || !response.body.path) {
      return {
        ok: false,
        error: errorMessage(response.body, "The prepared file is outside the Library."),
      };
    }
    return { ok: true, path: response.body.path };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not verify the prepared file.",
    };
  }
}

/** The governed path: stage through Drop Rules, then verify what it returned. */
async function resolvePolicyDragPath(fileId) {
  const staging = await createStagingGrant();
  if (!staging.ok) {
    return { ok: false, error: `${staging.error} Disable Drop Rules to drag raw files.` };
  }

  const prepared = await prepareDropRulesFile(fileId, staging.grantId);
  if (!prepared.ok) {
    return {
      ok: false,
      error: `Drop Rules could not prepare this drag: ${prepared.error} Disable Drop Rules to drag raw files.`,
    };
  }

  const verified = await verifyReadableDragPath(prepared.dragPath);
  if (!verified.ok) {
    return {
      ok: false,
      error: `Drop Rules returned a file that failed the Library check: ${verified.error}`,
    };
  }

  return { ok: true, path: verified.path };
}

function createDragIcon() {
  const size = 32;
  const canvas = Buffer.alloc(size * size * 4);

  for (let index = 0; index < size * size; index += 1) {
    canvas[index * 4 + 0] = 255;
    canvas[index * 4 + 1] = 255;
    canvas[index * 4 + 2] = 255;
    canvas[index * 4 + 3] = 255;
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

async function startDragFile(event, payload) {
  const fileIds = Array.isArray(payload?.fileIds)
    ? [...new Set(payload.fileIds.filter((id) => typeof id === "string" && id))]
    : [];

  if (fileIds.length === 0) {
    event.sender.send(CHANNELS["desktop:action-error"], "Missing file ids");
    return;
  }

  const policy = await resolveDragPolicy(fileIds[0]);
  if (policy.mode === "error") {
    event.sender.send(CHANNELS["desktop:action-error"], policy.error);
    return;
  }

  const files = [];
  for (const fileId of fileIds) {
    if (policy.mode === "raw") {
      const resolved = await resolveIndexedFile(fileId);
      if (!resolved.ok) {
        event.sender.send(CHANNELS["desktop:action-error"], resolved.error);
        return;
      }
      files.push(resolved.file.path);
      continue;
    }

    const resolved = await resolvePolicyDragPath(fileId);
    if (!resolved.ok) {
      event.sender.send(CHANNELS["desktop:action-error"], resolved.error);
      return;
    }
    files.push(resolved.path);
  }

  event.sender.startDrag({
    files,
    icon: createDragIcon(),
  });
}

async function copyFilePath(fileId) {
  const resolved = await resolveIndexedFile(fileId);
  if (!resolved.ok) {
    return resolved;
  }

  clipboard.writeText(resolved.file.path);
  return { ok: true, path: resolved.file.path };
}

async function revealInExplorer(fileId) {
  const resolved = await resolveIndexedFile(fileId);
  if (!resolved.ok) {
    return resolved;
  }

  shell.showItemInFolder(resolved.file.path);
  return { ok: true, path: resolved.file.path };
}

async function openFileExternally(fileId) {
  const resolved = await resolveIndexedFile(fileId);
  if (!resolved.ok) {
    return resolved;
  }

  const error = await shell.openPath(resolved.file.path);
  if (error) {
    return { ok: false, error };
  }

  return { ok: true, path: resolved.file.path };
}

async function revealPath(candidatePath) {
  let resolvedPath = null;

  if (!resolvedPath) {
    try {
      const response = await fetch(`${getDesktopServerUrl()}/api/desktop/path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: candidatePath }),
      });
      const data = await response.json();
      if (response.ok && typeof data.path === "string") {
        resolvedPath = data.path;
      }
    } catch {}
  }

  if (!resolvedPath) {
    return { ok: false, error: "Path is outside the Library or chosen folders" };
  }

  shell.showItemInFolder(resolvedPath);
  return { ok: true, path: resolvedPath };
}

module.exports = {
  copyFilePath,
  grantDirectoryPath,
  openFileExternally,
  revealPath,
  revealInExplorer,
  startDragFile,
};
