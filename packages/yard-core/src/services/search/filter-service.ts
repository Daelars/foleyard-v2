export function normalizeDirectoryPath(directory: string) {
  return directory.replace(/\\/g, "/");
}

export function matchesDirectory(candidate: string | null, directory: string) {
  if (!candidate) {
    return false;
  }

  const normalizedDirectory = normalizeDirectoryPath(directory);
  return normalizeDirectoryPath(candidate) === normalizedDirectory;
}
