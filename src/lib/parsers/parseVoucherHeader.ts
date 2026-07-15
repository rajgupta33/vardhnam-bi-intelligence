import Papa from 'papaparse';
import { ValidationEngine } from '../validation/engine';

import { VoucherHeaderRecord } from '@/types';

export async function parseVoucherHeader(
  fileText: string,
  validationEngine: ValidationEngine
): Promise<VoucherHeaderRecord[]> {
  const parsed = Papa.parse<any>(fileText, {
    header: true,
    skipEmptyLines: true,
  });

  const records: VoucherHeaderRecord[] = [];

  parsed.data.forEach((row, index) => {
    const rowNum = index + 2;
    
    if (!row.vch_no) {
      validationEngine.logIssue('Voucher Header', rowNum, 'Warning', 'MISSING_REQUIRED_COLUMN', 'vch_no missing');
      return;
    }

    let parsedDate: Date | null = null;
    if (row.date) {
      const dateNum = Number(row.date);
      if (!isNaN(dateNum)) {
        parsedDate = new Date(Math.round((dateNum - 25569) * 86400 * 1000));
      } else {
        parsedDate = new Date(row.date);
      }
    }

    records.push({
      voucher_id: row.voucher_id,
      page: row.page,
      date: parsedDate,
      date_original: row.date_original,
      party: row.party,
      vch_type: row.vch_type,
      vch_no: row.vch_no,
      primary_ledger: row.primary_ledger,
      credit_amount: parseFloat(row.credit_amount) || null,
      agst_refs: row.agst_refs || null,
      narration: row.narration || null,
    });
  });

  return records;
}
