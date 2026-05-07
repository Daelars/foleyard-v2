export interface AudioMetadata {
  filename: string;
  format: string | null;
  duration: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  fileSize: number | null;
}

export interface MetadataService {
  extractMetadata(filePath: string): Promise<AudioMetadata>;
}
