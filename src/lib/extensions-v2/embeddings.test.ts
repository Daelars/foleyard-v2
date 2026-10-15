import { beforeEach, describe, expect, it, vi } from "vitest";

import { createV2EmbeddingPorts } from "./embeddings";

// Area: similarity search memory (#298). The production host builds its
// embedding ports with no injected repository, so the default wiring must
// turn a repository page into the unsigned view yard-core expects without
// changing the page bound or `hasMore`.

const db = vi.hoisted(() => ({
  listEmbeddingsPage: vi.fn(),
  getFileEmbedding: vi.fn(),
  upsertFileEmbedding: vi.fn(),
  deleteEmbeddingsForFile: vi.fn(),
}));
vi.mock("@/lib/db", () => db);

describe("createV2EmbeddingPorts default wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves a bounded repository page as an unsigned view", () => {
    db.listEmbeddingsPage.mockReturnValue({
      rows: [{ fileId: "a", dim: 2, vec: Buffer.from(new Float32Array([1, 0]).buffer) }],
      hasMore: true,
    });

    const ports = createV2EmbeddingPorts();
    const page = ports.listPage("model", { after: "start", limit: 256 });

    expect(db.listEmbeddingsPage).toHaveBeenCalledWith("model", { after: "start", limit: 256 });
    expect(page.hasMore).toBe(true);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]!.fileId).toBe("a");
    expect(page.rows[0]!.dim).toBe(2);
    expect(page.rows[0]!.vec).toBeInstanceOf(Uint8Array);
    expect([...page.rows[0]!.vec]).toHaveLength(8);
  });

  it("exposes no API that reads a whole model's vectors at once", () => {
    const ports = createV2EmbeddingPorts();
    expect(Object.keys(ports).sort()).toEqual(["get", "listPage", "removeFile", "upsert"]);
  });
});
