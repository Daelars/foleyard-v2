import type { PathValidation, ScanStatus } from "./scan-types";

export interface ScannerService {
  getStatus(): ScanStatus;
  validateLibraryRoot(inputPath: string): Promise<PathValidation>;
  saveLibraryRoot(libraryRoot: string): void;
  startScan(): { started: boolean; reason?: string; status: ScanStatus };
}
