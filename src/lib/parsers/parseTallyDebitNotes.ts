import { ProcessedPurchaseReturnRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';
import { extractVoucherLineItems } from '../tally/voucherEntries';
import { logExtractionRejections } from './extractionIssues';
import { financialYearOf } from '../tally/financialYear';
import { TallyParseResult } from './parseTallySales';

/**
 * Debit Notes are NOT all purchase returns.
 *
 * Two distinct instruments share the voucher type, exactly as Credit Notes turned
 * out to cover both physical returns and value-only rate adjustments:
 *
 *   - raised on a SUPPLIER  → debits a Purchase ledger → reduces Purchase Accounts
 *     (Telangana FY24-25: ₹7,38,900, 3,284 KGS Maize back to K C Agroteck)
 *   - raised on a CUSTOMER  → credits the Sales ledger → increases Sales Accounts
 *     (U.P FY23-24: ₹97,732 across three rate-difference notes)
 *
 * The voucher type cannot distinguish them; only the ledger it posts to can. So
 * `ledgerKindByVoucher` is built from the same voucher's ledger entries and each
 * row is tagged with it. Treating every Debit Note as a purchase return threw
 * Sales *and* Purchase out by ₹97,732 each in U.P FY23-24 — one misclassification
 * producing two variances that looked unrelated.
 */
export function parseTallyDebitNotes(
  xml: string,
  validationEngine: ValidationEngine,
  company = 'default',
  ledgerKindByVoucher: Map<string, 'SALES' | 'PURCHASE'> = new Map()
): TallyParseResult<ProcessedPurchaseReturnRecord> {
  const { rows, stats } = extractVoucherLineItems(xml, company);
  logExtractionRejections(`Tally Debit Note (${company})`, stats, validationEngine);

  const records = rows.map((row) => {
    const quantity = Math.abs(row.quantity);
    const returnKind = quantity > 0 ? ('PHYSICAL' as const) : ('VALUE_ONLY' as const);

    return {
      id: crypto.randomUUID(),
      rowKey: row.rowKey,
      source: 'tally',
      company: row.company,
      isInterCompany: row.isInterCompany,
      sourceRowNumber: row.sourceRowNumber,
      validationStatus: 'VALID' as const,
      isCancelled: row.isCancelled,
      isOptional: row.isOptional,
      date: row.date,
      financialYear: financialYearOf(row.date),
      voucherNo: row.voucherNo,
      supplier: row.party,
      originalItemName: row.itemName,
      normalisedItemName: '',
      skuId: null,
      returnKind,
      returnQuantity: quantity,
      unit: row.unit,
      returnQuantityKg: row.unit === 'KGS' ? quantity : 0,
      originalQuantity: row.quantity,
      originalUnit: row.unit,
      returnValue: Math.abs(row.amount),
      ledgerKind: ledgerKindByVoucher.get(row.voucherNo.trim()) ?? null,
    };
  });

  return { records, stats };
}
