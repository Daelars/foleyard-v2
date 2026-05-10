export interface SoundShelfStore {
  getFileIds(): string[];
  setFileIds(fileIds: string[]): void;
}

export class InMemorySoundShelfStore implements SoundShelfStore {
  private fileIds: string[] = [];

  getFileIds(): string[] {
    return [...this.fileIds];
  }

  setFileIds(fileIds: string[]): void {
    this.fileIds = [...fileIds];
  }
}
