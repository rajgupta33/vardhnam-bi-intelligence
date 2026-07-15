import * as XLSX from 'xlsx';
import { ProcessedSalesRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';

export async function parseSales(
  fileBuffer: ArrayBuffer,
  validationEngine: ValidationEngine
): Promise<ProcessedSalesRecord[]> {
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  
  if (!workbook.SheetNames.includes('Item_Lines')) {
    validationEngine.logIssue(
      'Sales',
      undefined,
      'Critical',
      'MISSING_REQUIRED_COLUMN',
      'Item_Lines sheet not found.'
    );
    return [];
  }

  const sheet = workbook.Sheets['Item_Lines'];
  const rows = XLSX.utils.sheet_to_json<any>(sheet);
  
  const records: ProcessedSalesRecord[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2; // Assuming header is row 1
    
    // Ignore non-sales vouchers if mixed, but usually DayBook is filtered or vch_type indicates it
    if (row.vch_type !== 'Sales') return;

    const originalItemName = row.item_name;
    if (!originalItemName) {
      validationEngine.logIssue('Sales', rowNum, 'Warning', 'MISSING_REQUIRED_COLUMN', 'Item name missing');
      return;
    }

    const quantityRaw = row.quantity;
    const itemAmount = row.item_amount;
    
    // Ensure quantity exists
    let quantityKg = parseFloat(quantityRaw);
    if (isNaN(quantityKg)) {
      quantityKg = 0;
      validationEngine.logIssue('Sales', rowNum, 'Warning', 'INVALID_QUANTITY', 'Invalid quantity', originalItemName);
    }

    records.push({
      id: crypto.randomUUID(),
      sourceRowNumber: rowNum,
      validationStatus: 'VALID',
      date: row.date instanceof Date ? row.date : (row.date ? new Date(row.date) : null),
      voucherNo: row.vch_no || '',
      party: row.party || 'Unknown',
      originalItemName: String(originalItemName).trim(),
      normalisedItemName: '',
      skuId: null,
      quantityKg,
      originalQuantity: quantityKg,
      originalUnit: row.unit || null,
      rate: parseFloat(row.rate) || null,
      value: parseFloat(itemAmount) || 0,
    });
  });

  return records;
}
