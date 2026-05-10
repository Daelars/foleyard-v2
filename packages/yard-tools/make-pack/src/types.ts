export type MakePackSource = "selection" | "shelf" | "recent";

export type MakePackOutputFormat = "folder" | "zip";

export type MakePackFile = {
  id: string;
  filename: string;
  path: string;
  duration: number | null;
  format: string | null;
  fileSize: number | null;
};

export type MakePackOptions = {
  source: MakePackSource;
  files: MakePackFile[];
  destinationDirectory: string;
  packName?: string;
  outputFormat?: MakePackOutputFormat;
  includeManifest?: boolean;
};

export type MakePackItem = {
  fileId: string;
  filename: string;
  outputName: string;
  sourcePath: string;
  size: number;
};

export type MakePackResult = {
  ok: true;
  source: MakePackSource;
  outputFormat: MakePackOutputFormat;
  packName: string;
  outputPath: string;
  fileCount: number;
  skipped: string[];
  items: MakePackItem[];
};
