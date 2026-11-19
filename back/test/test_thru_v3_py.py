# Contract tests for thru v3 — the body-drop regression + v2 contract through v3.
# Run: cd back && .venv/bin/pytest test/test_thru_v3_py.py   (from the feat repo root)
import importlib.util
import sys
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location(
    "thru3", Path(__file__).resolve().parent.parent / "features" / "thru" / "v3" / "py" / "thru.py"
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["thru3"] = _mod
_spec.loader.exec_module(_mod)

from flask import Flask  # noqa: E402


@pytest.fixture()
def client():
    app = Flask(__name__)
    app.register_blueprint(_mod.thru_bp)
    app.testing = True
    return app.test_client()


# --- v3: the body must reach the wire even when the caller supplies content-type ---
# (v2 attached data only when content-type was ABSENT — every chat@web POST body was
# silently dropped; the v2 tests mocked _fetch and never saw it)


class _FakeResp:
    status = 200
    headers = {"content-type": "application/json"}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return b'{"ok": true}'


def test_fetch_sends_body_with_caller_content_type(monkeypatch):
    seen = {}

    def fake_urlopen(req, timeout):
        seen["data"] = req.data
        seen["headers"] = dict(req.header_items())
        seen["method"] = req.get_method()
        return _FakeResp()

    monkeypatch.setattr(_mod.urllib.request, "urlopen", fake_urlopen)
    status, ctype, payload = _mod._fetch(
        "https://back.example/auth/totp/verify", "post",
        '{"code":"464913"}', {"Content-Type": "application/json"}, 30)
    assert status == 200 and payload == b'{"ok": true}'
    assert seen["data"] == b'{"code":"464913"}'          # THE regression
    assert seen["method"] == "POST"
    ct = {k.lower(): v for k, v in seen["headers"].items()}
    assert ct["content-type"] == "application/json"      # caller's value, not duplicated


def test_fetch_defaults_content_type_when_absent(monkeypatch):
    seen = {}

    def fake_urlopen(req, timeout):
        seen["data"] = req.data
        seen["headers"] = dict(req.header_items())
        return _FakeResp()

    monkeypatch.setattr(_mod.urllib.request, "urlopen", fake_urlopen)
    _mod._fetch("https://back.example/x", "post", '{"a":1}', {}, 30)
    assert seen["data"] == b'{"a":1}'
    ct = {k.lower(): v for k, v in seen["headers"].items()}
    assert ct["content-type"] == "application/json"


def test_fetch_get_has_no_body(monkeypatch):
    seen = {}

    def fake_urlopen(req, timeout):
        seen["data"] = req.data
        seen["method"] = req.get_method()
        return _FakeResp()

    monkeypatch.setattr(_mod.urllib.request, "urlopen", fake_urlopen)
    _mod._fetch("https://back.example/api", "get", "", {}, 30)
    assert seen["data"] is None
    assert seen["method"] == "GET"


def test_post_body_form_reaches_fetch_with_body(client, monkeypatch):
    # blueprint level: targetBody + targetHeaders(content-type) must reach _fetch
    calls = []
    monkeypatch.setattr(
        _mod, "_fetch",
        lambda url, method, body, extra_headers, timeout_s:
        calls.append({"url": url, "method": method, "body": body,
                      "headers": extra_headers}) or (200, "application/json", b'{"valid": true}'))
    resp = client.post("/thru", json={
        "target": "https://back.example/auth/totp/verify",
        "targetMethod": "post",
        "targetHeaders": {"Content-Type": "application/json"},
        "targetBody": '{"code":"464913","nonce":"n"}',
    })
    assert resp.status_code == 200
    assert calls[0]["body"] == '{"code":"464913","nonce":"n"}'
    # headers pass through verbatim (lowercasing happens inside _fetch)
    assert calls[0]["headers"]["Content-Type"] == "application/json"


def test_preflight_still_answers(client):
    resp = client.open("/thru", method="OPTIONS", headers={
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"})
    assert resp.status_code == 200
    assert resp.headers["Access-Control-Allow-Headers"] == "content-type"
