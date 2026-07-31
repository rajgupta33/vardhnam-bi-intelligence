import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';
import {
  ProcessedSalesRecord,
  ProcessedPurchaseRecord,
  ProcessedSalesReturnRecord,
  ProcessedStockRecord,
} from '@/types';
import { ValidationEngine } from '../validation/engine';
import { financialYearOf } from '../tally/financialYear';
import { buildRowKey } from '../tally/voucherEntries';
import { normaliseUnit } from '../tally/xml';
import { interCompanyPartyPattern } from '../tally/companies';
import { LOCAL_FILE_SOURCES, LocalFileSource } from './manifest';

/**
 * Reads the FY2025-26 registers in data/approval and produces records in
 * exactly the same shape the Tally sync produces.
 *
 * Deliberately mirrors the Tally pipeline rather than reusing the older
 * standalone parsers: those predate the company, financial-year, row-key and
 * per-unit-quantity fields, and carried the same "treat every quantity as
 * kilograms" bug that was fixed on the Tally side. Emitting identical shapes
 * means SKU mapping, reconciliation, the duplicate guard and every dashboard
 * filter work across both sources without special-casing.
 */

const DATA_DIR = path.join(process.cwd(), 'data', 'approval');

export interface LocalFileSyncResult {
  sales: ProcessedSalesRecord[];
  purchase: ProcessedPurchaseRecord[];
  returns: ProcessedSalesReturnRecord[];
  stock: ProcessedStockRecord[];
  files: {
    file: string;
    dataset: string;
    company: string;
    rows: number;
    skipped: number;
    missing?: boolean;
  }[];
}

/** Excel stores dates as a serial number from 1899-12-30. */
function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

/** Excel serials plausible for these registers: roughly 1954 to 2116. */
function isSerialRange(n: number): boolean {
  return n > 20000 && n < 90000;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number' && isSerialRange(value)) return excelSerialToDate(value);

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    // CSV columns arrive as strings, so an Excel serial reaches here as "45782".
    // Passing that to `new Date()` yields the year 45782 rather than a 2025 date,
    // so bare numeric strings are resolved as serials before any date parsing.
    if (/^\d+(\.\d+)?$/.test(text)) {
      const n = Number(text);
      return isSerialRange(n) ? excelSerialToDate(n) : null;
    }
    const d = new Date(text);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/,/g, '').trim());
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

/** Blank-vs-zero matters here: a blank quantity marks a value-only credit note. */
function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

interface ItemLineRow {
  date?: unknown;
  party?: unknown;
  vch_type?: unknown;
  vch_no?: unknown;
  item_name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  rate?: unknown;
  item_amount?: unknown;
}

/**
 * Reads a workbook from bytes rather than by path.
 *
 * `XLSX.readFile` reaches for its own bundled `fs`, which Next.js stubs out
 * when it bundles server code — it fails there with "Cannot access file" even
 * though the path is correct and readable. Handing it a Buffer sidesteps that
 * entirely and behaves the same under plain Node and Next.
 */
function readWorkbook(fullPath: string): XLSX.WorkBook {
  return XLSX.read(fs.readFileSync(fullPath), { type: 'buffer', cellDates: true });
}

function readSheet(source: LocalFileSource): Record<string, unknown>[] | null {
  const full = path.join(DATA_DIR, source.file);
  if (!fs.existsSync(full)) return null;

  if (source.file.toLowerCase().endsWith('.csv')) {
    const text = fs.readFileSync(full, 'utf-8');
    return Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true }).data;
  }

  const wb = readWorkbook(full);
  const sheetName = source.sheet && wb.SheetNames.includes(source.sheet) ? source.sheet : wb.SheetNames[0];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]);
}

const baseFields = (source: LocalFileSource, row: ItemLineRow, index: number, itemName: string) => {
  const date = toDate(row.date);
  const voucherNo = String(row.vch_no ?? '').trim();
  const party = String(row.party ?? '').trim() || 'Unknown';
  return {
    id: crypto.randomUUID(),
    // Same key format as the Tally side, so a voucher arriving from both
    // sources is caught by the duplicate guard rather than counted twice.
    rowKey: buildRowKey(source.company, source.voucherType, date, voucherNo, party, index + 1, itemName),
    source: 'local-excel',
    company: source.company,
    isInterCompany: interCompanyPartyPattern().test(party),
    sourceRowNumber: index + 2, // +2: 1-based, and row 1 is the header
    validationStatus: 'VALID' as const,
    isCancelled: false,
    isOptional: false,
    date,
    financialYear: financialYearOf(date),
    voucherNo,
    party,
  };
};

function parseSalesFile(source: LocalFileSource, engine: ValidationEngine) {
  const rows = readSheet(source);
  if (!rows) return { records: [] as ProcessedSalesRecord[], rows: 0, skipped: 0, missing: true };

  const records: ProcessedSalesRecord[] = [];
  let skipped = 0;

  rows.forEach((raw, index) => {
    const row = raw as ItemLineRow;
    // The DayBook sheet mixes voucher types; only Sales lines belong here.
    if (String(row.vch_type ?? '').trim() && String(row.vch_type).trim() !== source.voucherType) {
      skipped += 1;
      return;
    }
    const itemName = String(row.item_name ?? '').trim();
    if (!itemName) {
      skipped += 1;
      engine.logIssue(`Local ${source.file}`, index + 2, 'Warning', 'MISSING_REQUIRED_COLUMN', 'Item name missing');
      return;
    }

    const base = baseFields(source, row, index, itemName);
    const unit = normaliseUnit(String(row.unit ?? '') || null);
    const quantity = Math.abs(toNumber(row.quantity));

    records.push({
      ...base,
      originalItemName: itemName,
      normalisedItemName: '',
      skuId: null,
      quantity,
      unit,
      // Only kilogram-denominated lines count toward the kg headline.
      quantityKg: unit === 'KGS' ? quantity : 0,
      originalQuantity: quantity,
      originalUnit: unit,
      rate: hasValue(row.rate) ? toNumber(row.rate) : null,
      value: Math.abs(toNumber(row.item_amount)),
    });
  });

  return { records, rows: records.length, skipped, missing: false };
}

function parsePurchaseFile(source: LocalFileSource, engine: ValidationEngine) {
  const rows = readSheet(source);
  if (!rows) return { records: [] as ProcessedPurchaseRecord[], rows: 0, skipped: 0, missing: true };

  const records: ProcessedPurchaseRecord[] = [];
  let skipped = 0;

  rows.forEach((raw, index) => {
    const row = raw as ItemLineRow;
    if (String(row.vch_type ?? '').trim() && String(row.vch_type).trim() !== source.voucherType) {
      skipped += 1;
      return;
    }
    const itemName = String(row.item_name ?? '').trim();
    if (!itemName) {
      skipped += 1;
      engine.logIssue(`Local ${source.file}`, index + 2, 'Warning', 'MISSING_REQUIRED_COLUMN', 'Item name missing');
      return;
    }

    const base = baseFields(source, row, index, itemName);
    const unit = normaliseUnit(String(row.unit ?? '') || null);
    const quantity = Math.abs(toNumber(row.quantity));

    records.push({
      ...base,
      supplier: base.party,
      originalItemName: itemName,
      normalisedItemName: '',
      skuId: null,
      quantity,
      unit,
      quantityKg: unit === 'KGS' ? quantity : 0,
      originalQuantity: quantity,
      originalUnit: unit,
      rate: hasValue(row.rate) ? toNumber(row.rate) : null,
      value: Math.abs(toNumber(row.item_amount)),
      purchaseSource: 'Tally' as const,
    });
  });

  return { records, rows: records.length, skipped, missing: false };
}

function parseReturnsFile(source: LocalFileSource, engine: ValidationEngine) {
  const rows = readSheet(source);
  if (!rows) return { records: [] as ProcessedSalesReturnRecord[], rows: 0, skipped: 0, missing: true };

  const records: ProcessedSalesReturnRecord[] = [];
  let skipped = 0;

  rows.forEach((raw, index) => {
    const row = raw as ItemLineRow;
    const itemName = String(row.item_name ?? '').trim();
    if (!itemName) {
      skipped += 1;
      return;
    }

    const base = baseFields(source, row, index, itemName);
    const unit = normaliseUnit(String(row.unit ?? '') || null);
    // A blank quantity column is the marker for a value-only credit note here,
    // matching how zero-quantity Tally credit-note lines are classified.
    const quantity = hasValue(row.quantity) ? Math.abs(toNumber(row.quantity)) : 0;
    const returnKind = quantity > 0 ? ('PHYSICAL' as const) : ('VALUE_ONLY' as const);

    records.push({
      ...base,
      originalItemName: itemName,
      normalisedItemName: '',
      skuId: null,
      returnKind,
      returnQuantity: quantity,
      unit,
      returnQuantityKg: unit === 'KGS' ? quantity : 0,
      originalQuantity: quantity,
      originalUnit: unit,
      returnValue: Math.abs(toNumber(row.item_amount)),
    });
  });

  const valueOnly = records.filter((r) => r.returnKind === 'VALUE_ONLY').length;
  if (valueOnly > 0) {
    engine.logIssue(
      `Local ${source.file}`,
      undefined,
      'Info',
      'INVALID_RETURN_SEMANTICS',
      `${valueOnly} credit note line(s) carry value but no quantity; classified as value-only adjustments rather than physical returns.`
    );
  }

  return { records, rows: records.length, skipped, missing: false };
}

/**
 * Guesses a stock row's unit from its item name.
 *
 * The Godown Summary's quantity columns are bare numbers with no embedded unit
 * text — unlike Tally's own XML, which gives strings like "288.000 KGS" that
 * `parseTallyQuantity` reads directly. Leaving `unit: null` here made every row
 * fall out of the kilogram total, so "Total Stock Qty" showed 0 despite the
 * value figure being correct. Packing-material items (cartoons, bags, pouches)
 * are piece-counted; everything else in this register is a seed, measured in
 * kilograms — matching the units the same items carry on the Tally side.
 */
const PACKING_MATERIAL_RE = /(pouch|bag\b|bags\b|box\b|carton|sack|laminat|packing|hessian|cylinder|stereo)/i;

function guessStockUnit(itemName: string): string {
  return PACKING_MATERIAL_RE.test(itemName) ? 'NOS' : 'KGS';
}

/**
 * Marks rows that are group subtotals rather than stock items.
 *
 * The Godown Summary is hierarchical — a group such as "Maize" is followed by
 * its member items, and the group's closing value is exactly the sum of those
 * members. The PDF→Excel conversion stripped the indentation that would
 * normally distinguish them, so groups are found structurally: a row is a
 * group when its closing value equals the sum of an unbroken run of rows
 * immediately beneath it. Counting both levels double-counts every grouped
 * item (₹3.14 Cr instead of the true ₹1.57 Cr).
 *
 * Self-validating: the surviving top-level rows must reproduce the sheet's own
 * printed Grand Total, which is asserted by the caller.
 */
function findGroupRows(closingValues: number[]): { parents: Set<number>; children: Set<number> } {
  const parents = new Set<number>();
  const children = new Set<number>();

  for (let i = 0; i < closingValues.length; i++) {
    const target = closingValues[i];
    if (target <= 0) continue;
    let running = 0;
    for (let j = i + 1; j < closingValues.length; j++) {
      running += closingValues[j];
      if (Math.abs(running - target) < 0.01) {
        parents.add(i);
        for (let k = i + 1; k <= j; k++) children.add(k);
        break;
      }
      if (running > target + 0.01) break; // overshot — row i is not a parent
    }
  }

  return { parents, children };
}

/**
 * The Godown Summary sheet is a printed report, not a table: ~14 rows of
 * letterhead, then a two-tier header splitting Opening / Inwards / Outwards /
 * Closing into (qty, rate, value) triples, then grouped items, then a Grand
 * Total. Rows are read positionally.
 */
function parseStockFile(source: LocalFileSource, engine: ValidationEngine) {
  const full = path.join(DATA_DIR, source.file);
  if (!fs.existsSync(full)) return { records: [] as ProcessedStockRecord[], rows: 0, skipped: 0, missing: true };

  const wb = readWorkbook(full);
  const sheetName = source.sheet && wb.SheetNames.includes(source.sheet) ? source.sheet : wb.SheetNames[0];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, blankrows: false });

  const FIRST_ITEM_ROW = 15; // letterhead and the two-tier header band sit above
  const CLOSING_QTY = 10;
  const CLOSING_RATE = 11;
  const CLOSING_VALUE = 12;

  interface RawStockRow {
    gridIndex: number;
    name: string;
    quantity: number;
    rate: number;
    value: number;
  }

  const raw: RawStockRow[] = [];
  let grandTotalValue: number | null = null;
  let skipped = 0;

  grid.forEach((row, index) => {
    const name = String(row?.[0] ?? '').trim();
    if (!name) return;

    if (/^grand total$/i.test(name)) {
      grandTotalValue = toNumber(row[CLOSING_VALUE]);
      return;
    }
    if (index < FIRST_ITEM_ROW) {
      skipped += 1;
      return;
    }

    raw.push({
      gridIndex: index,
      name,
      quantity: toNumber(row[CLOSING_QTY]),
      rate: toNumber(row[CLOSING_RATE]),
      value: toNumber(row[CLOSING_VALUE]),
    });
  });

  const { parents } = findGroupRows(raw.map((r) => r.value));
  const snapshotDate = new Date();

  // Group rows are kept but marked EXCLUDED rather than dropped, so the
  // reconciliation waterfall shows them being removed instead of them
  // vanishing between the source file and the totals.
  const records: ProcessedStockRecord[] = raw.map((r, i) => {
    const unit = guessStockUnit(r.name);
    return {
    id: crypto.randomUUID(),
    rowKey: `${source.company}|${source.financialYear ?? 'noyear'}|stock|${r.name}`,
    source: 'local-excel',
    company: source.company,
    sourceRowNumber: r.gridIndex + 1,
    validationStatus: parents.has(i) ? ('EXCLUDED' as const) : ('VALID' as const),
    isCancelled: false,
    isOptional: false,
    // Closing stock has no date of its own; it is the balance as at this
    // register's year end, which is what makes snapshots separable by year.
    financialYear: source.financialYear ?? null,
    snapshotDate,
    godown: 'Main Location',
    originalItemName: r.name,
    normalisedItemName: '',
    skuId: null,
    closingQuantity: r.quantity,
    unit,
    closingQuantityKg: unit === 'KGS' ? r.quantity : 0,
    originalClosingQuantity: r.quantity,
    originalUnit: unit,
    closingRate: r.rate || null,
    closingValue: r.value,
    };
  });

  if (parents.size > 0) {
    engine.logIssue(
      `Local ${source.file}`,
      undefined,
      'Info',
      'POSSIBLE_DUPLICATE_ROW',
      `${parents.size} stock group subtotal row(s) excluded (each one's value is the sum of the item rows beneath it).`
    );
  }

  // The report prints its own total, so a parsing slip is caught here rather
  // than surfacing later as an unexplained reconciliation variance.
  if (grandTotalValue !== null) {
    const total: number = grandTotalValue;
    const counted = records
      .filter((r) => r.validationStatus !== 'EXCLUDED')
      .reduce((s, r) => s + (r.closingValue || 0), 0);
    if (Math.abs(counted - total) > 1) {
      engine.logIssue(
        `Local ${source.file}`,
        undefined,
        'Critical',
        'INVALID_VALUE',
        `Closing stock items sum to ${counted.toFixed(2)} but the sheet's own Grand Total says ${total.toFixed(2)}. Group detection or column alignment may be wrong.`
      );
    }
  }

  return { records, rows: records.length, skipped, missing: false };
}

export function runLocalFileSync(engine: ValidationEngine): LocalFileSyncResult {
  const result: LocalFileSyncResult = { sales: [], purchase: [], returns: [], stock: [], files: [] };

  for (const source of LOCAL_FILE_SOURCES) {
    let outcome: { rows: number; skipped: number; missing: boolean };

    switch (source.dataset) {
      case 'sales': {
        const r = parseSalesFile(source, engine);
        result.sales.push(...r.records);
        outcome = r;
        break;
      }
      case 'purchase': {
        const r = parsePurchaseFile(source, engine);
        result.purchase.push(...r.records);
        outcome = r;
        break;
      }
      case 'returns': {
        const r = parseReturnsFile(source, engine);
        result.returns.push(...r.records);
        outcome = r;
        break;
      }
      case 'stock': {
        const r = parseStockFile(source, engine);
        result.stock.push(...r.records);
        outcome = r;
        break;
      }
    }

    if (outcome.missing) {
      engine.logIssue(
        `Local ${source.file}`,
        undefined,
        'Critical',
        'MISSING_REQUIRED_COLUMN',
        `Expected file data/approval/${source.file} was not found.`
      );
    }

    result.files.push({
      file: source.file,
      dataset: source.dataset,
      company: source.company,
      rows: outcome.rows,
      skipped: outcome.skipped,
      ...(outcome.missing ? { missing: true } : {}),
    });
  }

  return result;
}
