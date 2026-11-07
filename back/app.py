"""feat — runtime feature library.

One concept only: a feature. A feature version may ship several
namespace implementations at once (ns is a free-form path part, e.g.
js-web, js-node, py — not a constant):

    GET /<feature>/v<n>/<ns>/       -> that namespace's entry (index.*)
    GET /<feature>/v<n>/<ns>/<file> -> any real file in the namespace dir
    GET /<feature>/latest/<ns>      -> 302 to newest v<n> containing <ns>
    GET /<feature>/latest           -> 302 to newest v<n> (single ns only)
    GET /                            -> index page: features / versions / ns
    GET /healthz

No manifest: the deployed tree IS the enabled set (toggle happens on
deploy, and each consuming project keeps its own list of what it loads).
Consumers discover versions by following /latest/<ns> redirects.

Versioned URLs are immutable (cached 1y); /latest and / are no-cache so
flips propagate on the next request. Feature responses carry
Access-Control-Allow-Origin: * — consumers are deployed apps on other
hosts, so bundles must be cross-origin loadable.
"""

import logging
import re
import sys
from html import escape
from pathlib import Path

from flask import Flask, abort, redirect, request, send_from_directory

# stderr → Passenger/panel log (or console when run directly);
# index.wsgi configures the root logger, this covers plain `python app.py` too
if not logging.getLogger().handlers:
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format="[feat] %(asctime)s %(levelname)s %(message)s",
    )
log = logging.getLogger("feat")

FEATURES_DIR = Path(__file__).resolve().parent / "features"
VERSION_RE = re.compile(r"^v(\d+)$")
# namespace is intentionally not a constant list — only path safety matters
PATH_SEGMENT_RE = re.compile(r"[a-z0-9][a-z0-9-]*")
JS_MIMES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".map": "application/json",
    ".py": "text/x-python",
}

app = Flask(__name__)


@app.after_request
def log_request(response):
    # one line per request → Passenger/panel log; visible proof the app executed
    log.info("%s %s -> %s", request.method, request.path, response.status_code)
    return response


@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    # Versioned URLs never change content by contract -> cache hard; /latest and the
    # manifest must always be revalidated so consumers pick up flips immediately.
    if getattr(request, "versioned_feature", False):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    else:
        response.headers["Cache-Control"] = "no-cache"
    return response


def feature_dir(feature: str) -> Path:
    if not PATH_SEGMENT_RE.fullmatch(feature):
        abort(404)
    path = FEATURES_DIR / feature
    if not path.is_dir():
        abort(404)
    return path


def versions_of(feature: str) -> list[int]:
    return sorted(
        int(VERSION_RE.match(d.name).group(1))
        for d in feature_dir(feature).iterdir()
        if d.is_dir() and VERSION_RE.match(d.name)
    )


def ns_dir(feature: str, n: int, ns: str) -> Path:
    if not PATH_SEGMENT_RE.fullmatch(ns):
        abort(404)
    directory = feature_dir(feature) / f"v{n}" / ns
    if not directory.is_dir():
        abort(404)
    return directory


def entry_file(directory: Path) -> Path:
    """The namespace's entry: exactly one file named index.* (ambiguity -> 500)."""
    entries = [p for p in directory.iterdir() if p.is_file() and p.name.startswith("index.")]
    if not entries:
        abort(404)
    if len(entries) > 1:
        abort(500, description=f"multiple index.* entries in {directory}")
    return entries[0]


def namespaces_of(version_dir: Path) -> list[str]:
    return sorted(
        d.name for d in version_dir.iterdir()
        if d.is_dir() and PATH_SEGMENT_RE.fullmatch(d.name)
    )


@app.get("/<feature>/v<int:n>/<ns>/")
def feature_entry(feature: str, n: int, ns: str):
    directory = ns_dir(feature, n, ns)
    entry = entry_file(directory)
    request.versioned_feature = True
    return send_from_directory(
        directory, entry.name, mimetype=JS_MIMES.get(entry.suffix)
    )


@app.get("/<feature>/v<int:n>/<ns>/<path:filename>")
def feature_file(feature: str, n: int, ns: str, filename: str):
    directory = ns_dir(feature, n, ns)
    request.versioned_feature = True
    # send_from_directory rejects traversal ("../") on its own
    return send_from_directory(
        directory, filename, mimetype=JS_MIMES.get(Path(filename).suffix)
    )


@app.get("/<feature>/latest/<ns>")
def feature_latest_ns(feature: str, ns: str):
    if not PATH_SEGMENT_RE.fullmatch(ns):
        abort(404)
    # newest version that actually ships this namespace
    for n in reversed(versions_of(feature)):
        if (feature_dir(feature) / f"v{n}" / ns).is_dir():
            return redirect(f"/{feature}/v{n}/{ns}/", code=302)
    abort(404)


@app.get("/<feature>/latest")
def feature_latest(feature: str):
    versions = versions_of(feature)
    if not versions:
        abort(404)
    ns_list = namespaces_of(feature_dir(feature) / f"v{versions[-1]}")
    if len(ns_list) != 1:
        abort(
            404,
            description="latest is ambiguous — use /<feature>/latest/<ns>",
        )
    return redirect(f"/{feature}/v{versions[-1]}/{ns_list[0]}/", code=302)


@app.get("/healthz")
def healthz():
    return "ok"


@app.get("/")
def index():
    rows = []
    if FEATURES_DIR.is_dir():
        for d in sorted(FEATURES_DIR.iterdir()):
            if not d.is_dir():
                continue
            versions = versions_of(d.name)
            if not versions:
                continue
            cells = []
            for n in versions:
                for ns in namespaces_of(FEATURES_DIR / d.name / f"v{n}"):
                    path = f"/{d.name}/v{n}/{ns}/"
                    entry = (
                        f'<code>&lt;script src="{escape(path)}"&gt;&lt;/script&gt;</code>'
                        if ns.startswith("js")
                        else f'<code>GET {escape(path)}</code>'
                    )
                    cells.append(
                        f"<tr><td>v{n}</td><td>{escape(ns)}</td>"
                        f"<td><a href='{escape(path)}'>{escape(path)}</a></td>"
                        f"<td>{entry}</td></tr>"
                    )
            latest_ns = [
                f'<a href="/{escape(d.name)}/latest/{escape(ns)}">latest/{escape(ns)}</a>'
                for ns in namespaces_of(FEATURES_DIR / d.name / f"v{versions[-1]}")
            ]
            rows.append(
                f"<h2>{escape(d.name)}</h2>"
                f"<p>latest: {' &middot; '.join(latest_ns)}</p>"
                "<table><tr><th>version</th><th>namespace</th><th>url</th>"
                f"<th>connect</th></tr>{''.join(cells)}</table>"
            )
    body = "\n".join(rows) or "<p>No features published yet.</p>"
    return (
        "<!doctype html><html><head><meta charset='utf-8'><title>feat</title><style>"
        "body{font:14px/1.5 system-ui,sans-serif;max-width:780px;margin:2rem auto;padding:0 1rem}"
        "table{border-collapse:collapse;margin-bottom:1rem}td,th{border:1px solid #ccc;"
        "padding:4px 10px;text-align:left}code{background:#f4f4f4;padding:1px 4px;border-radius:3px}"
        "</style></head><body><h1>feat — feature library</h1>"
        f"{body}"
        "</body></html>"
    )


if __name__ == "__main__":
    features = (
        sorted(d.name for d in FEATURES_DIR.iterdir() if d.is_dir())
        if FEATURES_DIR.is_dir()
        else []
    )
    log.info("starting dev server — features_dir=%s features=%s", FEATURES_DIR, features or "NONE")
    app.run(debug=True)
# pipeline marker
# npm-copy check
