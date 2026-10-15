import type { Collection } from "../domain/collection";

export interface CollectionRepository {
  getAllCollections(): Collection[];
  /** Point lookups (#252): indexed existence and name-uniqueness checks. */
  collectionExists(id: string): boolean;
  collectionNameExists(name: string, exceptId?: string): boolean;
  getCollectionById(id: string): Collection | null;
  createCollection(name: string, isSmart?: boolean, filter?: string, color?: string | null): string;
  createSmartCollection(name: string, filter: string): string;
  renameCollection(id: string, name: string): void;
  updateCollectionColor(id: string, color: string | null): void;
  updateCollectionFilter(id: string, filter: string): void;
  deleteCollection(collectionId: string): void;
  attachFileToCollection(fileId: string, collectionId: string): void;
  detachFileFromCollection(fileId: string, collectionId: string): void;
  convertToRegularCollection(collectionId: string): void;
}
