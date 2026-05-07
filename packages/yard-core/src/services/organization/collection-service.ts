import type { Collection } from "../../domain/collection";

export interface CollectionService {
  getAllCollections(): Collection[];
  createCollection(name: string): string;
  deleteCollection(collectionId: string): void;
  attachFileToCollection(fileId: string, collectionId: string): void;
  detachFileFromCollection(fileId: string, collectionId: string): void;
}
