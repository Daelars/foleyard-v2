import type { Collection } from "../domain/collection";

export interface CollectionRepository {
  getAllCollections(): Collection[];
  createCollection(name: string, isSmart?: boolean, filter?: string): string;
  createSmartCollection(name: string, filter: string): string;
  renameCollection(id: string, name: string): void;
  updateCollectionFilter(id: string, filter: string): void;
  deleteCollection(collectionId: string): void;
  attachFileToCollection(fileId: string, collectionId: string): void;
  detachFileFromCollection(fileId: string, collectionId: string): void;
  convertToRegularCollection(collectionId: string): void;
}
