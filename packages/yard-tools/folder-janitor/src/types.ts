export type JanitorFile = {
  id: string;
  filename: string;
  path: string;
  format: string | null;
  fileSize: number | null;
  duration: number | null;
};

export type JanitorScanOptions = {
  libraryRoots: string[];
  files: JanitorFile[];
  tinyFileThresholdBytes?: number;
  allowedFormats?: string[];
};

export type JanitorIssue = {
  kind:
    | "duplicate"
    | "broken"
    | "empty-folder"
    | "tiny-file"
    | "weird-format"
    | "missing-file";
  path: string;
  fileIds: string[];
  message: string;
};

export type JanitorReport = {
  ok: true;
  scannedFiles: number;
  scannedRoots: string[];
  issues: JanitorIssue[];
};
