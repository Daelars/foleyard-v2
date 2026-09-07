import path from "node:path";

import type { IndexedAudioFile } from "@yard-core";
import type { MakePackFile } from "@foleyard/make-pack";

import {
  getAllFilesIncludingRemoved,
  getFileById,
  getFiles,
  getFilesByIds,
  getLibraryRoots,
  getTagsForFiles,
} from "@/lib/db";
import {
  resolveReadablePath,
  resolveWritablePath,
} from "@/lib/filesystem-boundary";
import { getRecentMakePackFileIds } from "@/lib/extensions/make-pack-recent-store";
import { DbSoundShelfStore } from "@/lib/extensions/sound-shelf-store";

export type ExecuteTransportBody = {
  extensionId?: string;
  commandId?: string;
  selection?: {
    fileIds?: string[];
    folderPath?: string;
    collectionId?: string;
  };
  input?: unknown;
  destinationGrant?: string;
};

/** Upper bound for a single folder scan so one huge directory cannot OOM the host. */
export const MAX_SCAN_FOLDER_FILES = 5000;

export type ResolvedCommandTransport =
  | {
      ok: true;
      selection?: ExecuteTransportBody["selection"];
      input?: unknown;
      inputProvided: boolean;
      destinationGrant?: string;
      shapeResult?: (value: unknown) => unknown | Promise<unknown>;
    }
  | { ok: false; message: string; status: number };

type TransportAdapter = (
  body: ExecuteTransportBody,
) => Promise<ResolvedCommandTransport>;

function passthrough(): ResolvedCommandTransport {
  return { ok: true, inputProvided: false };
}

function failure(message: string, status: number): ResolvedCommandTransport {
  return { ok: false, message, status };
}

function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null
    ? (input as Record<string, unknown>)
    : {};
}

async function resolveMakePack(
  body: ExecuteTransportBody,
  source: "selection" | "shelf" | "recent",
): Promise<ResolvedCommandTransport> {
  if (body.input === undefined) {
    return passthrough();
  }

  const input = asRecord(body.input);
  const destinationDirectory =
    typeof input.destinationDirectory === "string"
      ? input.destinationDirectory
      : "";

  if (!destinationDirectory) {
    return failure("destinationDirectory is required", 400);
  }

  const destination =
    typeof body.destinationGrant === "string"
      ? await resolveWritablePath(destinationDirectory, body.destinationGrant)
      : null;
  if (!destination) {
    return failure(
      "Destination is outside a granted directory. Choose it with the folder picker.",
      403,
    );
  }

  const rawFileIds = input.fileIds;
  if (
    rawFileIds !== undefined &&
    (!Array.isArray(rawFileIds) ||
      !rawFileIds.every((id) => typeof id === "string"))
  ) {
    return failure("fileIds must be an array of strings", 400);
  }

  const fileIds =
    source === "shelf"
      ? new DbSoundShelfStore().getFileIds()
      : source === "recent"
        ? getRecentMakePackFileIds()
        : ((rawFileIds as string[] | undefined) ?? []);

  if (fileIds.length === 0) {
    return failure("No sounds found for that pack source", 400);
  }

  const files = hydrateFiles(fileIds);
  if (files.length === 0) {
    return failure("No indexed sounds found for that selection", 404);
  }
  for (const file of files) {
    const readable = await resolveReadablePath(file.path, getLibraryRoots());
    if (!readable) {
      return failure(
        "Source is outside the configured Library roots",
        403,
      );
    }
    file.path = readable;
  }

  return {
    ok: true,
    selection: { fileIds },
    input: {
      files,
      destinationDirectory: destination,
      packName: input.packName,
      outputFormat: input.outputFormat,
    },
    inputProvided: true,
    destinationGrant: body.destinationGrant,
  };
}

function hydrateFiles(fileIds: string[]): MakePackFile[] {
  const seen = new Set<string>();
  const byId = new Map(getFilesByIds([...new Set(fileIds)]).map((file) => [file.id, file]));
  const files: MakePackFile[] = [];

  for (const fileId of fileIds) {
    if (seen.has(fileId)) {
      continue;
    }

    seen.add(fileId);
    const file = byId.get(fileId);
    if (!file || file.removedAt) {
      continue;
    }

    files.push({
      id: file.id,
      filename: file.filename,
      path: file.path,
      duration: file.duration,
      format: file.format,
      fileSize: file.fileSize,
    });
  }

  return files;
}

async function resolveJanitorScanLibrary(
  body: ExecuteTransportBody,
): Promise<ResolvedCommandTransport> {
  if (body.input === undefined) {
    return passthrough();
  }

  const libraryRoots = getLibraryRoots();

  if (libraryRoots.length === 0) {
    return failure("No library roots configured", 400);
  }

  const files = getAllFilesIncludingRemoved()
    .filter((file) => file.removedAt === null)
    .map((file) => ({
      id: file.id,
      filename: file.filename,
      path: file.path,
      format: file.format,
      fileSize: file.fileSize,
      duration: file.duration,
    }));

  return {
    ok: true,
    input: { files, libraryRoots },
    inputProvided: true,
  };
}

async function resolveJanitorScanFolder(
  body: ExecuteTransportBody,
): Promise<ResolvedCommandTransport> {
  if (body.input === undefined) {
    return passthrough();
  }

  const folderPath = asRecord(body.input).folderPath;

  if (typeof folderPath !== "string" || !folderPath) {
    return failure("folderPath is required", 400);
  }

  const libraryRoots = getLibraryRoots();

  if (libraryRoots.length === 0) {
    return failure("No library roots configured", 400);
  }

  const absoluteFolder = await resolveReadablePath(folderPath, libraryRoots);
  let libraryRoot: string | undefined;
  if (absoluteFolder) {
    for (const root of libraryRoots) {
      if (await resolveReadablePath(absoluteFolder, [root])) {
        libraryRoot = root;
        break;
      }
    }
  }
  if (!libraryRoot || !absoluteFolder) {
    return failure("Folder is outside the configured Library roots", 400);
  }
  const directory =
    path.relative(path.resolve(libraryRoot), absoluteFolder) || null;
  const files = getFiles({
    libraryRoot,
    directory,
    atLibraryRoot: directory === null,
    showRemoved: false,
    limit: MAX_SCAN_FOLDER_FILES,
  });

  return {
    ok: true,
    selection: { folderPath },
    input: {
      files: files.map((file) => ({
        id: file.id,
        filename: file.filename,
        path: file.path,
        format: file.format,
        fileSize: file.fileSize,
        duration: file.duration,
      })),
      libraryRoots,
    },
    inputProvided: true,
  };
}

async function resolveDeleteFolders(
  body: ExecuteTransportBody,
): Promise<ResolvedCommandTransport> {
  const paths = asRecord(body.input).paths;

  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    !paths.every(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.length > 0,
    )
  ) {
    return failure("paths array is required", 400);
  }

  const libraryRoots = getLibraryRoots();
  if (libraryRoots.length === 0) {
    return failure("No library roots configured", 400);
  }

  const resolved = await Promise.all(
    paths.map((candidate) => resolveReadablePath(candidate, libraryRoots)),
  );
  if (resolved.some((candidate) => candidate === null)) {
    return failure("Folder is outside the configured Library roots", 403);
  }

  return {
    ok: true,
    input: { paths: resolved, libraryRoots },
    inputProvided: true,
  };
}

async function resolveGather(
  body: ExecuteTransportBody,
): Promise<ResolvedCommandTransport> {
  if (body.input === undefined) {
    return passthrough();
  }

  const input = asRecord(body.input);
  const sourceDirectories = input.sourceDirectories;
  const destinationDirectory = input.destinationDirectory;

  if (
    !Array.isArray(sourceDirectories) ||
    sourceDirectories.length === 0 ||
    !sourceDirectories.every((value) => typeof value === "string")
  ) {
    return failure("sourceDirectories array is required", 400);
  }

  if (
    typeof destinationDirectory !== "string" ||
    !destinationDirectory
  ) {
    return failure("destinationDirectory is required", 400);
  }

  const destination =
    typeof body.destinationGrant === "string"
      ? await resolveWritablePath(destinationDirectory, body.destinationGrant)
      : null;
  if (!destination) {
    return failure(
      "Destination is outside a granted directory. Choose it with the folder picker.",
      403,
    );
  }
  const sources = await Promise.all(
    (sourceDirectories as string[]).map((source) =>
      resolveReadablePath(source, getLibraryRoots()),
    ),
  );
  if (sources.some((source) => source === null)) {
    return failure(
      "Source is outside the configured Library roots",
      403,
    );
  }

  return {
    ok: true,
    input: {
      sourceDirectories: sources,
      destinationDirectory: destination,
    },
    inputProvided: true,
    destinationGrant: body.destinationGrant,
  };
}

async function resolveSaveSearch(
  body: ExecuteTransportBody,
): Promise<ResolvedCommandTransport> {
  const input = asRecord(body.input);
  const name =
    typeof input.name === "string" ? input.name.trim() : "";
  const query =
    typeof input.query === "string" ? input.query.trim() : "";

  if (!name || !query) {
    return failure("name and query are required", 400);
  }

  return {
    ok: true,
    input: { name, filter: { q: query } },
    inputProvided: true,
    shapeResult: (value) => ({ success: true, id: value }),
  };
}

async function resolvePrepareDrag(
  body: ExecuteTransportBody,
): Promise<ResolvedCommandTransport> {
  const fileId = asRecord(body.input).fileId;

  if (typeof fileId !== "string" || !fileId) {
    return failure("fileId is required", 400);
  }

  const file = getFileById(fileId);
  if (!file || file.removedAt) {
    return failure("File is not indexed", 404);
  }

  const readable = await resolveReadablePath(file.path, getLibraryRoots());
  if (!readable) {
    return failure(
      "Source is outside the configured Library roots",
      403,
    );
  }

  return {
    ok: true,
    selection: { fileIds: [file.id] },
    input: {
      file: {
        id: file.id,
        filename: file.filename,
        path: readable,
        format: file.format,
      },
    },
    inputProvided: true,
    shapeResult: (value) => {
      const result = value as {
        dragPath: string;
        outputName: string;
        originalPath: string;
        staged: boolean;
        usedReportPath: string | null;
      };
      return {
        file: {
          id: file.id,
          path: result.dragPath,
          filename: result.outputName,
          originalPath: result.originalPath,
          staged: result.staged,
          usedReportPath: result.usedReportPath,
        },
      };
    },
  };
}

async function shapeShelfList(value: unknown): Promise<unknown> {
  if (
    !Array.isArray(value) ||
    !value.every((entry): entry is string => typeof entry === "string")
  ) {
    return { items: [], error: "Shelf contents were invalid" };
  }
  const fileIds = value as string[];
  const byId = new Map(getFilesByIds(fileIds).map((file) => [file.id, file]));
  const files = fileIds
    .map((fileId) => byId.get(fileId) ?? null)
    .filter(
      (file): file is IndexedAudioFile =>
        file !== null && file.removedAt === null,
    );
  const ids = files.map((file) => file.id);
  if (ids.length !== fileIds.length) {
    new DbSoundShelfStore().setFileIds(ids);
  }
  const tagsByFile = getTagsForFiles(ids);

  return {
    items: files.map((file) => ({
      id: file.id,
      filename: file.filename,
      path: file.path,
      directory: file.directory,
      format: file.format,
      duration: file.duration,
      fileSize: file.fileSize,
      mtimeMs: file.mtimeMs,
      isFavorite: file.isFavorite,
      tags: tagsByFile.get(file.id) ?? [],
    })),
  };
}

async function resolveDropRuleCommand(
  body: ExecuteTransportBody,
  opts: { requireWritableGrant: boolean },
): Promise<ResolvedCommandTransport> {
  if (body.input === undefined) {
    return passthrough();
  }
  const input = asRecord(body.input);
  const targetDirectory =
    typeof input.targetDirectory === "string" ? input.targetDirectory : "";
  const rawFiles = Array.isArray(input.files) ? input.files : [];

  if (!targetDirectory) {
    return failure("targetDirectory is required", 400);
  }
  if (rawFiles.length === 0) {
    return failure("files array is required", 400);
  }

  // Hydrate file entries and enforce readable authorization.
  const hydrated: Array<{ fileId?: string; path: string; filename: string }> = [];
  for (const entry of rawFiles) {
    if (typeof entry !== "object" || entry === null) {
      return failure("files entries must be objects", 400);
    }
    const rec = entry as Record<string, unknown>;
    const candidatePath = typeof rec.path === "string" ? rec.path : "";
    const filename = typeof rec.filename === "string" ? rec.filename : "";
    if (!candidatePath || !filename) {
      return failure("each file needs path and filename", 400);
    }
    const readable = await resolveReadablePath(candidatePath, getLibraryRoots());
    if (!readable) {
      return failure("Source is outside the configured Library roots", 403);
    }
    hydrated.push({
      ...(typeof rec.fileId === "string" ? { fileId: rec.fileId } : {}),
      path: readable,
      filename,
    });
  }

  // Destination grants remain scoped and opaque: apply requires a grant.
  let destination = targetDirectory;
  if (opts.requireWritableGrant || typeof body.destinationGrant === "string") {
    if (typeof body.destinationGrant !== "string" || !body.destinationGrant) {
      return failure(
        "Destination is outside a granted directory. Choose it with the folder picker.",
        403,
      );
    }
    const resolved = await resolveWritablePath(targetDirectory, body.destinationGrant);
    if (!resolved) {
      return failure(
        "Destination is outside a granted directory. Choose it with the folder picker.",
        403,
      );
    }
    destination = resolved;
  }

  return {
    ok: true,
    input: { targetDirectory: destination, files: hydrated },
    inputProvided: true,
    destinationGrant: body.destinationGrant,
  };
}

const transportAdapters: Record<string, TransportAdapter> = {
  "make-pack make-pack.from-selection": (body) =>
    resolveMakePack(body, "selection"),
  "make-pack make-pack.from-shelf": (body) =>
    resolveMakePack(body, "shelf"),
  "make-pack make-pack.from-recent": (body) =>
    resolveMakePack(body, "recent"),
  "folder-janitor folder-janitor.scan-library": (body) =>
    resolveJanitorScanLibrary(body),
  "folder-janitor folder-janitor.scan-folder": (body) =>
    resolveJanitorScanFolder(body),
  "folder-janitor folder-janitor.delete-folders": (body) =>
    resolveDeleteFolders(body),
  "library-gatherer library-gatherer.preview-gather": (body) =>
    resolveGather(body),
  "library-gatherer library-gatherer.gather": (body) =>
    resolveGather(body),
  "smart-collections smart-collections.save-search": (body) =>
    resolveSaveSearch(body),
  "drop-rules drop-rules.prepare-drag": (body) =>
    resolvePrepareDrag(body),
  "drop-rules drop-rules.preview": (body) =>
    resolveDropRuleCommand(body, { requireWritableGrant: false }),
  "drop-rules drop-rules.apply": (body) =>
    resolveDropRuleCommand(body, { requireWritableGrant: true }),
  "sound-shelf sound-shelf.list": () =>
    Promise.resolve({
      ok: true,
      inputProvided: false,
      shapeResult: shapeShelfList,
    } as ResolvedCommandTransport),
};

export function validateTransportEnvelope(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return "request body must be an object";
  }
  const rec = body as Record<string, unknown>;
  if (typeof rec.extensionId !== "string" || !rec.extensionId.trim()) {
    return "extensionId must be a non-empty string";
  }
  if (typeof rec.commandId !== "string" || !rec.commandId.trim()) {
    return "commandId must be a non-empty string";
  }
  if (rec.selection !== undefined) {
    if (typeof rec.selection !== "object" || rec.selection === null || Array.isArray(rec.selection)) {
      return "selection must be an object";
    }
    const sel = rec.selection as Record<string, unknown>;
    for (const key of ["fileIds", "folderPath", "collectionId"] as const) {
      void key;
    }
    if (sel.fileIds !== undefined && (!Array.isArray(sel.fileIds) || !sel.fileIds.every((v) => typeof v === "string"))) {
      return "selection.fileIds must be an array of strings";
    }
    if (sel.folderPath !== undefined && typeof sel.folderPath !== "string") {
      return "selection.folderPath must be a string";
    }
    if (sel.collectionId !== undefined && typeof sel.collectionId !== "string") {
      return "selection.collectionId must be a string";
    }
  }
  if (rec.destinationGrant !== undefined && typeof rec.destinationGrant !== "string") {
    return "destinationGrant must be a string";
  }
  return null;
}

export function resolveCommandTransport(
  body: ExecuteTransportBody,
): Promise<ResolvedCommandTransport> {
  const adapter =
    transportAdapters[`${body.extensionId} ${body.commandId}`];
  if (!adapter) {
    return Promise.resolve(passthrough());
  }

  return adapter(body);
}
