export function sanitizeFilename(value: string): string {
  const clean = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
  return /^\.+$/.test(clean) ? "-" : clean;
}
