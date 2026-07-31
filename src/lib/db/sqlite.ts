import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import {
  ProcessedSalesRecord,
  ProcessedPurchaseRecord,
  ProcessedSalesReturnRecord,
  ProcessedPurchaseReturnRecord,
  ProcessedStockRecord,
  ProcessedAdjustmentRecord,
  ValidationIssue,
  SkuMasterRecord,
} from '@/types';
import type { ReconciliationReport } from '../reconciliation';

const DB_PATH = path.join(process.cwd(), 'data', 'vardhnam.db');

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS purchase (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS returns (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS purchase_returns (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS stock (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS adjustments (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS issues (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sku_master (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return db;
}

const DATE_FIELDS: Record<string, string[]> = {
  sales: ['date'],
  purchase: ['date'],
  returns: ['date'],
  purchase_returns: ['date'],
  stock: ['snapshotDate'],
  adjustments: ['date'],
};

function reviveDates<T>(table: string, record: Record<string, unknown>): T {
  for (const field of DATE_FIELDS[table] || []) {
    if (record[field]) record[field] = new Date(record[field] as string);
  }
  return record as T;
}

function replaceTable(database: DatabaseSync, table: string, rows: { id: string }[]) {
  database.exec(`DELETE FROM ${table}`);
  const insert = database.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`);
  for (const row of rows) {
    insert.run(row.id, JSON.stringify(row));
  }
}

export interface ProcessedDataset {
  sales: ProcessedSalesRecord[];
  purchase: ProcessedPurchaseRecord[];
  returns: ProcessedSalesReturnRecord[];
  purchaseReturns: ProcessedPurchaseReturnRecord[];
  stock: ProcessedStockRecord[];
  adjustments: ProcessedAdjustmentRecord[];
  issues: ValidationIssue[];
  skuMaster: SkuMasterRecord[];
  reconciliation?: ReconciliationReport;
}

function putMeta(database: DatabaseSync, key: string, value: string) {
  database
    .prepare('INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

export function saveProcessedData(data: ProcessedDataset) {
  const database = getDb();

  database.exec('BEGIN');
  try {
    replaceTable(database, 'sales', data.sales);
    replaceTable(database, 'purchase', data.purchase);
    replaceTable(database, 'returns', data.returns);
    replaceTable(database, 'purchase_returns', data.purchaseReturns);
    replaceTable(database, 'stock', data.stock);
    replaceTable(database, 'adjustments', data.adjustments);
    replaceTable(database, 'issues', data.issues.map((i) => ({ ...i, id: i.issueId })));
    replaceTable(database, 'sku_master', data.skuMaster.map((s) => ({ ...s, id: s.skuId })));

    putMeta(database, 'lastUpdated', new Date().toISOString());
    if (data.reconciliation) {
      putMeta(database, 'reconciliation', JSON.stringify(data.reconciliation));
    }

    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

/** Reads just the freshness timestamp, without materialising every dataset. */
export function loadLastUpdated(): Date | null {
  const database = getDb();
  const row = database.prepare('SELECT value FROM metadata WHERE key = ?').get('lastUpdated') as
    | { value: string }
    | undefined;
  return row ? new Date(row.value) : null;
}

export function loadReconciliation(): ReconciliationReport | null {
  const database = getDb();
  const row = database.prepare('SELECT value FROM metadata WHERE key = ?').get('reconciliation') as
    | { value: string }
    | undefined;
  return row ? JSON.parse(row.value) : null;
}

/**
 * Total rows currently stored across the data tables.
 *
 * Used to guard an unattended sync: Tally answers with an empty result rather
 * than an error when its company files are not loaded, so without this check a
 * background run would happily replace a good dataset with nothing.
 */
export function countStoredRows(): number {
  const database = getDb();
  let total = 0;
  for (const table of ['sales', 'purchase', 'returns', 'purchase_returns', 'stock', 'adjustments']) {
    const row = database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    total += Number(row.n);
  }
  return total;
}

function loadTable<T>(table: string): T[] {
  const database = getDb();
  const rows = database.prepare(`SELECT data FROM ${table}`).all() as { data: string }[];
  return rows.map((r) => reviveDates<T>(table, JSON.parse(r.data)));
}

export function loadProcessedData() {
  const database = getDb();
  const meta = database.prepare('SELECT value FROM metadata WHERE key = ?').get('lastUpdated') as
    | { value: string }
    | undefined;

  return {
    sales: loadTable<ProcessedSalesRecord>('sales'),
    purchase: loadTable<ProcessedPurchaseRecord>('purchase'),
    returns: loadTable<ProcessedSalesReturnRecord>('returns'),
    purchaseReturns: loadTable<ProcessedPurchaseReturnRecord>('purchase_returns'),
    stock: loadTable<ProcessedStockRecord>('stock'),
    adjustments: loadTable<ProcessedAdjustmentRecord>('adjustments'),
    issues: loadTable<ValidationIssue>('issues'),
    skuMaster: loadTable<SkuMasterRecord>('sku_master'),
    lastUpdated: meta ? new Date(meta.value) : null,
  };
}

export interface SyncResultRecord {
  success: boolean;
  syncedAt: string;
  error?: string;
  /**
   * The outer date bound requested from Tally. Not a per-year filter — see
   * financialYears below for what was actually found. Kept mainly as a sanity
   * bound and for debugging.
   */
  fetchedRange?: { fromDate: string; toDate: string };
  /** Distinct financial years found in this sync's data, e.g. ["FY2024-25"]. */
  financialYears?: string[];
  /**
   * Per-source outcome when more than one source was loaded. A source that
   * failed is recorded here with its error rather than failing the whole run,
   * so a partial load is visible instead of silently halving the dataset.
   */
  sources?: {
    source: string;
    ok: boolean;
    error?: string;
    counts: {
      sales: number;
      purchase: number;
      returns: number;
      purchaseReturns: number;
      stock: number;
      adjustments: number;
    };
    detail?: unknown;
  }[];
  /**
   * Present only when the same voucher line was found in more than one Tally
   * company file, meaning its value is double-counted. Absent when clean.
   */
  duplicates?: {
    byDataset: Record<string, number>;
    total: number;
    samples: { dataset: string; rowKey: string; occurrences: number }[];
  };
  counts?: {
    sales: number;
    purchase: number;
    returns: number;
    purchaseReturns: number;
    stock: number;
    adjustments: number;
    issues: number;
  };
  /** Per-company row counts, so a company that failed to load is obvious. */
  companies?: {
    label: string;
    name: string;
    sales: number;
    purchase: number;
    returns: number;
    purchaseReturns: number;
    stock: number;
    adjustments: number;
  }[];
  /** Per-dataset extraction counters, including anything the parser rejected. */
  extraction?: Record<string, unknown>;
  /** Variance against Tally's own group totals, when expected values are configured. */
  ledgerChecks?: {
    label: string;
    company: string;
    financialYear: string | null;
    computed: number;
    expected: number | null;
    variance: number | null;
  }[];
}

export function saveSyncResult(result: SyncResultRecord) {
  const database = getDb();
  database
    .prepare('INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('lastSyncResult', JSON.stringify(result));
}

export function loadSyncResult(): SyncResultRecord | null {
  const database = getDb();
  const row = database.prepare('SELECT value FROM metadata WHERE key = ?').get('lastSyncResult') as
    | { value: string }
    | undefined;
  return row ? JSON.parse(row.value) : null;
}

export function clearAllData() {
  const database = getDb();
  for (const table of [
    'sales',
    'purchase',
    'returns',
    'purchase_returns',
    'stock',
    'adjustments',
    'issues',
    'sku_master',
  ]) {
    database.exec(`DELETE FROM ${table}`);
  }
  database.exec(`DELETE FROM metadata`);
}
