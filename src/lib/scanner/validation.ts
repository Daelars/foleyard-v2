import path from "path";

import type { PathValidation } from "@yard-core";

import { existsReadableDirectory, findFirstAudioFile } from "./filesystem";

export async function validateLibraryRoot(inputPath: string): Promise<PathValidation> {
  const normalizedPath = path.resolve(inputPath.trim());

  try {
    await existsReadableDirectory(normalizedPath);
    const firstAudioFile = await findFirstAudioFile(normalizedPath);

    return {
      valid: true,
      normalizedPath,
      readable: true,
      audioFileCount: firstAudioFile ? 1 : 0,
      samples: firstAudioFile ? [path.relative(normalizedPath, firstAudioFile)] : [],
      error: null,
    };
  } catch (error) {
    return {
      valid: false,
      normalizedPath,
      readable: false,
      audioFileCount: 0,
      samples: [],
      error: error instanceof Error ? error.message : "Validation failed",
    };
  }
}
