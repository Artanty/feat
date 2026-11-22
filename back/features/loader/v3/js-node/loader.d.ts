/** Contract: back/spec/backend-slots.md (js-node namespace, v3: named slots).
 * FEAT_<ID>_SLOT=<slotName> is the required toggle; _MOUNT is an optional route-path
 * override (`true` = the feature's defaultMount). Features export kind route/middleware
 * (or legacy attach()). Not-vendored features resolve from the FEAT_URL feat host. */

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

export interface FeatLoader {
  /** Anchor middleware the HOST places in its chain; SLOT rows fill it at mount. */
  slot(name: string): (req: any, res: any, next: (err?: unknown) => void) => void;
  /** Resolve + register every SLOT-configured feature. Returns mounted ids. */
  mount(app: any, opts?: MountOptions): Promise<string[]>;
}

export declare function createFeatLoader(opts?: MountOptions): FeatLoader;

/** Simple hosts: mount route-slot + legacy features in one call (no anchors needed). */
export declare function mountBackendFeatures(app: any, opts?: MountOptions): Promise<string[]>;
