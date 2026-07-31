import { ProcessedPurchaseReturnRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';
import { extractVoucherLineItems } from '../tally/voucherEntries';
import { logExtractionRejections } from './extractionIssues';
import { financialYearOf } from '../tally/financialYear';
import { TallyParseResult } from './parseTallySales';

/**
 * Debit Notes are the purchase-side mirror of Credit Notes: goods physically
 * sent back to a supplier, or a pure value adjustment (rate correction) with no
 * quantity. Omitting them overstates purchase totals by exactly their value —
 * confirmed live against Tally (Telangana FY24-25: one Debit Note, ₹7,38,900,
 * 3,284 KGS Maize returned to K C Agroteck) — so each line is tagged the same
 * way returns are.
 */
export function parseTallyDebitNotes(
  xml: string,
  validationEngine: ValidationEngine,
  company = 'default'
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
    };
  });

  return { records, stats };
}
