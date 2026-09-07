export function sanitizeFilename(value: string): string {
  const clean = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
  return /^\.+$/.test(clean) ? "-" : clean;
}

/**
 * Mint a collision-safe output name in the established `name 2.ext` style.
 * `planned` accumulates names already handed out this run (compared
 * case-insensitively); `existsOnDisk` covers files the run did not create.
 * Suffixes until free, so a run can never silently overwrite an existing file.
 */
export function makeUniqueFilename(
  planned: Set<string>,
  existsOnDisk: (name: string) => boolean,
  base: string,
): string {
  const dotIndex = base.lastIndexOf(".");
  const stem = dotIndex > 0 ? base.slice(0, dotIndex) : base;
  const ext = dotIndex > 0 ? base.slice(dotIndex) : "";
  const taken = (name: string) =>
    planned.has(name.toLowerCase()) || existsOnDisk(name);
  let candidate = base;
  let counter = 2;
  while (taken(candidate)) {
    candidate = `${stem} ${counter}${ext}`;
    counter += 1;
  }
  planned.add(candidate.toLowerCase());
  return candidate;
}
