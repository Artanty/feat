/** Contract: back/spec/backend-slots.md (js-node namespace, v2: underscore IDs map to
 * hyphenated feature dirs — FEAT_GET_UPDATES_MOUNT → features/get-updates/; not-vendored
 * features are fetched from the FEAT_URL feat host and imported via data: URL). */
export interface MountOptions {
  /** override process.env (tests) */
  env?: Record<string, string | undefined>;
  /** override the feature-dir root (tests); default = dir of the loader file */
  vendoredDir?: string;
  /** override the feat host base URL (default: env FEAT_URL) for remote resolution */
  featUrl?: string;
  /** inject fetch for tests (default: global fetch) */
  fetchImpl?: typeof fetch;
}

/** Mount vendored backend features per FEAT_<ID>_MOUNT env rows. Returns mounted ids. */
export function mountBackendFeatures(app: any, opts?: MountOptions): Promise<string[]>;
