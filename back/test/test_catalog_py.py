# Contract tests for the /catalog.json endpoint (feat catalog = env-requirements
# source of truth). Run: pytest back/test/test_catalog_py.py   (from the feat repo root)
import importlib.util
import os
from pathlib import Path

import pytest

BACK = Path(__file__).resolve().parent.parent
APP_PATH = BACK / "app.py"


@pytest.fixture()
def client():
    spec = importlib.util.spec_from_file_location("feat_app_catalog", APP_PATH)
    app = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(app)
    app.app.config["TESTING"] = True
    return app.app.test_client()


def test_catalog_shape(client):
    res = client.get("/catalog.json")
    assert res.status_code == 200
    body = res.get_json()
    features = body["features"]
    assert "get-updates" in features and "req" in features and "loader" in features
    gu = features["get-updates"]
    assert set(gu) == {"latest", "versions"}
    v2 = gu["versions"]["v2"]
    assert set(v2) >= {"namespaces", "envs"}
    assert "js-node" in v2["namespaces"]


def test_feat_json_merged(client):
    v2 = client.get("/catalog.json").get_json()["features"]["get-updates"]["versions"]["v2"]
    assert v2["kind"] == "route"
    assert v2["defaultMount"] == "/get-updates"
    envs = {e["name"]: e for e in v2["envs"]}
    assert envs["FEAT_GET_UPDATES_SLOT"]["required"] is True
    assert envs["FEAT_GET_UPDATES_VERSION"]["required"] is False
    assert "description" in envs["FEAT_GET_UPDATES_SLOT"]


def test_version_without_feat_json_gets_empty_envs(client):
    versions = client.get("/catalog.json").get_json()["features"]["get-updates"]["versions"]
    v1 = versions["v1"]
    assert v1["envs"] == []
    assert "kind" not in v1  # nothing merged
    assert "js-node" in v1["namespaces"]


def test_dynamic_pattern_rows_pass_through(client):
    v1 = client.get("/catalog.json").get_json()["features"]["req"]["versions"]["v1"]
    names = [e["name"] for e in v1["envs"]]
    assert "FEAT_REQ_SLOT" in names
    assert any("<NAME>" in n for n in names)  # recipe pattern rows survive as data


def test_no_cache_and_cors(client):
    res = client.get("/catalog.json")
    assert res.headers.get("Cache-Control") in (None, "no-cache", "no-store") or "no-cache" in (
        res.headers.get("Cache-Control") or ""
    )
    assert res.headers.get("Access-Control-Allow-Origin") == "*"
