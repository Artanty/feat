/** Contract: back/spec/backend-slots.md (js-node namespace, v2: underscore IDs map to
 * hyphenated feature dirs — FEAT_GET_UPDATES_MOUNT → features/get-updates/). */
export interface MountOptions {
  /** override process.env (tests) */
  env?: Record<string, string | undefined>;
  /** override the feature-dir root (tests); default = dir of the loader file */
  vendoredDir?: string;
}

/** Mount vendored backend features per FEAT_<ID>_MOUNT env rows. Returns mounted ids. */
export function mountBackendFeatures(app: any, opts?: MountOptions): Promise<string[]>;
