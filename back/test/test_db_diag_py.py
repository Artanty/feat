# Contract tests for the db-diag feature's PYTHON build (back/spec/db-diag.md).
# Run: cd back && .venv/bin/pytest test/test_db_diag_py.py   (from the feat repo root)
import sys
from pathlib import Path

import pytest

import importlib.util

# db-diag's dir name carries a hyphen (not importable as a package) — load by path; the
# module itself is standalone (no relative imports).
_spec = importlib.util.spec_from_file_location(
    "db_diag", Path(__file__).resolve().parent.parent / "features" / "db-diag" / "v1" / "py" / "db_diag.py"
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["db_diag"] = _mod
_spec.loader.exec_module(_mod)

classify_db_error = _mod.classify_db_error
grant_sql_for_user = _mod.grant_sql_for_user
probe_tcp = _mod.probe_tcp
public_ip = _mod.public_ip


class FakeErr(Exception):
    def __init__(self, code, message="something went wrong"):
        super().__init__(message)
        self.code = code


CASES = [
    ("ETIMEDOUT", "timeout"),
    ("PROTOCOL_SEQUENCE_TIMEOUT", "timeout"),
    ("ECONNREFUSED", "refused"),
    ("ENOTFOUND", "dns"),
    ("EAI_AGAIN", "dns"),
    ("ECONNRESET", "reset"),
    ("EPIPE", "reset"),
    ("PROTOCOL_CONNECTION_ERROR", "reset"),
    ("PROTOCOL_CONNECTION_LOST", "reset"),
    ("ER_ACCESS_DENIED_ERROR", "access_denied"),
    ("ER_DBACCESS_DENIED_ERROR", "db_access_denied"),
]


@pytest.mark.parametrize("code,kind", CASES)
def test_classification_table(code, kind):
    assert classify_db_error(FakeErr(code)).kind if False else True
    verdict = classify_db_error(FakeErr(code))
    assert verdict["kind"] == kind, code


def test_unknown_code():
    assert classify_db_error(FakeErr("WHATEVER"))["kind"] == "unknown"
    assert classify_db_error(Exception("plain"))["kind"] == "unknown"


def test_timeout_verdict_names_drop_and_carries_host():
    v = classify_db_error(FakeErr("ETIMEDOUT", "connect ETIMEDOUT 1.2.3.4:3306"), "10.0.0.1")
    assert "packets were dropped before MySQL answered" in v["headline"]
    assert "connect ETIMEDOUT 1.2.3.4:3306" in v["headline"]
    nc = next(a["code"] for a in v["actions"] if "code" in a)
    assert nc == "nc -z -v 10.0.0.1 3306"
    assert any("NEW network/location" in a["text"] for a in v["actions"])


def test_connection_lost_gets_wait_timeout_advice():
    lost = classify_db_error(FakeErr("PROTOCOL_CONNECTION_LOST", "Connection lost: The server closed the connection."))
    assert any("wait_timeout" in a["text"] for a in lost["actions"])
    reset = classify_db_error(FakeErr("ECONNRESET"))
    assert not any("wait_timeout" in a["text"] for a in reset["actions"])
    assert any("handshake reset" in a["text"] for a in reset["actions"])


def test_access_denied_extracts_account_and_embeds_grant_sql():
    v = classify_db_error(FakeErr("ER_ACCESS_DENIED_ERROR", "Access denied for user 'bob'@'93.100.74.64' (using password: YES)"))
    assert "REJECTED the login from 93.100.74.64" in v["headline"]
    assert any("'bob'@'93.100.74.64'" in a["text"] for a in v["actions"])
    sql = next(a["code"] for a in v["actions"] if "code" in a)
    assert "CREATE USER IF NOT EXISTS 'bob'@'93.100.74.64'" in sql


def test_grant_sql_public_ip_placeholder_and_database(monkeypatch):
    monkeypatch.setenv("DB_DATABASE", "mydb")
    sql = grant_sql_for_user("u1")
    assert "'u1'@'PUBLIC_IP'" in sql
    assert "ON `mydb`.*" in sql
    assert "FLUSH PRIVILEGES;" in sql
    assert "-- ALTER USER" in sql


def test_grant_sql_never_contains_a_real_password():
    sql = grant_sql_for_user("cs99850_yaum", "1.2.3.4")
    assert "<same-password-as-DB_PASSWORD>" in sql
    assert "IDENTIFIED BY ''" not in sql
    import re

    assert not re.search(r"IDENTIFIED BY '[^<]", sql), "no literal password after IDENTIFIED BY"
    assert sql.count("<same-password-as-DB_PASSWORD>") == 2  # CREATE + commented ALTER


def test_access_denied_defaults_to_cs_account():
    v = classify_db_error(FakeErr("ER_ACCESS_DENIED_ERROR", "Access denied for user"))
    assert any("'cs99850_yaum'@'<address-from-error>'" in a["text"] for a in v["actions"])


def test_probe_tcp_success_and_settles_once():
    calls = {"destroy": 0}

    class FakeSock:
        def close(self):
            calls["destroy"] += 1

    def fake_connect(addr, timeout):
        return FakeSock()

    res = probe_tcp("h", 1, 1000, connect=fake_connect)
    assert res["ok"] is True
    assert isinstance(res["latencyMs"], int)
    assert calls["destroy"] == 1


def test_probe_tcp_error_and_timeout_paths():
    import socket

    def refusing(addr, timeout):
        raise ConnectionRefusedError(61, "Connection refused")

    res = probe_tcp("h", 1, 1000, connect=refusing)
    assert res["ok"] is False
    assert res["latencyMs"] is None

    def hanging(addr, timeout):
        raise socket.timeout("timed out")

    timeout_res = probe_tcp("h", 1, 30, connect=hanging)
    assert timeout_res["ok"] is False
    assert getattr(timeout_res.get("error"), "code", "") == "ETIMEDOUT"
    assert "after 30ms" in str(timeout_res["error"]) or "timed out" in str(timeout_res["error"])


def test_public_ip_trims_null_paths():
    assert public_ip(lambda url, timeout: (200, "  1.2.3.4\n")) == "1.2.3.4"
    assert public_ip(lambda url, timeout: (500, "")) is None

    def boom(url, timeout):
        raise OSError("down")

    assert public_ip(boom) is None
