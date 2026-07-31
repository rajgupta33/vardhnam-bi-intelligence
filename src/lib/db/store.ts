import { Pool } from 'pg';
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

/**
 * Shared Postgres store.
 *
 * Replaces the previous local SQLite file, which could only ever be read by the
 * machine holding it. Two processes now need the same data: the sync, which runs
 * next to Tally because only that machine can reach the gateway, and the hosted
 * dashboard, which is read-only. A managed database is the one place both can
 * meet — the dashboard cannot pull from Tally, so the sync has to push here.
 *
 * Rows stay in the JSONB shape the SQLite version used. That is deliberately a
 * like-for-like port: the relational schema in the expansion plan is a separate,
 * larger change, and mixing it into a storage migration would make a failure
 * impossible to attribute. JSONB (not TEXT) so that work can index into these
 * columns later without another rewrite.
 */

const DATA_TABLES = [
  'sales',
  'purchase',
  'returns',
  'purchase_returns',
  'stock',
  'adjustments',
] as const;

const ALL_TABLES = [...DATA_TABLES, 'issues', 'sku_master'] as const;

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Add the Postgres connection string to .env.local locally, ' +
        'and to the project environment variables when deploying.'
    );
  }

  pool = new Pool({
    connectionString,
    // Managed Postgres requires TLS; the hosted certificate chain is not in the
    // Node trust store, so verification is relaxed rather than TLS disabled.
    ssl: { rejectUnauthorized: false },
    // Serverless invocations are short-lived and numerous. A small ceiling per
    // instance keeps a burst of requests from exhausting the connection limit.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
  return pool;
}

/** Creates the tables once per process; concurrent callers await the same promise. */
function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const ddl = ALL_TABLES.map(
      (t) => `CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data JSONB NOT NULL);`
    ).join('\n');

    await getPool().query(
      `${ddl}\nCREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`
    );
  })();

  // A failed attempt must not be cached, or every later call reuses the rejection.
  schemaReady.catch(() => {
    schemaReady = null;
  });

  return schemaReady;
}

const DATE_FIELDS: Record<string, string[]> = {
  sales: ['date'],
  purchase: ['date'],
  returns: ['date'],
  purchase_returns: ['date'],
  stock: ['snapshotDate'],
  adjustments: ['date'],
};

/** JSON has no date type, so the columns that hold one are revived on read. */
function reviveDates<T>(table: string, record: Record<string, unknown>): T {
  for (const field of DATE_FIELDS[table] || []) {
    if (record[field]) record[field] = new Date(record[field] as string);
  }
  return record as T;
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

/**
 * Postgres caps a statement at 65535 parameters and each row costs two, so rows
 * are inserted in chunks well under that rather than one statement per row —
 * a full dataset is a few thousand rows and per-row round trips are slow over a
 * network connection.
 */
const INSERT_CHUNK = 500;

async function replaceTable(
  client: { query: (q: string, v?: unknown[]) => Promise<unknown> },
  table: string,
  rows: { id: string }[]
) {
  await client.query(`DELETE FROM ${table}`);

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const values: unknown[] = [];
    const placeholders = chunk
      .map((row, n) => {
        values.push(row.id, JSON.stringify(row));
        return `($${n * 2 + 1}, $${n * 2 + 2})`;
      })
      .join(',');

    await client.query(
      `INSERT INTO ${table} (id, data) VALUES ${placeholders}
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      values
    );
  }
}

export async function saveProcessedData(data: ProcessedDataset) {
  await ensureSchema();
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    await replaceTable(client, 'sales', data.sales);
    await replaceTable(client, 'purchase', data.purchase);
    await replaceTable(client, 'returns', data.returns);
    await replaceTable(client, 'purchase_returns', data.purchaseReturns);
    await replaceTable(client, 'stock', data.stock);
    await replaceTable(client, 'adjustments', data.adjustments);
    await replaceTable(
      client,
      'issues',
      data.issues.map((i) => ({ ...i, id: i.issueId }))
    );
    await replaceTable(
      client,
      'sku_master',
      data.skuMaster.map((s) => ({ ...s, id: s.skuId }))
    );

    await putMeta(client, 'lastUpdated', new Date().toISOString());
    if (data.reconciliation) {
      await putMeta(client, 'reconciliation', JSON.stringify(data.reconciliation));
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function putMeta(
  client: { query: (q: string, v?: unknown[]) => Promise<unknown> },
  key: string,
  value: string
) {
  await client.query(
    'INSERT INTO metadata (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, value]
  );
}

async function readMeta(key: string): Promise<string | null> {
  await ensureSchema();
  const res = await getPool().query<{ value: string }>('SELECT value FROM metadata WHERE key = $1', [key]);
  return res.rows[0]?.value ?? null;
}

/** Reads just the freshness timestamp, without materialising every dataset. */
export async function loadLastUpdated(): Promise<Date | null> {
  const value = await readMeta('lastUpdated');
  return value ? new Date(value) : null;
}

export async function loadReconciliation(): Promise<ReconciliationReport | null> {
  const value = await readMeta('reconciliation');
  return value ? JSON.parse(value) : null;
}

/**
 * Total rows currently stored across the data tables.
 *
 * Used to guard an unattended sync: Tally answers with an empty result rather
 * than an error when its company files are not loaded, so without this check a
 * background run would happily replace a good dataset with nothing.
 */
export async function countStoredRows(): Promise<number> {
  await ensureSchema();
  const parts = DATA_TABLES.map((t) => `(SELECT COUNT(*) FROM ${t})`).join(' + ');
  const res = await getPool().query<{ total: string }>(`SELECT ${parts} AS total`);
  return Number(res.rows[0]?.total ?? 0);
}

async function loadTable<T>(table: string): Promise<T[]> {
  const res = await getPool().query<{ data: Record<string, unknown> }>(`SELECT data FROM ${table}`);
  return res.rows.map((r) => reviveDates<T>(table, r.data));
}

export async function loadProcessedData() {
  await ensureSchema();

  // One round trip per table rather than eight in sequence — over a network
  // connection the latency, not the query, is what costs.
  const [sales, purchase, returns, purchaseReturns, stock, adjustments, issues, skuMaster, lastUpdated] =
    await Promise.all([
      loadTable<ProcessedSalesRecord>('sales'),
      loadTable<ProcessedPurchaseRecord>('purchase'),
      loadTable<ProcessedSalesReturnRecord>('returns'),
      loadTable<ProcessedPurchaseReturnRecord>('purchase_returns'),
      loadTable<ProcessedStockRecord>('stock'),
      loadTable<ProcessedAdjustmentRecord>('adjustments'),
      loadTable<ValidationIssue>('issues'),
      loadTable<SkuMasterRecord>('sku_master'),
      loadLastUpdated(),
    ]);

  return { sales, purchase, returns, purchaseReturns, stock, adjustments, issues, skuMaster, lastUpdated };
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

export async function saveSyncResult(result: SyncResultRecord) {
  await ensureSchema();
  await putMeta(getPool(), 'lastSyncResult', JSON.stringify(result));
}

export async function loadSyncResult(): Promise<SyncResultRecord | null> {
  const value = await readMeta('lastSyncResult');
  return value ? JSON.parse(value) : null;
}

export async function clearAllData() {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const table of ALL_TABLES) {
      await client.query(`DELETE FROM ${table}`);
    }
    await client.query('DELETE FROM metadata');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
