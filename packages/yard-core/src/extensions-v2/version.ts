/**
 * Extension v2 API version and compatibility rules.
 *
 * Four version kinds stay separate; conflating them caused silent
 * incompatibility in earlier designs, so each is named explicitly:
 *
 * - Extension API version (`apiVersion` on a v2 definition): the bundled
 *   v2 authoring contract this package targets. Current value is
 *   {@link V2_EXTENSION_API_VERSION}. Only versions listed in
 *   {@link SUPPORTED_V2_API_VERSIONS} register; anything else (including
 *   the v1 contract version `1`) is rejected with an actionable
 *   diagnostic. Standing is internal and bundled-only: no marketplace,
 *   no external code loader, no public stability promise.
 * - Extension package version (`version` on a definition): the author's
 *   own `major.minor.patch` release of one extension package. It never
 *   grants compatibility on its own; the host checks `apiVersion`.
 * - Product version: the Foleyard application release (root
 *   `package.json`, e.g. `0.1.8`). Used by documentation staging and
 *   release notes, never by extension registration.
 * - Runtime schema version: the versioned DTO shape reported by runtime
 *   introspection (`schemaVersion` in `src/lib/runtime-info.ts`,
 *   currently `1`). Used by diagnostics consumers, never by extension
 *   registration.
 *
 * Compatibility rules:
 *
 * 1. A definition registers only when `apiVersion` is supported.
 * 2. A definition built for a newer unsupported `apiVersion` is rejected,
 *    never partially honored.
 * 3. Extension package versions do not imply API compatibility in either
 *    direction; bumping `version` without changing `apiVersion` changes
 *    nothing about host support.
 * 4. Product releases may add supported API versions; dropping one
 *    requires a migration plan, not a silent rejection change.
 */

/** Current extension v2 API contract version. */
export const V2_EXTENSION_API_VERSION = 2;

/** Standing of the v2 contract: internal and bundled-only. */
export const V2_EXTENSION_API_STANDING = "internal" as const;

/** API versions the v2 registry accepts. */
export const SUPPORTED_V2_API_VERSIONS = [2] as const;

export type SupportedV2ApiVersion = (typeof SUPPORTED_V2_API_VERSIONS)[number];

/** True when the registry accepts definitions targeting `version`. */
export function isSupportedV2ApiVersion(
  version: unknown,
): version is SupportedV2ApiVersion {
  return (
    typeof version === "number" &&
    (SUPPORTED_V2_API_VERSIONS as readonly number[]).includes(version)
  );
}
