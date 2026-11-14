"""logging feature — feat-router entry (py). Consumers VENDOR logger.py and ext_log.py
directly (see back/spec/logging.md, Consumer contract); this entry is not vendored."""
from .logger import Logger, logger, sanitize
from .ext_log import (
    EXT_LOG_FILE,
    MAX_ENTRIES_PER_REQUEST,
    ext_logger,
    normalize_ext_entries,
    ingest_ext_logs,
    read_ext_logs,
)
