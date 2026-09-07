import { cosineSimilarity } from "yard-core";

/**
 * Zero-shot semantic ranking (Yard Tools context, #195). Pure math over
 * vectors: the audio embedding ranks the approved vocabulary by cosine,
 * and only labels at or above threshold earn an attachment, capped per
 * file. Nothing here invents tags — candidates come from the tags
 * table, so explicit accept stays intact.
 */

/** Must match the model the application adapter serves. */
export const CLAP_MODEL_ID = "Xenova/clap-htsat-unfused";

/** Zero-shot prompt template (CLAP convention). */
export function clapPrompt(label: string): string {
  return `This is a sound of ${label}`;
}

/** Minimum cosine to attach a semantic tag. */
export const SEMANTIC_THRESHOLD = 0.5;

/** Most semantic tags one file earns per run. */
export const SEMANTIC_TOP_K = 3;

export type RankedLabel = { label: string; confidence: number };

/** Rank labels for one audio vector, best first, thresholded and capped. */
export function rankLabels(
  audioVec: ArrayLike<number>,
  labels: string[],
  textVecs: ArrayLike<number>[],
  threshold: number = SEMANTIC_THRESHOLD,
  topK: number = SEMANTIC_TOP_K,
): RankedLabel[] {
  const scored = labels
    .map((label, index) => ({
      label,
      confidence: cosineSimilarity(audioVec, textVecs[index] ?? []),
    }))
    .filter((entry) => entry.confidence >= threshold)
    .sort((left, right) => right.confidence - left.confidence);
  return scored.slice(0, Math.max(0, topK));
}
