# Contract tests for the logging feature's PYTHON build (back/spec/logging.md).
# Run: cd back && .venv/bin/pytest test/test_logging_py.py   (from the feat repo root)
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from features.logging.v1.py import ext_log as ext_log_module  # noqa: E402
from features.logging.v1.py.logger import Logger, sanitize  # noqa: E402
from features.logging.v1.py.ext_log import (  # noqa: E402
    EXT_LOG_FILE,
    MAX_ENTRIES_PER_REQUEST,
    ingest_ext_logs,
    normalize_ext_entries,
    read_ext_logs,
)




@pytest.fixture()
def log_dir(tmp_path):
    return tmp_path


@pytest.fixture()
def make_logger(log_dir):
    def factory(**opts):
        return Logger(dir=str(log_dir), console=False, **opts)

    return factory


def read_jsonl(path: Path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def test_sanitize_masks_sensitive_keys_and_survives_cycles():
    cyc = {"ok": 1, "password": "hunter2", "nested": {"API_KEY": "k", "inner": {"token": "t"}}}
    cyc["nested"]["self"] = cyc
    out = sanitize(cyc)
    assert out["password"] == "***REDACTED***"
    assert out["nested"]["API_KEY"] == "***REDACTED***"
    assert out["nested"]["inner"]["token"] == "***REDACTED***"
    assert out["nested"]["self"] == "[Circular]"
    assert out["ok"] == 1


def test_log_writes_app_log_error_writes_error_log(log_dir, make_logger):
    log = make_logger()
    log.log("hello", {"a": 1}, "myFn")
    log.error("boom", ValueError("bang"))
    log.flush()

    app = read_jsonl(log_dir / "app.log")
    err = read_jsonl(log_dir / "error.log")
    assert len(app) == 1
    assert app[0]["msg"] == "hello"
    assert app[0]["level"] == "log"
    assert app[0]["fn"] == "myFn"
    assert app[0]["data"] == {"a": 1}
    assert len(err) == 1
    assert err[0]["level"] == "error"
    assert "ValueError: bang" in err[0]["stack"]
    assert "data" not in err[0]


def test_error_with_non_exception_stores_data_not_stack(log_dir, make_logger):
    log = make_logger()
    log.error("bad input", {"field": "x"})
    log.flush()
    [entry] = read_jsonl(log_dir / "error.log")
    assert entry["data"] == {"field": "x"}
    assert "stack" not in entry


def test_data_sanitized_on_write(log_dir, make_logger):
    log = make_logger()
    log.log("req", {"url": "/x", "Authorization": "Bearer abc", "body": {"password": "p"}})
    log.flush()
    [entry] = read_jsonl(log_dir / "app.log")
    assert entry["data"]["Authorization"] == "***REDACTED***"
    assert entry["data"]["body"]["password"] == "***REDACTED***"


def test_disabled_stops_files_but_ring_works(log_dir, make_logger):
    log = make_logger(enabled=False)
    log.warn("w1")
    log.warn("w2")
    log.flush()
    assert not (log_dir / "app.log").exists()
    entries = log.get_logs(memory=True)
    assert [e["msg"] for e in entries] == ["w1", "w2"]


def test_ring_holds_at_most_500_newest_kept(log_dir, make_logger):
    log = make_logger()
    for i in range(505):
        log.log(f"m{i}")
    log.flush()
    ring = log.get_logs(memory=True)
    assert len(ring) == 500
    assert ring[0]["msg"] == "m5"
    assert ring[-1]["msg"] == "m504"


def test_rotation_renames_and_keeps_max_files(log_dir, make_logger):
    log = make_logger(max_bytes=300, max_files=2)
    for i in range(30):
        log.log(f"p{i}")
    log.flush()
    names = {p.name for p in log_dir.iterdir()}
    assert "app.log" in names
    assert "app.log.1" in names
    assert "app.log.3" not in names
    entries = log.get_logs(type_="app")
    assert len(entries) >= 6  # multiple generations assembled, oldest-first
    assert entries[0]["ts"] <= entries[-1]["ts"]


def test_get_logs_filters(log_dir, make_logger):
    log = make_logger()
    log.log("a1")
    log.warn("w1")
    log.error("e1")
    log.flush()
    app_only = log.get_logs(type_="app")
    assert sorted(e["msg"] for e in app_only) == ["a1", "w1"]
    assert len(log.get_logs(last=1)) == 1


def test_read_log_file_reads_custom_file(log_dir, make_logger):
    log = make_logger(filename="custom.log", error_filename="custom.log")
    log.log("c1")
    log.flush()
    entries = log.read_log_file("custom.log")
    assert [e["msg"] for e in entries] == ["c1"]


# ---- ext-log ingestion ------------------------------------------------------


def test_normalize_non_array():
    assert normalize_ext_entries("nope") == {"entries": [], "dropped": 0, "capped": False}
    assert normalize_ext_entries(None) == {"entries": [], "dropped": 0, "capped": False}


def test_normalize_drops_junk_counts_it(log_dir):
    res = normalize_ext_entries([
        "a string",
        None,
        ["an array"],
        {"noMsg": True},
        {"msg": "", "level": "error"},
        {"msg": "keep me", "level": "error", "scope": "scan", "ts": "2026-11-07T10:00:00Z"},
    ])
    assert res["dropped"] == 5
    assert len(res["entries"]) == 1
    assert res["entries"][0]["msg"] == "keep me"
    assert res["entries"][0]["ts"] == "2026-11-07T10:00:00.000Z"


def test_normalize_oversized_keeps_newest(log_dir):
    raw = [{"msg": f"m{i}"} for i in range(MAX_ENTRIES_PER_REQUEST + 10)]
    res = normalize_ext_entries(raw)
    assert res["capped"] is True
    assert len(res["entries"]) == MAX_ENTRIES_PER_REQUEST
    assert res["entries"][0]["msg"] == "m10"
    assert res["entries"][-1]["msg"] == f"m{MAX_ENTRIES_PER_REQUEST + 9}"


def test_normalize_level_map_ts_fallback_bounds(log_dir):
    res = normalize_ext_entries([
        {"msg": "x" * 600, "level": "DEBUG"},
        {"msg": "y", "level": "warning", "scope": "s" * 100},
        {"msg": "z", "ts": "not-a-date"},
        {"msg": "stacky", "stack": "Error: x\n    at f"},
        {"msg": "with data", "data": {"k": 1}},
    ])
    a, b, c, d, e = res["entries"]
    assert len(a["msg"]) == 500
    assert a["level"] == "log"
    assert b["level"] == "warn"
    assert len(b["scope"]) == 60
    assert c["ts"].endswith("Z") and "T" in c["ts"]
    assert d["stack"] == "Error: x\n    at f"
    assert e["data"] == {"k": 1}


def test_ingest_read_round_trip(log_dir, monkeypatch):
    # The ext stream is a process-global singleton; point it at the tmp dir for this run.
    monkeypatch.setattr(ext_log_module.ext_logger, "dir", log_dir)
    monkeypatch.setattr(ext_log_module.ext_logger, "app_file", log_dir / EXT_LOG_FILE)
    monkeypatch.setattr(ext_log_module.ext_logger, "error_file", log_dir / EXT_LOG_FILE)
    marker = f"rt-{log_dir.name}"
    normalized = normalize_ext_entries([
        {"msg": f"{marker} scan done", "level": "log", "scope": "scan", "ts": "2026-11-07T09:00:00Z"},
        {"msg": f"{marker} crashed", "level": "error", "scope": "worker", "ts": "2026-11-07T09:00:01Z", "stack": "Error: x"},
    ])
    ingest_ext_logs(normalized, {"extensionId": "ext-1", "userId": 2})
    entries = read_ext_logs()
    mine = [e for e in entries if e["msg"].startswith(marker)]
    assert len(mine) == 2
    err = next(e for e in mine if e["level"] == "error")
    assert err["msg"] == f"{marker} crashed"
    assert err["fn"] == "ext:worker"
    assert err["data"]["extTs"] == "2026-11-07T09:00:01.000Z"
    assert err["data"]["extStack"] == "Error: x"
    assert "stack" not in err
    assert err["data"]["extensionId"] == "ext-1"
    assert err["data"]["userId"] == 2


def test_ingest_omits_null_user_id_and_last_slices(log_dir, monkeypatch):
    monkeypatch.setattr(ext_log_module.ext_logger, "dir", log_dir)
    monkeypatch.setattr(ext_log_module.ext_logger, "app_file", log_dir / EXT_LOG_FILE)
    monkeypatch.setattr(ext_log_module.ext_logger, "error_file", log_dir / EXT_LOG_FILE)
    marker = f"nu-{log_dir.name}"
    ingest_ext_logs(
        normalize_ext_entries([{"msg": f"{marker} one"}, {"msg": f"{marker} two"}]),
        {"extensionId": None, "userId": None},
    )
    entries = read_ext_logs()
    mine = [e for e in entries if e["msg"].startswith(marker)]
    assert len(mine) == 2
    assert all("userId" not in e["data"] for e in mine)
    last = read_ext_logs(last=1)
    assert len(last) == 1
    assert last[0]["msg"] == f"{marker} two"
