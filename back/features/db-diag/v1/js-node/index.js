/**
 * db-diag feature — feat-router entry (js-node). Consumers VENDOR dbDiag.js directly
 * (see back/spec/db-diag.md, Consumer contract); this entry is not part of the vendored set.
 */
export {
  classifyDbError,
  grantSqlForUser,
  probeTcp,
  checkDatabase,
  publicIp,
} from './dbDiag.js';
