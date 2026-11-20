// VENDORED from feat back/features/get-updates/v1/js-node/get-updates.d.ts — do not edit here.
// Contract: back/spec/get-updates.md (feat repo).
export interface GetupdInfo {
  version: string | null;
  framework: string;
  commit_id: string | null;
  commit_message: string | null;
  project_id: string | null;
  slave_repo: string | null;
  namespace: string | null;
  packages: Record<string, string>;
  features: string[];
  envs: Record<string, true>;
}

export interface GetupdOptions {
  env?: Record<string, string | undefined>;
  cwd?: string;
}

export declare function envPresence(env: Record<string, string | undefined>): Record<string, true>;
export declare function mountedFeatures(env: Record<string, string | undefined>): string[];
export declare function readPackages(cwd: string): Record<string, string>;
export declare function collectInfo(opts?: GetupdOptions): GetupdInfo;
export declare function createGetUpdatesHandler(opts?: GetupdOptions): (req: unknown, res: unknown) => void;
export declare function attachGetUpdates(app: unknown, opts?: GetupdOptions & { prefix?: string }): unknown;
export declare function attach(app: unknown, settings?: { mount?: string } & Record<string, string>): unknown;
