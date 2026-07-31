import { ValidationEngine } from '../validation/engine';
import { VoucherExtraction } from '../tally/voucherEntries';

/**
 * Turns extraction rejection counters into visible validation issues.
 *
 * The parsers previously discarded malformed inventory lines with a bare
 * `return`, so data loss left no trace. Every rejected line is now reported.
 */
export function logExtractionRejections(
  source: string,
  stats: VoucherExtraction['stats'],
  validationEngine: ValidationEngine
): void {
  for (const [reason, count] of Object.entries(stats.rejected)) {
    if (!count) continue;
    validationEngine.logIssue(
      source,
      undefined,
      'Warning',
      reason === 'BLANK_STOCK_ITEM_NAME' ? 'MISSING_REQUIRED_COLUMN' : 'INVALID_VALUE',
      `${count} inventory line(s) excluded during extraction (${reason})`
    );
  }

  if (stats.cancelledVouchers > 0) {
    validationEngine.logIssue(
      source,
      undefined,
      'Warning',
      'POSSIBLE_DUPLICATE_ROW',
      `${stats.cancelledVouchers} cancelled voucher(s) present in the export`
    );
  }

  if (stats.optionalVouchers > 0) {
    validationEngine.logIssue(
      source,
      undefined,
      'Warning',
      'POSSIBLE_DUPLICATE_ROW',
      `${stats.optionalVouchers} optional voucher(s) present in the export`
    );
  }
}
