import { ProcessedPurchaseRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';
import { extractVoucherLineItems } from '../tally/voucherEntries';
import { logExtractionRejections } from './extractionIssues';
import { financialYearOf } from '../tally/financialYear';
import { TallyParseResult } from './parseTallySales';

export function parseTallyPurchase(
  xml: string,
  validationEngine: ValidationEngine,
  company = 'default'
): TallyParseResult<ProcessedPurchaseRecord> {
  const { rows, stats } = extractVoucherLineItems(xml, company);
  logExtractionRejections(`Tally Purchase (${company})`, stats, validationEngine);

  const records = rows.map((row) => {
    if (row.quantity === 0) {
      validationEngine.logIssue(
        'Tally Purchase',
        row.sourceRowNumber,
        'Warning',
        'INVALID_QUANTITY',
        'Invalid or zero quantity',
        row.itemName
      );
    }

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
      quantity: Math.abs(row.quantity),
      unit: row.unit,
      quantityKg: row.unit === 'KGS' ? Math.abs(row.quantity) : 0,
      originalQuantity: row.quantity,
      originalUnit: row.unit,
      rate: row.rate,
      value: Math.abs(row.amount),
      purchaseSource: 'Tally' as const,
    };
  });

  return { records, stats };
}
