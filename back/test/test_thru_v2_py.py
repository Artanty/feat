# Contract tests for thru v2 (python build) — v2 = v1 contract + CORS preflight.
# Run: cd back && .venv/bin/pytest test/test_thru_v2_py.py   (from the feat repo root)
import importlib.util
import json
import sys
from pathlib import Path

import pytest

# load the SHIPPED features copy by path (what consumers vendor), same as test_thru_py.py
_spec = importlib.util.spec_from_file_location(
    "thru2", Path(__file__).resolve().parent.parent / "features" / "thru" / "v2" / "py" / "thru.py"
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["thru2"] = _mod
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
    monkeypatch.setattr(
        _mod, "_fetch",
        lambda url, method, body, extra_headers, timeout_s, _s=status, _ct=content_type, _b=body:
        calls.append({"url": url, "method": method, "body": body,
                      "headers": extra_headers, "timeout_s": timeout_s})
        or (_s, _ct, _b),
    )
    return calls


# --- v2: CORS preflight (the whole point of v2) -------------------------------


def test_preflight_echoes_requested_headers(client):
    resp = client.open("/thru", method="OPTIONS", headers={
        "Origin": "https://chat.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, x-totp-auth",
    })
    assert resp.status_code == 200
    assert resp.headers["Access-Control-Allow-Origin"] == "*"
    assert resp.headers["Access-Control-Allow-Methods"] == "GET, POST, OPTIONS"
    assert resp.headers["Access-Control-Allow-Headers"] == "content-type, x-totp-auth"
    assert resp.headers["Access-Control-Max-Age"] == "600"


def test_preflight_without_request_headers_falls_back(client):
    resp = client.open("/thru", method="OPTIONS",
                       headers={"Access-Control-Request-Method": "POST"})
    assert resp.status_code == 200
    assert resp.headers["Access-Control-Allow-Headers"] == "Content-Type"


def test_post_response_carries_cors_methods_and_headers(client, monkeypatch):
    # the actual (non-preflight) response must carry allow-methods/allow-headers too —
    # some stacks probe the real endpoint's CORS surface directly
    fake_fetch(monkeypatch)
    resp = client.post("/thru", json={"target": "https://example.com/x"})
    assert resp.status_code == 200
    assert resp.headers["Access-Control-Allow-Origin"] == "*"
    assert resp.headers["Access-Control-Allow-Methods"] == "GET, POST, OPTIONS"
    assert resp.headers["Access-Control-Allow-Headers"] == "Content-Type"


# --- v1 contract must hold unchanged through v2 --------------------------------


def test_post_json_body_params(client, monkeypatch):
    calls = fake_fetch(monkeypatch)
    resp = client.post("/thru", json={
        "target": "https://chat-back.example/mediator/m/user/me",
        "targetMethod": "post",
        "targetHeaders": {"X-Totp-Auth": "tok", "X-Relay-Key": "rk"},
        "targetBody": {"message": "привет"},
        "targetTimeoutS": 30,
    })
    assert resp.status_code == 200
    assert calls[0]["url"] == "https://chat-back.example/mediator/m/user/me"
    assert calls[0]["method"] == "post"
    assert json.loads(calls[0]["body"]) == {"message": "привет"}
    assert calls[0]["headers"] == {"X-Totp-Auth": "tok", "X-Relay-Key": "rk"}
    assert calls[0]["timeout_s"] == 30


def test_get_simple_request_still_works(client, monkeypatch):
    calls = fake_fetch(monkeypatch)
    resp = client.get("/thru?target=https://example.com/api/x")
    assert resp.status_code == 200
    assert resp.data == b'{"ok": true}'
    assert resp.headers["Access-Control-Allow-Origin"] == "*"
    assert calls[0]["url"] == "https://example.com/api/x"


def test_connect_failure_is_502_envelope(client, monkeypatch):
    def boom(url, method, body, extra_headers, timeout_s):
        raise OSError("timed out")
    monkeypatch.setattr(_mod, "_fetch", boom)
    resp = client.get("/thru?target=https://down.example.com/")
    assert resp.status_code == 502
    assert resp.headers["X-Thru-Error"] == "OSError"
    assert resp.headers["Access-Control-Allow-Origin"] == "*"
