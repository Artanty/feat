/** Contract: back/spec/req.md (js-node namespace, v1). */
export interface OutboundRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  timeoutS: number;
}

export function buildRequest(recipeEnv: Record<string, string | undefined>, recipe: string, params: Record<string, unknown>): OutboundRequest;
export function mergeParams(body: unknown, query: unknown): Record<string, unknown>;

export interface ReqHandlerOptions {
  /** override process.env (tests) */
  env?: Record<string, string | undefined>;
  /** override global fetch (tests/consumers) */
  fetchImpl?: (url: string, init: any) => Promise<Response>;
}

export function createReqHandler(opts?: ReqHandlerOptions): (req: any, res: any) => void;

export interface AttachOptions extends ReqHandlerOptions {
  /** route prefix, default '/req' */
  prefix?: string;
}

/** Register GET|POST <prefix>/:name on the consumer's Express app. */
export function attachReq(app: any, opts?: AttachOptions): (req: any, res: any) => void;

/** Standard backend-feature entry (back/spec/backend-slots.md): mount path from settings. */
export function attach(app: any, settings?: Record<string, any>): (req: any, res: any) => void;
