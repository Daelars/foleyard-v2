import type { MetadataSeam, MetadataTask, MetadataUpdateRecord } from "./types";

export function createMetadataQueue(
  concurrency: number,
  onResult: (record: MetadataUpdateRecord) => void,
  extractor: MetadataSeam,
  onError: () => void,
) {
  const pending: MetadataTask[] = [];
  let activeCount = 0;
  let fatalError: Error | null = null;
  let cancelled = false;

  type Waiter = { resolve: () => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout>; timeoutMs: number };
  const waiters = new Set<Waiter>();
  const notify = () => {
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      if (fatalError) { waiters.delete(waiter); waiter.reject(fatalError); }
      else if (activeCount === 0 && pending.length === 0) { waiters.delete(waiter); waiter.resolve(); }
      else waiter.timer = setTimeout(() => { waiters.delete(waiter); waiter.reject(new Error("Metadata queue stalled")); }, waiter.timeoutMs);
    }
  };

  const runNext = () => {
    while (activeCount < concurrency && pending.length > 0 && !fatalError && !cancelled) {
      const task = pending.shift()!;
      activeCount += 1;

      (async () => {
        try {
          let metadata;
          try {
            metadata = await extractor.extract(task.filePath, {
              fileSize: task.fileSize,
              filename: task.filename,
              format: task.format,
              fullParse: task.fullParse ?? false,
            });
          } catch {
            onError();
            return;
          }

          if (!cancelled) {
            onResult({
              path: task.filePath,
              codec: metadata.codec,
              duration: metadata.duration,
              sampleRate: metadata.sampleRate,
              bitDepth: metadata.bitDepth,
              channels: metadata.channels,
              fileSize: metadata.fileSize,
            });
          }
        } catch (error) {
          fatalError = error instanceof Error ? error : new Error(String(error));
        } finally {
          activeCount -= 1;
          runNext();
          notify();
        }
      })();
    }
  };

  return {
    enqueue(task: MetadataTask) {
      if (cancelled) return;
      if (fatalError) {
        throw fatalError;
      }

      pending.push(task);
      runNext();
    },
    onIdle(timeoutMs = 30000): Promise<void> {
      if (fatalError) return Promise.reject(fatalError);
      if (activeCount === 0 && pending.length === 0) return Promise.resolve();
      return new Promise((resolve, reject) => {
        waiters.add({ resolve, reject, timeoutMs });
        notify();
      });
    },
    cancel() {
      cancelled = true;
      pending.length = 0;
      fatalError = new Error("Metadata queue cancelled");
      notify();
    },
  };
}

