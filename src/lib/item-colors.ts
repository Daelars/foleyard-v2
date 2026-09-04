export const ITEM_COLOR_PRESETS = [
  "#f0503c",
  "#e8c468",
  "#9adc6e",
  "#5ad1e6",
  "#7ab8ff",
  "#d3a6ff",
  "#ff8ab5",
  "#a3a3a3",
];

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function fallbackItemColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return ITEM_COLOR_PRESETS[Math.abs(hash) % ITEM_COLOR_PRESETS.length];
}

export function resolveItemColor(
  name: string,
  color: string | null | undefined,
): string {
  return isHexColor(color) ? color : fallbackItemColor(name);
}
