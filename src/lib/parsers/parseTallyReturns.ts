import { ProcessedSalesReturnRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';
import { extractVoucherLineItems } from '../tally/voucherEntries';
import { logExtractionRejections } from './extractionIssues';
import { financialYearOf } from '../tally/financialYear';
import { TallyParseResult } from './parseTallySales';

/**
 * Credit notes serve two unrelated purposes in this ledger: goods physically
 * returned, and pure value adjustments (rate difference, discount) raised with
 * no quantity. Both reduce revenue, but only the first is a return — conflating
 * them inflates return-rate KPIs, so each line is tagged with its kind.
 */
export function parseTallyReturns(
  xml: string,
  validationEngine: ValidationEngine,
  company = 'default'
): TallyParseResult<ProcessedSalesReturnRecord> {
  const { rows, stats } = extractVoucherLineItems(xml, company);
  logExtractionRejections(`Tally Credit Note (${company})`, stats, validationEngine);

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
      party: row.party,
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

  const valueOnly = records.filter((r) => r.returnKind === 'VALUE_ONLY').length;
  if (valueOnly > 0) {
    validationEngine.logIssue(
      `Tally Credit Note (${company})`,
      undefined,
      'Info',
      'INVALID_RETURN_SEMANTICS',
      `${valueOnly} credit note line(s) carry value but no quantity; classified as value-only adjustments rather than physical returns.`
    );
  }

  return { records, stats };
}
