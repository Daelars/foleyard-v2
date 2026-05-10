const fs = require("fs");

const { clipboard, nativeImage, shell } = require("electron");

const { DEV_SERVER_URL } = require("./constants.cjs");

async function resolveIndexedFile(fileId) {
  try {
    const response = await fetch(
      `${DEV_SERVER_URL}/api/desktop/file?id=${encodeURIComponent(fileId)}`,
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
      `${DEV_SERVER_URL}/api/extensions/drop-rules/prepare-drag`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      },
    );
    const data = await response.json();

    if (!response.ok || !data.file) {
      return { ok: false, error: data.error ?? "Drop Rules did not prepare a file" };
    }

    return { ok: true, file: data.file };
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
  let filePath = payload?.filePath;
  const fileId = payload?.fileId;

  if (typeof fileId === "string" && fileId) {
    const prepared = await prepareDropRulesFile(fileId);
    if (prepared.ok) {
      filePath = prepared.file.path;
    }
  }

  if (typeof filePath !== "string" || !filePath) {
    event.sender.send("desktop:action-error", "Missing file path");
    return;
  }

  if (!fs.existsSync(filePath)) {
    event.sender.send("desktop:action-error", "File no longer exists on disk");
    return;
  }

  event.sender.startDrag({
    files: [filePath],
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

module.exports = {
  copyFilePath,
  openFileExternally,
  revealInExplorer,
  startDragFile,
};
