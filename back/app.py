"""feat — runtime feature library.

One concept only: a feature. A feature version may ship several
namespace implementations at once (ns is a free-form path part, e.g.
js-web, js-node, py — not a constant):

    GET /<feature>/v<n>/<ns>/       -> that namespace's entry (index.*)
    GET /<feature>/v<n>/<ns>/<file> -> any real file in the namespace dir
    GET /<feature>/latest/<ns>      -> 302 to newest v<n> containing <ns>
    GET /<feature>/latest           -> 302 to newest v<n> (single ns only)
    GET /manifest.json              -> {features: {name: {versions, latest}}}
    GET /                            -> index page: features / versions / ns
    GET /healthz

The deployed tree IS the enabled set; /manifest.json is its machine-readable
view for consumers that poll (toggle) instead of following /latest redirects.

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
DOCS_DIR = Path(__file__).resolve().parent / "docs"


def _read_app_version():
    # pyproject is the single source (auto-bumped by hooks on every commit)
    try:
        text = (Path(__file__).resolve().parent / "pyproject.toml").read_text()
        match = re.search(r'^version\s*=\s*"([^"]+)"', text, re.MULTILINE)
        if match:
            return match.group(1)
    except OSError:
        pass
    return "0.0.0"


APP_VERSION = _read_app_version()
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

# feat's own version badge on the docs + index pages, served by version-display.
# The host-page rule `deploy-info{position:static}` overrides the shadow :host
# fixed-positioning, so the badge flows inline in the top row instead of
# floating bottom-right.
VERSION_BADGE_CSS = "deploy-info{position:static;display:inline-block;vertical-align:middle}"
VERSION_BADGE = (
    "<script src='/version-display/latest/js-web'></script>"
    "<deploy-info src='/version.json' manifest='/manifest.json'></deploy-info>"
)


@app.get("/version.json")
def version_json():
    """feat's own deploy info — the src endpoint for the version badge."""
    return {"version": APP_VERSION, "project": "feat", "namespace": "back"}


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


def versions_of(feature: str) -> "list[int]":
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


def namespaces_of(version_dir: Path) -> "list[str]":
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


@app.get("/manifest.json")
def manifest():
    """Feature -> versions/latest, the toggle-discovery document.

    Consuming shells (e.g. deploy-info v3) poll this and hot-swap their render
    module when `latest` moves, so a feature release takes effect without the
    consumer being redeployed. No-cache (the after_request default) so every
    poll revalidates.
    """
    features = {}
    documented = set(docs_names())
    if FEATURES_DIR.is_dir():
        for d in sorted(FEATURES_DIR.iterdir()):
            if not d.is_dir():
                continue
            versions = versions_of(d.name)
            if not versions:
                continue
            entry = {
                "versions": [f"v{n}" for n in versions],
                "latest": f"v{versions[-1]}",
            }
            if d.name in documented:
                entry["docs"] = f"/docs/{d.name}"
            features[d.name] = entry
    return {"features": features}


def docs_names():
    """Feature names that have a docs page (docs/<feature>.md present)."""
    if not DOCS_DIR.is_dir():
        return []
    return sorted(
        p.stem for p in DOCS_DIR.iterdir()
        if p.is_file() and p.suffix == ".md" and PATH_SEGMENT_RE.fullmatch(p.stem)
    )


DOCS_PAGE = """<!doctype html><html><head><meta charset='utf-8'>
<title>feat docs — __NAME__</title>
<link id='sl-theme' rel='stylesheet'
  href='https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/themes/dark.css'>
<style>
  body { font: 14px/1.6 system-ui, sans-serif; max-width: 820px; margin: 2rem auto; padding: 0 1rem;
         background: #16161a; color: #ddd; }
  body.light { background: #fff; color: #222; }
  article { line-height: 1.6; }
  article h1, article h2 { border-bottom: 1px solid #444; padding-bottom: .2em; }
  body.light article h1, body.light article h2 { border-bottom-color: #ddd; }
  article table { border-collapse: collapse; }
  article td, article th { border: 1px solid #555; padding: 4px 10px; text-align: left; }
  body.light article td, body.light article th { border-color: #ccc; }
  article code { background: #26262c; padding: 1px 4px; border-radius: 3px; }
  body.light article code { background: #f4f4f4; }
  nav { margin-bottom: 1rem; }
  nav a { margin-right: 1rem; }
  __BADGE_CSS__
  nav button { font: inherit; background: none; border: 1px solid #666; color: inherit;
               border-radius: 6px; cursor: pointer; padding: 1px 8px; }
  body.light nav button { border-color: #bbb; }
</style>
</head><body>
<nav><a href="/">← feat</a> &middot; <a href="/docs">all docs</a>
  &middot; <button id='theme'></button> &middot; __BADGE__</nav>
<sl-alert variant='neutral' open><sl-icon slot='icon' name='info-circle'></sl-icon>
  <strong>__NAME__</strong> — rendered from <a href='__NAME__.md'>__NAME__.md</a> (source of truth)</sl-alert>
<article id='doc'>loading…</article>
<script type='module'
  src='https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/shoelace-autoloader.js'></script>
<script>
  (function () {
    var CDN = 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/themes/';
    var sl = document.getElementById('sl-theme');
    var btn = document.getElementById('theme');
    function apply(mode) {
      document.body.className = mode;              // 'dark' | 'light'
      sl.href = CDN + mode + '.css';
      btn.textContent = mode === 'light' ? 'dark mode' : 'light mode';
      try { localStorage.setItem('feat-docs-theme', mode); } catch (e) {}
    }
    var saved = null;
    try { saved = localStorage.getItem('feat-docs-theme'); } catch (e) {}
    apply(saved === 'light' ? 'light' : 'dark');   // dark is the default
    btn.onclick = function () {
      apply(document.body.className === 'light' ? 'dark' : 'light');
    };
  })();
</script>
<script src='https://cdn.jsdelivr.net/npm/marked@12/marked.min.js'></script>
<script>
  fetch('__NAME__.md').then(function (r) {
    if (!r.ok) throw new Error('docs fetch ' + r.status);
    return r.text();
  }).then(function (md) {
    document.getElementById('doc').innerHTML = marked.parse(md);
  }).catch(function (err) {
    document.getElementById('doc').textContent = 'failed to load docs: ' + err.message;
  });
</script>
</body></html>"""


@app.get("/docs")
def docs_index():
    items = "".join(
        f"<li><a href='/docs/{escape(name)}'>{escape(name)}</a> "
        f"(<a href='/docs/{escape(name)}.md'>raw .md</a>)</li>"
        for name in docs_names()
    )
    return (
        "<!doctype html><html><head><meta charset='utf-8'><title>feat docs</title><style>"
        "body{font:14px/1.5 system-ui,sans-serif;max-width:780px;margin:2rem auto;padding:0 1rem;"
        "background:#16161a;color:#ddd}"
        "body.light{background:#fff;color:#222}"
        "a{color:#7ab0ff}body.light a{color:#0b5fcc}"
        "button{font:inherit;background:none;border:1px solid #666;color:inherit;"
        "border-radius:6px;cursor:pointer;padding:1px 8px}"
        "body.light button{border-color:#bbb}"
        + VERSION_BADGE_CSS +
        "</style></head><body>"
        "<p style='margin:0 0 1rem'><button id='theme'></button> &middot; "
        + VERSION_BADGE + "</p>"
        "<h1>feat — docs</h1>"
        "<p>One page per feature: how it works, envs, inputs, outputs/triggers, "
        "lifecycle slot, consumers, versions.</p>"
        f"<ul>{items or '<li>no docs yet</li>'}</ul>"
        "<p><a href='/'>← feature library</a></p>"
        "<script>"
        "(function () {"
        "  var btn = document.getElementById('theme');"
        "  function apply(mode) {"
        "    document.body.className = mode;"
        "    btn.textContent = mode === 'light' ? 'dark mode' : 'light mode';"
        "    try { localStorage.setItem('feat-docs-theme', mode); } catch (e) {}"
        "  }"
        "  var saved = null;"
        "  try { saved = localStorage.getItem('feat-docs-theme'); } catch (e) {}"
        "  apply(saved === 'light' ? 'light' : 'dark');"
        "  btn.onclick = function () {"
        "    apply(document.body.className === 'light' ? 'dark' : 'light');"
        "  };"
        "})();"
        "</script></body></html>"
    )


@app.get("/docs/<feature>.md")
def docs_raw(feature: str):
    if not PATH_SEGMENT_RE.fullmatch(feature) or feature not in docs_names():
        abort(404)
    # no-cache comes from the after_request default — docs are editable anytime
    return send_from_directory(DOCS_DIR, f"{feature}.md", mimetype="text/markdown")


@app.get("/docs/<feature>")
def docs_page(feature: str):
    if not PATH_SEGMENT_RE.fullmatch(feature) or feature not in docs_names():
        abort(404)
    return (
        DOCS_PAGE
        .replace("__NAME__", feature)
        .replace("__BADGE_CSS__", VERSION_BADGE_CSS)
        .replace("__BADGE__", VERSION_BADGE)
    )


@app.get("/healthz")
def healthz():
    return "ok"


@app.get("/")
def index():
    rows = []
    documented = set(docs_names())
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
            docs_link = (
                f" &middot; <a href='/docs/{escape(d.name)}'>docs</a>"
                if d.name in documented
                else ""
            )
            rows.append(
                f"<h2>{escape(d.name)}</h2>"
                f"<p>latest: {' &middot; '.join(latest_ns)}{docs_link}</p>"
                "<table><tr><th>version</th><th>namespace</th><th>url</th>"
                f"<th>connect</th></tr>{''.join(cells)}</table>"
            )
    body = "\n".join(rows) or "<p>No features published yet.</p>"
    return (
        "<!doctype html><html><head><meta charset='utf-8'><title>feat</title><style>"
        "body{font:14px/1.5 system-ui,sans-serif;max-width:780px;margin:2rem auto;padding:0 1rem}"
        "table{border-collapse:collapse;margin-bottom:1rem}td,th{border:1px solid #ccc;"
        "padding:4px 10px;text-align:left}code{background:#f4f4f4;padding:1px 4px;border-radius:3px}"
        + VERSION_BADGE_CSS +
        "</style></head><body>"
        "<p style='margin:0 0 1rem'>" + VERSION_BADGE + "</p>"
        "<h1>feat — feature library</h1>"
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
    app.run(debug=True, port=5477)
# pipeline marker
# npm-copy check
