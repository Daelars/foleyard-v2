import {
  downloadModel,
  type ModelDownloadCallbacks,
  type ModelDownloadOptions,
  type ModelManifest,
} from "@/lib/audio-analysis/models";

/**
 * Single-flight model downloads (Application context, #289).
 *
 * A local analysis model installation has exactly one owner. The active
 * transfer set lives on the process-wide v2 runtime
 * (`src/lib/extensions-v2/runtime.ts`), not in a module variable: Next
 * compiles each route into its own bundle, so a module-level set forks
 * per route subtree and two concurrent jobs would each believe they own
 * the download. Keyed by the manifest's model id — one model store per
 * process — the second caller is told the transfer already exists
 * instead of starting a competing one.
 *
 * The second caller is rejected rather than joined. Joining would make
 * cancellation ambiguous: one job cancelling the shared transfer would
 * tear down a transfer another job is still awaiting. Rejection keeps
 * every job's cancellation its own, and the lock always clears — on
 * success, on failure, and on cancellation — so a retry can start.
 */

export class ModelDownloadInProgressError extends Error {
  /** Stable discriminator, matched structurally across route bundles. */
  readonly code = "model-download-in-progress";
  constructor(readonly modelId: string) {
    super(
      `Model ${JSON.stringify(modelId)} is already downloading; wait for the active download to finish before retrying.`,
    );
    this.name = "ModelDownloadInProgressError";
  }
}

export class ModelDownloadCoordinator {
  private readonly active = new Set<string>();

  /** True while this process owns an active transfer for the model. */
  isDownloading(modelId: string): boolean {
    return this.active.has(modelId);
  }

  /**
   * Start the one transfer for `manifest.id`, or reject with
   * `ModelDownloadInProgressError` when one is already running. The lock
   * is released when the transfer settles, whatever the outcome.
   */
  async download(
    manifest: ModelManifest,
    callbacks: ModelDownloadCallbacks = {},
    options: ModelDownloadOptions = {},
  ): Promise<{ bytes: number }> {
    if (this.active.has(manifest.id)) {
      throw new ModelDownloadInProgressError(manifest.id);
    }
    this.active.add(manifest.id);
    try {
      return await downloadModel(manifest, callbacks, options);
    } finally {
      this.active.delete(manifest.id);
    }
  }
}
