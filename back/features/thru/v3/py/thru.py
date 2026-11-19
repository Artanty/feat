"""thru feature v3 — request pass-through for backend servers (python/Flask).

Contract: back/docs/thru.md. Consumers VENDOR this file and register the blueprint:

    from thru import thru_bp
    app.register_blueprint(thru_bp)          # serves GET|POST|OPTIONS /thru

A backend hosting thru lets other apps (typically a browser frontend that cannot reach
some origin directly — e.g. the user's network blocks the target host) make that request
through the backend instead: the backend's network does the fetch and mirrors the
upstream response back. Origin: noy/back's make-request; generalized here as a feat
feature so ANY backend can host it (python first).

v2 delta: CORS PREFLIGHT support — an explicit OPTIONS /thru route plus
Access-Control-Allow-Methods/Allow-Headers on every response. A cross-origin POST with
Content-Type: application/json (how browsers pass targetHeaders/targetBody) is
preflighted; v1 answered OPTIONS only via Flask's automatic OPTIONS, which omits
Allow-Headers, so the browser killed the preflight and the POST never flew (GET-only
consumers like stat never noticed).

Route (GET or POST /thru), query params (POST may instead carry them as a JSON object
body with keys target/targetMethod/targetBody/targetHeaders/targetTimeoutS; query params
override body fields):
    target    (required) absolute http(s) URL to hit
    method    get|post|put|patch|delete (default: get)
    body      url-encoded JSON body for non-get methods
    headers   url-encoded JSON object of extra upstream headers (e.g. Authorization)
    timeout_s overall budget, default 30

Response mirrors the upstream request: same status, content-type and body, plus
`X-Thru-Elapsed-Ms`. v3.1: the same handler also serves `/thru/<label>` (GET|POST|OPTIONS)
— the label is display-only and ignored; it exists so browser network consoles show
distinct names (convention: `thru-` + last path segment of the target URL).
Envs (read at call time): THRU_ALLOWED_HOSTS (comma-separated
hostname allowlist; unset = any host), THRU_DISABLED=true (503).

Stdlib only (urllib) — no consumer dependencies. SSRF guard: http/https schemes only
plus the optional allowlist; the feature is public by design (like noy's proxy), so
consumers behind an admin boundary should set the allowlist.
"""
import json
import os
import time
import urllib.error
import urllib.request

from flask import Blueprint, Response, request

ALLOWED_METHODS = ("get", "post", "put", "patch", "delete")
DEFAULT_TIMEOUT_S = 30


def _allowed(target_host: str) -> bool:
    allow = os.environ.get("THRU_ALLOWED_HOSTS", "").strip()
    if not allow:
        return True
    return target_host in {h.strip().lower() for h in allow.split(",") if h.strip()}


# headers that must never be caller-supplied — they describe the transport, not the
# upstream request, and urllib manages them itself
_HOP_HEADERS = {"connection", "content-length", "transfer-encoding", "host", "accept-encoding"}


def _fetch(url, method, body, extra_headers, timeout_s):
    """Perform the upstream request. Standalone so tests can mock it.

    extra_headers: caller-supplied headers (the `headers` query param), merged over the
    defaults. Returns (status, content_type, body_bytes). Raises urllib.error.URLError on
    connect/timeout failures (surfaced as 502 with the reason in X-Thru-Error).
    """
    data = None
    headers = {"user-agent": "feat-thru/3"}
    headers.update({str(k).lower(): str(v) for k, v in (extra_headers or {}).items()
                    if str(k).lower() not in _HOP_HEADERS})
    # v3: the body is attached ALWAYS — v2 skipped it when the caller supplied a
    # content-type, silently dropping every such POST body (live chat@web bug)
    if body and method != "get":
        data = body.encode("utf-8")
        headers.setdefault("content-type", "application/json")
    req = urllib.request.Request(url, data=data, method=method.upper(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return resp.status, resp.headers.get("content-type", "application/octet-stream"), resp.read()
    except urllib.error.HTTPError as e:
        # an HTTP error IS a response — mirror it, only connect-level errors raise
        return e.code, e.headers.get("content-type", "application/octet-stream"), e.read()


thru_bp = Blueprint("thru", __name__)


# provide_automatic_options=False: Flask's automatic OPTIONS would otherwise shadow the
# explicit preflight route below (same URL, and the automatic handler wins the match)
@thru_bp.route("/thru", methods=["GET", "POST"], provide_automatic_options=False)
def thru():
    if os.environ.get("THRU_DISABLED", "").strip().lower() == "true":
        return Response(json.dumps({"request": "error", "error": "thru disabled"}), status=503,
                        content_type="application/json")

    # POST /thru may carry target/targetMethod/targetBody/targetHeaders/targetTimeoutS
    # as a JSON object body; query params override body fields, so both forms compose
    # and GET stays as-is
    params = {}
    if request.method == "POST":
        params = request.get_json(silent=True)
        if params is None:
            params = {}
        elif not isinstance(params, dict):
            return Response(json.dumps({"request": "error", "error": "json body must be an object"}), status=400,
                            content_type="application/json")

    target = (request.args.get("target") or str(params.get("target") or "")).strip()
    method = (request.args.get("method") or str(params.get("targetMethod") or "get")).strip().lower()

    body = request.args.get("body")
    if body is None and "targetBody" in params:
        body = params["targetBody"] if isinstance(params["targetBody"], str) else json.dumps(params["targetBody"])
    body = body or ""

    extra_headers = {}
    if "targetHeaders" in params and request.args.get("headers") is None:
        extra_headers = params["targetHeaders"]
        if not isinstance(extra_headers, dict):
            return Response(json.dumps({"request": "error", "error": "targetHeaders must be a JSON object"}), status=400,
                            content_type="application/json")
    else:
        raw_headers = (request.args.get("headers") or "").strip()
        if raw_headers:
            try:
                extra_headers = json.loads(raw_headers)
            except ValueError:
                extra_headers = None
            if not isinstance(extra_headers, dict):
                return Response(json.dumps({"request": "error", "error": "headers must be a JSON object"}), status=400,
                                content_type="application/json")
    try:
        timeout_s = int(request.args.get("timeout_s") or params.get("targetTimeoutS") or DEFAULT_TIMEOUT_S)
    except ValueError:
        timeout_s = DEFAULT_TIMEOUT_S

    if not target:
        return Response(json.dumps({"request": "error", "error": "missing target"}), status=400,
                        content_type="application/json")
    if not target.lower().startswith(("http://", "https://")):
        return Response(json.dumps({"request": "error", "error": "target must be http(s)"}), status=400,
                        content_type="application/json")
    if method not in ALLOWED_METHODS:
        return Response(json.dumps({"request": "error", "error": f"method must be {'|'.join(ALLOWED_METHODS)}"}),
                        status=400,
                        content_type="application/json")

    from urllib.parse import urlsplit
    host = urlsplit(target).hostname or ""
    if not _allowed(host.lower()):
        return Response(json.dumps({"request": "error", "error": f"host not allowed: {host}"}), status=403,
                        content_type="application/json")

    started = time.monotonic()
    try:
        status, content_type, payload = _fetch(target, method, body, extra_headers, timeout_s)
    except Exception as e:  # connect/timeout/TLS — no upstream response to mirror
        resp = Response(json.dumps({"request": "error", "error": str(e), "target": target}), status=502,
                        content_type="application/json")
        resp.headers["X-Thru-Elapsed-Ms"] = str(int((time.monotonic() - started) * 1000))
        resp.headers["X-Thru-Error"] = type(e).__name__
        return resp

    resp = Response(payload, status=status, content_type=content_type)
    resp.headers["X-Thru-Elapsed-Ms"] = str(int((time.monotonic() - started) * 1000))
    return resp


# v3.1: DISPLAY-ONLY path label. /thru/<label> runs the same handler as /thru — the
# label is ignored entirely (target/method/headers/body still come from query params or
# POST body). It exists so browser network consoles show distinct request names
# (e.g. /thru/thru-get-items) instead of a wall of identical /thru entries. Convention:
# "thru-" + last path segment of the target URL (no host part — user's choice).
@thru_bp.route("/thru/<label>", methods=["GET", "POST"], provide_automatic_options=False)
def thru_labeled(label):
    return thru()


@thru_bp.route("/thru", methods=["OPTIONS"])
def thru_preflight():
    """Explicit CORS preflight (v2): echo the browser's requested headers back.
    Flask's automatic OPTIONS omits Access-Control-Allow-Headers, which kills any
    preflighted POST — the whole reason v2 exists."""
    resp = Response()
    requested = request.headers.get("Access-Control-Request-Headers", "").strip()
    resp.headers["Access-Control-Allow-Headers"] = requested or "Content-Type"
    resp.headers["Access-Control-Max-Age"] = "600"
    return resp


@thru_bp.route("/thru/<label>", methods=["OPTIONS"])
def thru_labeled_preflight(label):
    # same preflight, one path deeper — a prefighted POST to /thru/<label> needs it
    return thru_preflight()


@thru_bp.after_request
def _cors(resp: Response) -> Response:
    # browser consumers are the point — the target origin is often unreachable from
    # the page's network, so the thru host must be readable cross-origin. v2 adds
    # methods/allow-headers so preflighted POSTs (JSON bodies with targetHeaders)
    # pass alongside preflight-free GETs.
    resp.headers.setdefault("Access-Control-Allow-Origin", "*")
    resp.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    resp.headers.setdefault("Access-Control-Allow-Headers", "Content-Type")
    return resp
