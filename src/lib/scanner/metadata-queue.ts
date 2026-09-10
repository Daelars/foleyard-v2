import type { MetadataSeam, MetadataTask, MetadataUpdateRecord } from "./types";

/** Waiting-job bound; discovery pauses on admission until capacity frees. */
const DEFAULT_CAPACITY = 500;

export function createMetadataQueue(
  concurrency: number,
  onResult: (record: MetadataUpdateRecord) => void,
  extractor: MetadataSeam,
  onError: () => void,
  options?: { capacity?: number },
) {
  const capacity = options?.capacity ?? DEFAULT_CAPACITY;
  // Index-based deque: tasks leave by advancing `head` instead of
  // Array.shift, so a large backlog never pays the O(n) shift cost. The
  // array compacts when the waste grows past a threshold.
  const pending: MetadataTask[] = [];
  let head = 0;
  let activeCount = 0;
  let fatalError: Error | null = null;
  let cancelled = false;

  const pendingCount = () => pending.length - head;

  type Waiter = { resolve: () => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout>; timeoutMs: number };
  const idleWaiters = new Set<Waiter>();
  const admissionWaiters = new Set<Waiter>();

  const compactPending = () => {
    if (head > 1024 && head * 2 > pending.length) {
      pending.splice(0, head);
      head = 0;
    }
  };

  const settleAdmissionWaiters = () => {
    for (const waiter of admissionWaiters) {
      if (fatalError || cancelled) {
        admissionWaiters.delete(waiter);
        waiter.reject(fatalError ?? new Error("Metadata queue cancelled"));
      } else if (pendingCount() < capacity) {
        admissionWaiters.delete(waiter);
        waiter.resolve();
      }
    }
  };

  const notify = () => {
    settleAdmissionWaiters();
    for (const waiter of idleWaiters) {
      clearTimeout(waiter.timer);
      if (fatalError) { idleWaiters.delete(waiter); waiter.reject(fatalError); }
      else if (activeCount === 0 && pendingCount() === 0) { idleWaiters.delete(waiter); waiter.resolve(); }
      else waiter.timer = setTimeout(() => { idleWaiters.delete(waiter); waiter.reject(new Error("Metadata queue stalled")); }, waiter.timeoutMs);
    }
  };

  const runNext = () => {
    while (activeCount < concurrency && pendingCount() > 0 && !fatalError && !cancelled) {
      const task = pending[head]!;
      head += 1;
      compactPending();
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
    /**
     * Awaitable admission: waits while the waiting list is at capacity so
     * discovery pauses instead of building an unbounded backlog. Rejects on
     * cancel or fatal write failure so blocked producers are woken.
     */
    async enqueue(task: MetadataTask): Promise<void> {
      if (cancelled) return;
      if (fatalError) {
        throw fatalError;
      }
      while (!cancelled && !fatalError && pendingCount() >= capacity) {
        await new Promise<void>((resolve, reject) => {
          admissionWaiters.add({ resolve, reject, timeoutMs: 0 });
          settleAdmissionWaiters();
        });
      }
      if (cancelled) return;
      if (fatalError) {
        throw fatalError;
      }
      pending.push(task);
      runNext();
    },
    onIdle(timeoutMs = 30000): Promise<void> {
      if (fatalError) return Promise.reject(fatalError);
      if (activeCount === 0 && pendingCount() === 0) return Promise.resolve();
      return new Promise((resolve, reject) => {
        idleWaiters.add({ resolve, reject, timeoutMs });
        notify();
      });
    },
    cancel() {
      cancelled = true;
      pending.length = 0;
      head = 0;
      fatalError = new Error("Metadata queue cancelled");
      notify();
    },
    getCounts() {
      return { pending: pendingCount(), active: activeCount };
    },
  };
}