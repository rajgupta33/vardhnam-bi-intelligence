/**
 * Which local files in data/approval feed which dataset, and which company they
 * belong to.
 *
 * These are FY2025-26 registers converted from Tally PDF exports, used until
 * that year is available from Tally directly. Company attribution is NOT
 * guessable from the filename — `purchase_2_converted.xlsx` is Telangana
 * despite sitting alongside the U.P files — so it is declared explicitly here
 * after verifying each file's own embedded company header.
 *
 * Labels must match the Tally company labels in TALLY_COMPANIES exactly, so a
 * company reads as one entity across both sources.
 */

export type LocalDataset = 'sales' | 'purchase' | 'returns' | 'stock';

export interface LocalFileSource {
  file: string;
  dataset: LocalDataset;
  /** Logical company label — must match the Tally label for the same entity. */
  company: string;
  /** Worksheet to read. Ignored for CSV. */
  sheet?: string;
  /** Voucher type recorded on each row, used in the composite row key. */
  voucherType: string;
  /**
   * Financial year this register covers. Vouchers derive their own year from
   * their date, but a closing-stock snapshot has no date and needs it stated.
   */
  financialYear?: string;
  note?: string;
}

export const LOCAL_FILE_SOURCES: LocalFileSource[] = [
  {
    file: 'DayBook_1_converted.xlsx',
    sheet: 'Item_Lines',
    dataset: 'sales',
    company: 'U.P',
    voucherType: 'Sales',
    note: 'Sales register 2025-04-02 → 2026-03-31. Sheet also carries non-Sales rows; filtered on vch_type.',
  },
  {
    file: 'Purcase_UP_1_converted.xlsx',
    sheet: 'Item_Lines',
    dataset: 'purchase',
    company: 'U.P',
    voucherType: 'Purchase',
  },
  {
    file: 'purchase_2_converted.xlsx',
    sheet: 'Item_Lines',
    dataset: 'purchase',
    company: 'Telangana',
    note: 'Telangana, not U.P — the workbook\'s own Raw_Extracted_Lines header reads "VARDHNAM AGRO SOLUTIONS PVT.LTD (Telangana)(25-26)".',
    voucherType: 'Purchase',
  },
  {
    file: 'Sales_Return_Items.csv',
    dataset: 'returns',
    company: 'U.P',
    voucherType: 'Credit Note',
    note: 'Credit notes. 226 of 392 rows carry a quantity (physical returns); the rest are value-only.',
  },
  {
    file: 'Godown_Stock_Excel.xlsx',
    sheet: 'Godown_Stock',
    dataset: 'stock',
    company: 'U.P',
    voucherType: 'Stock',
    financialYear: 'FY2025-26',
    note: 'Closing stock snapshot for 1-Apr-25 → 31-Mar-26. No Telangana equivalent exists.',
  },
];

/**
 * Deliberately NOT ingested.
 *
 * Credit_Note.xlsx duplicates Sales_Return_Items.csv exactly — all 392 rows
 * match on (voucher no, item, amount) — but lacks the quantity and unit columns
 * needed to tell a physical return from a value-only credit note. Reading both
 * would double-count every return.
 */
export const LOCAL_FILES_EXCLUDED: { file: string; reason: string }[] = [
  {
    file: 'Credit_Note.xlsx',
    reason: 'Exact duplicate of Sales_Return_Items.csv (392/392 rows), without quantity/unit columns.',
  },
  {
    file: 'Voucher_Header.csv',
    reason: 'Voucher-level headers only; item-level values already come from the Item_Lines sheets.',
  },
];
