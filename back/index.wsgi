import logging
import os
import sys

# Passenger captures stderr → panel/Passenger log. Configure first so the
# import failure below is actually visible (it used to vanish silently).
logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="[feat] %(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("feat.wsgi")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# A slot-side venv (created by the deploy's pip step when the host python has
# no pip of its own, e.g. Timeweb VH python 3.6) is picked up here — Passenger
# still runs the system python, it just imports from the venv's site-packages.
_venv_sp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "venv")
if os.path.isdir(_venv_sp):
    import glob
    for _sp in sorted(glob.glob(os.path.join(_venv_sp, "lib", "python*", "site-packages"))):
        sys.path.append(_sp)
    log.info("venv site-packages appended: %s", _venv_sp)

try:
    from app import app as application, FEATURES_DIR
except Exception:
    # a broken import must land in the hosting log, not disappear
    log.exception("WSGI import FAILED — app will NOT serve")
    raise

_features = (
    sorted(d.name for d in FEATURES_DIR.iterdir() if d.is_dir())
    if FEATURES_DIR.is_dir()
    else []
)
log.info(
    "WSGI app loaded OK — features_dir=%s features=%s",
    FEATURES_DIR,
    _features or "NONE (check deploy!)",
)
