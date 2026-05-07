import type { AudioFileIdentity } from "../../domain/audio-file";

export interface DesktopActionResult {
  ok: boolean;
  error?: string;
  path?: string;
}

export interface DesktopFileResolver {
  resolveIndexedFile(fileId: string): Promise<
    | { ok: true; file: AudioFileIdentity }
    | { ok: false; error: string }
  >;
}

export interface DesktopService {
  copyFilePath(fileId: string): Promise<DesktopActionResult>;
  revealInExplorer(fileId: string): Promise<DesktopActionResult>;
  openFileExternally(fileId: string): Promise<DesktopActionResult>;
}
