import * as XLSX from 'xlsx';
import { ProcessedPurchaseRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';

export async function parsePurchase(
  fileBuffer: ArrayBuffer,
  sourceName: 'Purchase UP' | 'Purchase Source 2',
  validationEngine: ValidationEngine
): Promise<ProcessedPurchaseRecord[]> {
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  
  if (!workbook.SheetNames.includes('Item_Lines')) {
    validationEngine.logIssue(
      sourceName,
      undefined,
      'Critical',
      'MISSING_REQUIRED_COLUMN',
      'Item_Lines sheet not found.'
    );
    return [];
  }

  const sheet = workbook.Sheets['Item_Lines'];
  const rows = XLSX.utils.sheet_to_json<any>(sheet);
  
  const records: ProcessedPurchaseRecord[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    
    if (row.vch_type !== 'Purchase') return;

    const originalItemName = row.item_name;
    if (!originalItemName) {
      validationEngine.logIssue(sourceName, rowNum, 'Warning', 'MISSING_REQUIRED_COLUMN', 'Item name missing');
      return;
    }

    const quantityRaw = row.quantity;
    const itemAmount = row.item_amount;
    
    let quantityKg = parseFloat(quantityRaw);
    if (isNaN(quantityKg)) {
      quantityKg = 0;
      validationEngine.logIssue(sourceName, rowNum, 'Warning', 'INVALID_QUANTITY', 'Invalid quantity', originalItemName);
    }

    records.push({
      id: crypto.randomUUID(),
      sourceRowNumber: rowNum,
      validationStatus: 'VALID',
      date: row.date instanceof Date ? row.date : (row.date ? new Date(row.date) : null),
      voucherNo: row.vch_no || '',
      supplier: row.party || 'Unknown',
      originalItemName: String(originalItemName).trim(),
      normalisedItemName: '',
      skuId: null,
      quantity: quantityKg,
      unit: row.unit || null,
      quantityKg,
      originalQuantity: quantityKg,
      originalUnit: row.unit || null,
      rate: parseFloat(row.rate) || null,
      value: parseFloat(itemAmount) || 0,
      purchaseSource: sourceName,
    });
  });

  return records;
}
