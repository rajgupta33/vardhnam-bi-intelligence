import Papa from 'papaparse';
import { ProcessedSalesReturnRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';

export async function parseSalesReturnItems(
  fileText: string,
  validationEngine: ValidationEngine
): Promise<ProcessedSalesReturnRecord[]> {
  const parsed = Papa.parse<any>(fileText, {
    header: true,
    skipEmptyLines: true,
  });

  const records: ProcessedSalesReturnRecord[] = [];

  parsed.data.forEach((row, index) => {
    const rowNum = index + 2;
    const originalItemName = row.item_name;

    if (!originalItemName) {
      validationEngine.logIssue('Sales Return Items', rowNum, 'Warning', 'MISSING_REQUIRED_COLUMN', 'Item name missing');
      return;
    }

    const quantityRaw = row.quantity;
    const itemAmount = row.item_amount;
    
    let returnQuantityKg = parseFloat(quantityRaw);
    if (isNaN(returnQuantityKg)) {
      returnQuantityKg = 0;
      validationEngine.logIssue('Sales Return Items', rowNum, 'Warning', 'INVALID_QUANTITY', 'Invalid quantity', originalItemName);
    }

    // Semantic validation check: A return should have a valid quantity
    if (returnQuantityKg <= 0) {
      validationEngine.logIssue(
        'Sales Return Items',
        rowNum,
        'Info',
        'INVALID_RETURN_SEMANTICS',
        'Return has zero or negative quantity, possibly a pure value credit note.',
        originalItemName,
        undefined,
        returnQuantityKg
      );
      // We still include it, but the analytics engine might filter it if returnQuantityKg is 0
    }

    // Attempt date parsing. Excel CSV export might output numbers like 45782 (Excel serial date) or string dates.
    let parsedDate: Date | null = null;
    if (row.date) {
      const dateNum = Number(row.date);
      if (!isNaN(dateNum)) {
        // Excel serial date to JS Date
        parsedDate = new Date(Math.round((dateNum - 25569) * 86400 * 1000));
      } else {
        parsedDate = new Date(row.date);
      }
    }

    records.push({
      id: crypto.randomUUID(),
      sourceRowNumber: rowNum,
      validationStatus: 'VALID',
      date: parsedDate,
      voucherNo: row.vch_no || '',
      party: row.party || 'Unknown',
      originalItemName: String(originalItemName).trim(),
      normalisedItemName: '',
      skuId: row.SKU_ID || null, // Might be present in source, but we will re-map anyway
      returnQuantityKg,
      originalQuantity: returnQuantityKg,
      originalUnit: row.unit || null,
      returnValue: parseFloat(itemAmount) || null,
    });
  });

  return records;
}
