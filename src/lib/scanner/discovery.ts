import type { ScanPhaseContext } from "./types";
import type { createMetadataQueue } from "./metadata-queue";
import { validateLibraryRoot } from "./validation";
import { processDiscoveredBatch } from "./reconcile";

const DISCOVERY_BATCH_SIZE = 500;

export async function discoverRoots(context: ScanPhaseContext, libraryRoots: string[], lastScannedAt: string, seenPaths: Set<string>, metadataQueue: ReturnType<typeof createMetadataQueue>) {
  const healthyRoots = new Set<string>();
      for (const libraryRoot of libraryRoots) {
        context.status.phase = "validating";
        context.emitProgress();
        const validation = await validateLibraryRoot(libraryRoot, context.fs);
        if (!validation.valid || !validation.normalizedPath) {
          context.incrementScanErrors();
          continue;
        }

        const normalizedRoot = validation.normalizedPath;
        context.status.phase = "discovering";
        context.emitProgress();

        let discoveryFailed = false;
        for await (const batch of context.fs.streamAudioFileBatches(normalizedRoot, {
          batchSize: DISCOVERY_BATCH_SIZE,
          onDiscover: () => {
            context.status.discovered += 1;
            context.status.total = context.status.discovered;
          },
          onError: () => { discoveryFailed = true; context.incrementScanErrors(); },
        })) {
          context.status.phase = "indexing";
          context.emitProgress();
          await processDiscoveredBatch(context, 
            batch,
            normalizedRoot,
            lastScannedAt,
            seenPaths,
            metadataQueue,
          );
        }
        if (!discoveryFailed) healthyRoots.add(normalizedRoot);
      }

  return healthyRoots;
}
