import { ProcessedAdjustmentRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';
import { extractLedgerAdjustments } from '../tally/adjustments';
import { financialYearOf } from '../tally/financialYear';

/**
 * Converts value-only ledger postings (Journals) into stored adjustment records.
 *
 * Without these the books do not balance against Tally: in FY24-25 three
 * Journals moved ₹19,51,600 onto Purchase Exempt and one moved ₹6,650 onto
 * Sales, none of which touch an inventory entry.
 */
export function parseTallyAdjustments(
  xml: string,
  validationEngine: ValidationEngine,
  company = 'default'
): ProcessedAdjustmentRecord[] {
  const { adjustments, stats } = extractLedgerAdjustments(xml, company);

  if (stats.cancelledVouchers > 0) {
    validationEngine.logIssue(
      `Tally Journal (${company})`,
      undefined,
      'Warning',
      'POSSIBLE_DUPLICATE_ROW',
      `${stats.cancelledVouchers} cancelled voucher(s) present among ledger adjustments`
    );
  }

  return adjustments.map((a) => ({
    id: crypto.randomUUID(),
    rowKey: a.rowKey,
    source: 'tally',
    company: a.company,
    isInterCompany: a.isInterCompany,
    sourceRowNumber: a.sourceRowNumber,
    validationStatus: 'VALID' as const,
    isCancelled: a.isCancelled,
    isOptional: a.isOptional,
    date: a.date,
    financialYear: financialYearOf(a.date),
    voucherNo: a.voucherNo,
    voucherType: a.voucherType,
    party: a.party,
    ledgerName: a.ledgerName,
    kind: a.kind,
    amount: a.amount,
    narration: a.narration,
  }));
}
