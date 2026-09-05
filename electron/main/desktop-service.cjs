const { clipboard, nativeImage, shell } = require("electron");

const { randomBytes } = require("node:crypto");
const { getDesktopServerUrl } = require("./server-url.cjs");

process.env.FOLEYARD_GRANT_SECRET ||= randomBytes(32).toString("hex");

async function grantDirectoryPath(directoryPath) {
  const response = await fetch(`${getDesktopServerUrl()}/api/desktop/grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-foleyard-grant-secret": process.env.FOLEYARD_GRANT_SECRET },
    body: JSON.stringify({ path: directoryPath }),
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

async function prepareDropRulesFile(fileId) {
  try {
    const response = await fetch(
      `${getDesktopServerUrl()}/api/extensions/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extensionId: "drop-rules",
          commandId: "drop-rules.prepare-drag",
          selection: { fileIds: [fileId] },
          input: { fileId },
        }),
      },
    );
    const data = await response.json();

    if (!response.ok || !data.value?.file) {
      return { ok: false, error: data.error ?? data.message ?? "Drop Rules did not prepare a file" };
    }

    return { ok: true, file: data.value.file };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to prepare Drop Rules file",
    };
  }
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
    event.sender.send("desktop:action-error", "Missing file ids");
    return;
  }

  const files = [];
  for (const fileId of fileIds) {
    const prepared = await prepareDropRulesFile(fileId);
    const resolved = prepared.ok ? prepared : await resolveIndexedFile(fileId);
    if (!resolved.ok) {
      event.sender.send("desktop:action-error", resolved.error);
      return;
    }
    files.push(resolved.file.path);
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
