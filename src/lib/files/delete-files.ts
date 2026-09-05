import fs from "node:fs";
import { getFileById, getLibraryRoots, markFileRemoved } from "@/lib/db";
import { resolveReadablePath } from "@/lib/filesystem-boundary";

export async function deleteFiles(fileIds: string[], permanent: boolean) {
    const removed: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    const now = new Date().toISOString();

    const ids = fileIds;
    const concurrency = 8;
    for (let start = 0; start < ids.length; start += concurrency) {
      const batch = ids.slice(start, start + concurrency);
      const results = await Promise.all(
        batch.map(async (id) => {
          const record = getFileById(id);
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

          markFileRemoved(record.path, now);
          return { id };
        }),
      );

      for (const result of results) {
        if (result.error) {
          failed.push({ id: result.id, error: result.error });
        } else {
          removed.push(result.id);
        }
      }
    }


  return { removed, failed };
}
