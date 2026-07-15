import * as XLSX from 'xlsx';
import { ValidationEngine } from '../validation/engine';

export interface CreditNoteRecord {
  voucher_id: string;
  page: string;
  date: Date | null;
  party: string;
  vch_no: string;
  ledger: string;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  rate_unit: string | null;
  item_amount: number | null;
  raw_item_line: string;
  sku_id: string | null;
}

export async function parseCreditNote(
  fileBuffer: ArrayBuffer,
  validationEngine: ValidationEngine
): Promise<CreditNoteRecord[]> {
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  
  if (!workbook.SheetNames.includes('Credit_Note')) {
    validationEngine.logIssue(
      'Credit Note',
      undefined,
      'Critical',
      'MISSING_REQUIRED_COLUMN',
      'Credit_Note sheet not found.'
    );
    return [];
  }

  const sheet = workbook.Sheets['Credit_Note'];
  const rows = XLSX.utils.sheet_to_json<any>(sheet);
  
  const records: CreditNoteRecord[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    
    let parsedDate: Date | null = null;
    if (row.date) {
      if (row.date instanceof Date) {
        parsedDate = row.date;
      } else {
        const dateNum = Number(row.date);
        if (!isNaN(dateNum)) {
          parsedDate = new Date(Math.round((dateNum - 25569) * 86400 * 1000));
        } else {
          parsedDate = new Date(row.date);
        }
      }
    }

    records.push({
      voucher_id: row.voucher_id,
      page: row.page,
      date: parsedDate,
      party: row.party || 'Unknown',
      vch_no: row.vch_no || '',
      ledger: row.ledger || '',
      item_name: String(row.item_name || '').trim(),
      quantity: parseFloat(row.quantity) || null,
      unit: row.unit || null,
      rate: parseFloat(row.rate) || null,
      rate_unit: row.rate_unit || null,
      item_amount: parseFloat(row.item_amount) || null,
      raw_item_line: row.raw_item_line || '',
      sku_id: row.SKU_ID || null,
    });
  });

  return records;
}
