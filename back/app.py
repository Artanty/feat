"""feat — runtime web-component library.

Serves per-feature bundles so that every version of every feature stays
accessible at all times:

    GET /<feature>/v<n>/          -> that version's index.js (canonical URL)
    GET /<feature>/v<n>/index.js  -> same, explicit form
    GET /<feature>/v<n>/<file>    -> any real file in the version dir
    GET /<feature>/latest         -> 302 to the newest v<n>/
    GET /manifest.json            -> {feature: {versions: [...], latest: n}}
    GET /healthz

Feature responses carry Access-Control-Allow-Origin: * — consumers are
deployed apps on other hosts, so the bundles must be cross-origin loadable.
"""

import re
from html import escape
from pathlib import Path

from flask import Flask, abort, jsonify, redirect, request, send_from_directory

FEATURES_DIR = Path(__file__).resolve().parent / "features"
VERSION_RE = re.compile(r"^v(\d+)$")
JS_MIMES = {".js": "text/javascript", ".mjs": "text/javascript", ".map": "application/json"}

app = Flask(__name__)


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
    if not re.fullmatch(r"[a-z0-9-]+", feature):
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


@app.get("/<feature>/v<int:n>/")
@app.get("/<feature>/v<int:n>/index.js")
def feature_entry(feature: str, n: int):
    directory = feature_dir(feature) / f"v{n}"
    if not (directory / "index.js").is_file():
        abort(404)
    request.versioned_feature = True
    return send_from_directory(directory, "index.js", mimetype="text/javascript")


@app.get("/<feature>/v<int:n>/<path:filename>")
def feature_file(feature: str, n: int, filename: str):
    directory = feature_dir(feature) / f"v{n}"
    if not directory.is_dir():
        abort(404)
    suffix = Path(filename).suffix
    mimetype = JS_MIMES.get(suffix)
    request.versioned_feature = True
    # send_from_directory rejects traversal ("../") on its own
    return send_from_directory(directory, filename, mimetype=mimetype)


@app.get("/<feature>/latest")
def feature_latest(feature: str):
    versions = versions_of(feature)
    if not versions:
        abort(404)
    return redirect(f"/{feature}/v{versions[-1]}/", code=302)


@app.get("/manifest.json")
def manifest():
    result = {}
    if FEATURES_DIR.is_dir():
        for d in FEATURES_DIR.iterdir():
            if d.is_dir():
                versions = versions_of(d.name)
                if versions:
                    result[d.name] = {
                        "versions": [f"v{n}" for n in versions],
                        "latest": f"v{versions[-1]}",
                    }
    return jsonify(result)


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
            cells = "".join(
                f'<tr><td><a href="/{escape(d.name)}/v{n}/">v{n}</a></td>'
                f'<td><code>&lt;script src="/{escape(d.name)}/v{n}/"&gt;&lt;/script&gt;</code></td></tr>'
                for n in versions
            )
            rows.append(
                f"<h2>{escape(d.name)}</h2>"
                f'<p>latest: <a href="/{escape(d.name)}/latest">/{escape(d.name)}/latest</a></p>'
                f"<table><tr><th>version</th><th>connect</th></tr>{cells}</table>"
            )
    body = "\n".join(rows) or "<p>No features published yet.</p>"
    return (
        "<!doctype html><html><head><meta charset='utf-8'><title>feat</title><style>"
        "body{font:14px/1.5 system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem}"
        "table{border-collapse:collapse;margin-bottom:1rem}td,th{border:1px solid #ccc;"
        "padding:4px 10px;text-align:left}code{background:#f4f4f4;padding:1px 4px;border-radius:3px}"
        "</style></head><body><h1>feat — web-component library</h1>"
        f"{body}"
        "<p><a href='/manifest.json'>manifest.json</a></p></body></html>"
    )


if __name__ == "__main__":
    app.run(debug=True)
# pipeline marker
