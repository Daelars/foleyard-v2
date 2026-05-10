export type GatherOptions = {
  sourceDirectories: string[];
  destinationDirectory: string;
  preserveFolderNames?: boolean;
  skipDuplicates?: boolean;
  audioExtensions?: string[];
};

export type GatheredFile = {
  sourcePath: string;
  outputPath: string;
  size: number;
  skipped: boolean;
  reason: string | null;
};

export type GatherResult = {
  ok: true;
  sourceDirectories: string[];
  destinationDirectory: string;
  copied: number;
  skipped: number;
  files: GatheredFile[];
  reportPath: string;
};
