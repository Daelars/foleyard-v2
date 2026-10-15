import { isHexColor } from "@/lib/item-colors";

import { ApiError } from "./errors";

/**
 * Validate the optional `color` field of a create request. `undefined` means
 * "no colour supplied" and lets the surface fall back to a derived colour; a
 * `#rrggbb` string is returned as-is; anything else is rejected before the row
 * is written, so an invalid colour can never leave a partial create behind.
 */
export function parseOptionalColor(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string" && isHexColor(value)) {
    return value;
  }
  throw new ApiError("color must be a #rrggbb hex string", 400);
}
