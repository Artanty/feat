"""db-diag feature — feat-router entry (py). Consumers VENDOR db_diag.py directly
(see back/spec/db-diag.md, Consumer contract); this entry is not vendored."""
from .db_diag import classify_db_error, grant_sql_for_user, probe_tcp, check_database, public_ip
