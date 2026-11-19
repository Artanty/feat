# Tests for feat app-level origin tracking (routing-level capture, `/` display).
# Run: cd back && .venv/bin/pytest test/test_origins_py.py
import importlib.util
import sys
from pathlib import Path

import pytest

# load app.py by path (back/ is not a package)
_spec = importlib.util.spec_from_file_location(
    "feat_app", Path(__file__).resolve().parent.parent / "app.py"
)
_app = importlib.util.module_from_spec(_spec)
sys.modules["feat_app"] = _app
_spec.loader.exec_module(_app)


@pytest.fixture()
def store(tmp_path, monkeypatch):
    tracker = _app.OriginTracker(tmp_path / "origins.json")
    # the before_request hook reads the module global at call time
    monkeypatch.setattr(_app, "origins", tracker)
    return tracker


@pytest.fixture()
def client(store):
    _app.app.config["TESTING"] = True
    return _app.app.test_client()


def test_origin_header_recorded(client, store):
    client.get("/wake-up/v4/js-web/", headers={"Origin": "https://plst.twc1.net"})
    assert store.of("wake-up") == [
        ("https://plst.twc1.net", {"count": 1, "last": store.of("wake-up")[0][1]["last"]})
    ]


def test_referer_fallback(client, store):
    client.get(
        "/bus/v1/js-web/",
        headers={"Referer": "https://stat.example.com/page?x=1"},
    )
    assert [addr for addr, _ in store.of("bus")] == ["https://stat.example.com"]


def test_no_header_not_recorded(client, store):
    client.get("/bus/v1/js-web/")
    assert store.of("bus") == []


def test_unique_dedupe_counts(client, store):
    for _ in range(3):
        client.get("/bus/v1/js-web/", headers={"Origin": "https://a.example"})
    client.get("/bus/latest/js-web", headers={"Origin": "https://b.example"})
    recorded = dict(store.of("bus"))
    assert set(recorded) == {"https://a.example", "https://b.example"}
    assert recorded["https://a.example"]["count"] == 3


def test_unknown_feature_404_not_recorded(client, store):
    r = client.get("/nope/v1/js-web/", headers={"Origin": "https://a.example"})
    assert r.status_code == 404
    assert store.of("nope") == []


def test_non_feature_route_ignored(client, store):
    client.get("/manifest.json", headers={"Origin": "https://a.example"})
    client.get("/", headers={"Origin": "https://a.example"})
    assert store.data == {}


def test_index_shows_collapsible_origins(client, store):
    client.get("/bus/v1/js-web/", headers={"Origin": "https://a.example"})
    html = client.get("/").get_data(as_text=True)
    assert "<details><summary>used by 1 origin</summary>" in html
    assert "https://a.example" in html


def test_index_no_origins_no_details(client, store):
    html = client.get("/").get_data(as_text=True)
    assert "<details>" not in html


def test_persistence_roundtrip(tmp_path):
    path = tmp_path / "origins.json"
    first = _app.OriginTracker(path)
    first.record("bus", "https://a.example")
    second = _app.OriginTracker(path)
    assert second.of("bus")[0][0] == "https://a.example"
