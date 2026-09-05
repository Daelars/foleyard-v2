import type { FileTableDirectory } from "@/components/FileTable/types";

/** Last path segment across windows and posix separators. */
export function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** Descriptor for the library root, keeping the rest of the entry intact. */
export function navigateToRoot(
  current: FileTableDirectory,
): FileTableDirectory {
  return {
    ...current,
    key: JSON.stringify([current.libraryRoot, null]),
    label: basename(current.libraryRoot),
    directory: null,
    absolutePath: current.libraryRoot,
    isRoot: true,
  };
}

/** Descriptor for one breadcrumb segment of the current directory. */
export function navigateToSegment(
  current: FileTableDirectory,
  parts: string[],
  index: number,
): FileTableDirectory {
  const directory = parts.slice(0, index + 1).join("/");
  return {
    ...current,
    key: JSON.stringify([current.libraryRoot, directory]),
    label: parts[index],
    directory,
    absolutePath: `${current.libraryRoot}/${directory}`,
    isRoot: false,
  };
}

/**
 * Parent of the current entry. Returns null when backing out leaves the
 * directory tree entirely so the caller navigates to the library instead.
 */
export function navigateToParent(
  current: FileTableDirectory,
): FileTableDirectory | null {
  if (current.directory === null) {
    return null;
  }
  const parts = current.directory.split(/[\\/]/);
  parts.pop();
  const parent = parts.length > 0 ? parts.join("/") : null;
  if (!parent && !current.showRoot) {
    return null;
  }
  if (parent) {
    return {
      ...current,
      key: JSON.stringify([current.libraryRoot, parent]),
      label: parent.split("/").pop() || basename(current.libraryRoot),
      directory: parent,
      absolutePath: `${current.libraryRoot}/${parent}`,
      isRoot: false,
    };
  }
  return navigateToRoot(current);
}

/** Subtitle for a directory row: the root path for roots, Folder otherwise. */
export function getDirectorySubtitle(dir: FileTableDirectory): string {
  return dir.isRoot ? dir.libraryRoot : "Folder";
}
