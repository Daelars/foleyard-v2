import {
  deleteEmbeddingsForFile,
  getFileEmbedding,
  listEmbeddingIds,
  upsertFileEmbedding,
} from "@/lib/db";
import type { V2EmbeddingPorts } from "@yard-core";

import { getV2Events } from "./events";

/**
 * Application embedding ports for v2 operations (#192).
 *
 * Narrow structural subset of the embedding repository contract over
 * SQLite — no new migration, no v1 extension modules. Vectors persist
 * as float-32 blobs keyed by file and model; all ranking math lives
 * in yard-core.
 *
 * Persist-before-notify: each mutation commits its repository write
 * first and emits `contributions-changed` afterwards, so subscribers
 * that re-read on receipt always observe the triggering change.
 */

export type V2EmbeddingsDeps = {
  embeddings?: {
    upsert: V2EmbeddingPorts["upsert"];
    get: V2EmbeddingPorts["get"];
    listIds: V2EmbeddingPorts["listIds"];
    removeFile: V2EmbeddingPorts["removeFile"];
  };
  notify?: () => void;
};

function defaultNotify(): void {
  getV2Events().emit("contributions-changed", "*");
}

/** Repository-backed embedding ports; pass deps only in tests. */
export function createV2EmbeddingPorts(deps: V2EmbeddingsDeps = {}): V2EmbeddingPorts {
  const notify = deps.notify ?? defaultNotify;
  const ports = deps.embeddings;
  return {
    upsert: (fileId, model, dim, vec) => {
      if (ports) ports.upsert(fileId, model, dim, vec);
      else upsertFileEmbedding(fileId, model, dim, vec);
      notify();
    },
    get: (fileId, model) => {
      if (ports) return ports.get(fileId, model);
      const row = getFileEmbedding(fileId, model);
      return row ? { dim: row.dim, vec: new Uint8Array(row.vec.buffer, row.vec.byteOffset, row.vec.byteLength) } : null;
    },
    listIds: (model) => (ports ? ports.listIds(model) : listEmbeddingIds(model)),
    removeFile: (fileId) => {
      if (ports) ports.removeFile(fileId);
      else deleteEmbeddingsForFile(fileId);
      notify();
    },
  };
}
