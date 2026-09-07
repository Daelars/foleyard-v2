import fs from "node:fs";
import { batchMarkRemoved, getFilesByIds, getLibraryRoots } from "@/lib/db";
import { resolveReadablePath } from "@/lib/filesystem-boundary";

export async function deleteFiles(fileIds: string[], permanent: boolean) {
    const removed: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    const now = new Date().toISOString();

    const byId = new Map(getFilesByIds(fileIds).map((record) => [record.id, record]));
    const removedPaths: string[] = [];

    const ids = fileIds;
    const concurrency = 8;
    type DeleteOutcome = { id: string; error: string } | { id: string; path: string };
    for (let start = 0; start < ids.length; start += concurrency) {
      const batch = ids.slice(start, start + concurrency);
      const results: DeleteOutcome[] = await Promise.all(
        batch.map(async (id): Promise<DeleteOutcome> => {
          const record = byId.get(id);
          if (!record) {
            return { id, error: 'Not found' };
          }

          if (permanent === true) {
            const readable = await resolveReadablePath(record.path, getLibraryRoots());
            if (!readable) return { id, error: 'File is missing or outside the configured Library roots' };
            try {
              await fs.promises.unlink(readable);
            } catch (error) {
              if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
                return {
                  id,
                  error: error instanceof Error ? error.message : 'Delete failed',
                };
              }
            }
          }

          return { id, path: record.path };
        }),
      );

      for (const result of results) {
        if ("error" in result) {
          failed.push({ id: result.id, error: result.error });
        } else {
          removed.push(result.id);
          removedPaths.push(result.path);
        }
      }
    }

    if (removedPaths.length > 0) {
      batchMarkRemoved(removedPaths, now, now);
    }

  return { removed, failed };
}
