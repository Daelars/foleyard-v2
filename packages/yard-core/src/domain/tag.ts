export interface Tag {
  id: string;
  name: string;
  color?: string | null;
  createdAt?: string | null;
}

/** How a file-to-tag attachment came to exist. Manual wins over every automatic source. */
export type TagOrigin = "manual" | "deterministic" | "semantic_ai";

/** One file-to-tag attachment with its provenance. */
export interface FileTagAttachment {
  fileId: string;
  tagId: string;
  origin: TagOrigin;
  confidence: number | null;
}
