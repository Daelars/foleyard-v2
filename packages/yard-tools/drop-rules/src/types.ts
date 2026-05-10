export type DropRulesFile = {
  id: string;
  filename: string;
  path: string;
  format?: string | null;
};

export type DropRuleOptions = {
  targetDirectory: string;
  files: DropRulesFile[];
  renamePattern?: string;
  renameOnDrop?: boolean;
  copyOnDrop?: boolean;
  markUsed?: boolean;
};

export type PrepareDragOptions = {
  stagingDirectory: string;
  file: DropRulesFile;
  renamePattern?: string;
  renameOnDrop?: boolean;
  copyOnDrop?: boolean;
  markUsed?: boolean;
};

export type DropRuleAction = {
  fileId: string;
  sourcePath: string;
  outputName: string;
  outputPath: string;
  copied: boolean;
};

export type DropRulesResult = {
  ok: true;
  targetDirectory: string;
  actions: DropRuleAction[];
  usedReportPath: string | null;
  warnings: string[];
};

export type PreparedDragResult = {
  ok: true;
  fileId: string;
  originalPath: string;
  dragPath: string;
  outputName: string;
  staged: boolean;
  usedReportPath: string | null;
};
