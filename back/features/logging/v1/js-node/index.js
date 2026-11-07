/**
 * logging feature — feat-router entry (js-node).
 *
 * This file exists only so feat's router has its required `index.*` entry. Consumers VENDOR
 * logger.js and ext-log.js directly (see back/spec/logging.md, Consumer contract) — this
 * entry is not part of the vendored set.
 */
export { Logger, logger, sanitize } from './logger.js';
export {
  EXT_LOG_FILE,
  MAX_ENTRIES_PER_REQUEST,
  extLogger,
  normalizeExtEntries,
  ingestExtLogs,
  readExtLogs,
} from './ext-log.js';
