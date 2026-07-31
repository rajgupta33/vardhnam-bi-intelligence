import { ProcessedSalesRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';
import { extractVoucherLineItems, VoucherExtraction } from '../tally/voucherEntries';
import { logExtractionRejections } from './extractionIssues';
import { financialYearOf } from '../tally/financialYear';

export interface TallyParseResult<T> {
  records: T[];
  stats: VoucherExtraction['stats'];
}

export function parseTallySales(
  xml: string,
  validationEngine: ValidationEngine,
  company = 'default'
): TallyParseResult<ProcessedSalesRecord> {
  const { rows, stats } = extractVoucherLineItems(xml, company);
  logExtractionRejections(`Tally Sales (${company})`, stats, validationEngine);

  const records = rows.map((row) => {
    if (row.quantity === 0) {
      validationEngine.logIssue(
        'Tally Sales',
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
      party: row.party,
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
    };
  });

  return { records, stats };
}
