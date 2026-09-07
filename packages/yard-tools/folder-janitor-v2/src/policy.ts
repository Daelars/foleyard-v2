/**
 * Pure janitor policy helpers for Folder Janitor v2 (Yard Tools
 * context, J4 #179).
 *
 * No services, no filesystem, no v1 imports: issue derivation from
 * Library index metadata, format/threshold parsing, and path
 * normalization. The handlers feed these from the v2 operation
 * services; the tests assert them without touching disk.
 */

export type JanitorIssueKind =
  | "duplicate"
  | "broken"
  | "empty-folder"
  | "tiny-file"
  | "weird-format"
  | "missing-file";

export type JanitorIssue = {
  kind: JanitorIssueKind;
  path: string;
  fileIds: string[];
  message: string;
};

export type JanitorRecord = {
  id: string;
  filename: string;
  path: string;
  format: string | null;
  fileSize: number | null;
};

/** Default "normal" audio formats (matches v1). */
export const DEFAULT_ALLOWED_FORMATS = "wav,aif,aiff,mp3,flac,ogg,m4a,aac";

/** Default tiny-file threshold in bytes (matches v1). */
export const DEFAULT_TINY_THRESHOLD_BYTES = 1024;

/** Largest number of Library records one scan reads (index page bound ×). */
export const MAX_SCAN_RECORDS = 50_000;

/** Largest number of directory listings one folder walk performs. */
export const MAX_FOLDER_LISTINGS = 5_000;

/** Parse a comma-separated allowed-formats string into a lowercased set. */
export function parseAllowedFormats(raw: string | undefined): Set<string> {
  const source = raw && raw.trim() ? raw : DEFAULT_ALLOWED_FORMATS;
  return new Set(
    source
      .split(",")
      .map((format) => format.trim().toLowerCase().replace(/^\./, ""))
      .filter((format) => format.length > 0),
  );
}

/** Lowercased extension of a filename without the leading dot. */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

/** The effective format for a record: declared format, else its extension. */
export function formatOf(record: JanitorRecord): string {
  const declared = (record.format ?? "").toLowerCase().replace(/^\./, "");
  return declared || extensionOf(record.filename);
}

/**
 * Normalize a path for cross-platform set membership: forward slashes,
 * no trailing separator, lowercased (case-insensitive filesystems).
 */
export function normalizePath(path: string): string {
  return path.replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * Issues derivable from Library index metadata alone (no disk read):
 * duplicates (same name + size), empty files (`broken`), tiny files,
 * and unusual formats. Deterministic order: per-record issues in record
 * order, then duplicate buckets in first-seen order.
 */
export function deriveIndexIssues(
  records: readonly JanitorRecord[],
  options: { tinyThresholdBytes: number; allowedFormats: Set<string> },
): JanitorIssue[] {
  const issues: JanitorIssue[] = [];
  const buckets = new Map<string, JanitorRecord[]>();
  const bucketOrder: string[] = [];
  for (const record of records) {
    const size = record.fileSize;
    if (size === 0) {
      issues.push({
        kind: "broken",
        path: record.path,
        fileIds: [record.id],
        message: "Audio file is empty.",
      });
    } else if (size !== null && size < options.tinyThresholdBytes) {
      issues.push({
        kind: "tiny-file",
        path: record.path,
        fileIds: [record.id],
        message: `File is smaller than ${options.tinyThresholdBytes} bytes.`,
      });
    }
    const format = formatOf(record);
    if (format && !options.allowedFormats.has(format)) {
      issues.push({
        kind: "weird-format",
        path: record.path,
        fileIds: [record.id],
        message: `Unusual audio format: ${format}.`,
      });
    }
    const key = `${record.filename.toLowerCase()}::${size ?? "?"}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(record);
    } else {
      buckets.set(key, [record]);
      bucketOrder.push(key);
    }
  }
  for (const key of bucketOrder) {
    const bucket = buckets.get(key)!;
    if (bucket.length > 1) {
      issues.push({
        kind: "duplicate",
        path: bucket[0]!.path,
        fileIds: bucket.map((record) => record.id),
        message: `${bucket.length} files share the same name and size.`,
      });
    }
  }
  return issues;
}

/** Flatten issues into the parallel-array result shape (schema-friendly). */
export function toReportArrays(issues: readonly JanitorIssue[]): {
  issueKinds: string[];
  issuePaths: string[];
  issueMessages: string[];
  issueFileIds: string[];
} {
  return {
    issueKinds: issues.map((issue) => issue.kind),
    issuePaths: issues.map((issue) => issue.path),
    issueMessages: issues.map((issue) => issue.message),
    issueFileIds: issues.map((issue) => issue.fileIds.join(",")),
  };
}
