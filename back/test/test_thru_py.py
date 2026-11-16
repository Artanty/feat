# Contract tests for the thru feature's PYTHON build (back/docs/thru.md).
# Run: cd back && .venv/bin/pytest test/test_thru_py.py   (from the feat repo root)
import importlib.util
import json
import sys
from pathlib import Path

import pytest

# load the SHIPPED features copy by path (dir name "thru/v1/py" is importable but
# stays standalone; loading by path pins what consumers vendor)
_spec = importlib.util.spec_from_file_location(
    "thru", Path(__file__).resolve().parent.parent / "features" / "thru" / "v1" / "py" / "thru.py"
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["thru"] = _mod
_spec.loader.exec_module(_mod)

from flask import Flask  # noqa: E402


@pytest.fixture()
def client():
    app = Flask(__name__)
    app.register_blueprint(_mod.thru_bp)
    app.testing = True
    return app.test_client()


def fake_fetch(monkeypatch, status=200, content_type="application/json", body=b'{"ok": true}'):
    calls = []
    # default-arg binding: the lambda's own `body` param (the request's body) must not
    # shadow the fake's `body` closure variable
    monkeypatch.setattr(
        _mod, "_fetch",
        lambda url, method, body, timeout_s, _s=status, _ct=content_type, _b=body:
        calls.append({"url": url, "method": method, "body": body, "timeout_s": timeout_s})
        or (_s, _ct, _b),
    )
    return calls


def test_happy_path_mirrors_upstream(client, monkeypatch):
    calls = fake_fetch(monkeypatch, status=200, content_type="application/json", body=b'{"a": 1}')
    resp = client.get("/thru?target=https://example.com/api/x")
    assert resp.status_code == 200
    assert resp.content_type.startswith("application/json")
    assert resp.data == b'{"a": 1}'
    assert resp.headers["Access-Control-Allow-Origin"] == "*"
    assert "X-Thru-Elapsed-Ms" in resp.headers
    assert calls == [{"url": "https://example.com/api/x", "method": "get", "body": "", "timeout_s": 30}]


def test_method_and_body_passthrough(client, monkeypatch):
    calls = fake_fetch(monkeypatch)
    resp = client.get("/thru?target=https://example.com/api/x&method=post&body=" + json.dumps({"k": "v"}))
    assert resp.status_code == 200
    assert calls[0]["method"] == "post"
    assert json.loads(calls[0]["body"]) == {"k": "v"}


def test_upstream_http_error_is_mirrored_not_502(client, monkeypatch):
    fake_fetch(monkeypatch, status=404, content_type="text/plain", body=b"nope")
    resp = client.get("/thru?target=https://example.com/missing")
    assert resp.status_code == 404
    assert resp.data == b"nope"


def test_connect_failure_is_502_envelope(client, monkeypatch):
    def boom(url, method, body, timeout_s):
        raise OSError("timed out")
    monkeypatch.setattr(_mod, "_fetch", boom)
    resp = client.get("/thru?target=https://down.example.com/")
    assert resp.status_code == 502
    payload = json.loads(resp.data)
    assert payload["request"] == "error"
    assert resp.headers["X-Thru-Error"] == "OSError"


def test_missing_target_is_400(client):
    resp = client.get("/thru")
    assert resp.status_code == 400
    assert json.loads(resp.data)["error"] == "missing target"


def test_non_http_scheme_rejected(client):
    resp = client.get("/thru?target=file:///etc/passwd")
    assert resp.status_code == 400


def test_bad_method_rejected(client):
    resp = client.get("/thru?target=https://example.com/&method=head")
    assert resp.status_code == 400


def test_allowlist(client, monkeypatch):
    fake_fetch(monkeypatch)
    monkeypatch.setenv("THRU_ALLOWED_HOSTS", "api.example.com")
    assert client.get("/thru?target=https://api.example.com/x").status_code == 200
    assert client.get("/thru?target=https://other.com/x").status_code == 403


def test_disabled_env_is_503(client, monkeypatch):
    monkeypatch.setenv("THRU_DISABLED", "true")
    resp = client.get("/thru?target=https://example.com/")
    assert resp.status_code == 503
