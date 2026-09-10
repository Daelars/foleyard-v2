// Explicit exports used by the isolated benchmark. No default database access.
export { ScanRunner } from "../../src/lib/scanner/scan-runner";
export { RealFileSystemSeam, streamAudioFileBatches } from "../../src/lib/scanner/filesystem";
export { extractMetadata } from "../../src/lib/metadata";
export { generateWaveform } from "../../src/lib/waveform-generator";
export { getWaveformPeaks, withGenerationSlot } from "../../src/lib/waveform-cache";
export { createDatabaseConnection } from "../../src/lib/database/connection";
export { SqliteAudioFileRepository } from "../../src/lib/database/file-repository";
