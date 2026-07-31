import * as XLSX from 'xlsx';
import { ProcessedStockRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';

export async function parseGodown(
  fileBuffer: ArrayBuffer,
  validationEngine: ValidationEngine
): Promise<ProcessedStockRecord[]> {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convert sheet to JSON, array of arrays to handle custom layout
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  
  const records: ProcessedStockRecord[] = [];
  
  // Based on inspection, data starts around row 15
  // We need to find the row where column 10 is 'Quantity' and column 0 is empty/null, or we just look for 'Bajra' etc.
  let dataStartIndex = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === 'Particulars') {
      dataStartIndex = i + 3; // +1 for Opening/Inwards/etc., +2 for Quantity/Rate/Value, +3 for first data row
      break;
    }
  }

  if (dataStartIndex === 0 || dataStartIndex >= rows.length) {
    validationEngine.logIssue(
      'Godown Stock',
      undefined,
      'Critical',
      'MISSING_REQUIRED_COLUMN',
      'Could not find standard Tally Godown headers (Particulars).'
    );
    return [];
  }

  for (let i = dataStartIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const originalItemName = row[0];
    if (!originalItemName || typeof originalItemName !== 'string') continue;

    // Subtotal rows in Tally might have empty names or be bolded, but usually they are grand totals at the end
    if (originalItemName.toLowerCase().includes('grand total')) {
      break; // End of list
    }

    const closingQuantityRaw = row[10];
    const closingRateRaw = row[11];
    const closingValueRaw = row[12];

    const closingQuantity = parseFloat(closingQuantityRaw) || 0;
    const closingValue = parseFloat(closingValueRaw) || 0;

    // Wait, we need to extract Unit if available, but Godown stock might just have Quantity as number.
    // Tally might append units like "10258.5 kg" or they might be in a separate column.
    // If it's purely number, we assume KG for now, or require unit conversion mapping.
    let quantityKg = null;
    let originalUnit = null;

    if (typeof closingQuantityRaw === 'string') {
       const match = closingQuantityRaw.match(/([\d\.]+)\s*([a-zA-Z]+)?/);
       if (match) {
         quantityKg = parseFloat(match[1]);
         originalUnit = match[2] || null;
       }
    } else if (typeof closingQuantityRaw === 'number') {
       quantityKg = closingQuantityRaw;
    }

    if (quantityKg === null) {
      validationEngine.logIssue(
        'Godown Stock',
        i + 1,
        'Warning',
        'INVALID_QUANTITY',
        'Could not parse closing quantity.',
        originalItemName
      );
    }

    records.push({
      id: crypto.randomUUID(),
      sourceRowNumber: i + 1,
      validationStatus: 'VALID',
      snapshotDate: new Date('2026-03-31T00:00:00Z'), // FY 2025-26 closing
      godown: 'Main Location',
      originalItemName,
      normalisedItemName: '', // To be filled by SKU Mapper
      skuId: null,
      closingQuantity: quantityKg,
      unit: null,
      closingQuantityKg: quantityKg,
      originalClosingQuantity: quantityKg,
      originalUnit,
      closingRate: parseFloat(closingRateRaw) || null,
      closingValue,
    });
  }

  return records;
}
