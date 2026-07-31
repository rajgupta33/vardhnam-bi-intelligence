/**
 * Copies the local SQLite dataset into Postgres, once.
 *
 * The sync could simply be re-run against the new database, but that needs Tally
 * open with all six company files loaded — and the SQLite file already holds a
 * verified snapshot whose six ledger checks reconcile to zero. Moving the exact
 * rows keeps that proof intact, so any later discrepancy is attributable to the
 * storage change rather than to a fresh extraction.
 *
 *   npx tsx --experimental-sqlite scripts/migrate-to-postgres.ts [--force]
 *
 * Refuses to run against a non-empty target unless --force is passed.
 */
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';

const SQLITE_PATH = path.join(process.cwd(), 'data', 'vardhnam.db');
const FORCE = process.argv.includes('--force');

const TABLES = [
  'sales',
  'purchase',
  'returns',
  'purchase_returns',
  'stock',
  'adjustments',
  'issues',
  'sku_master',
] as const;

/**
 * Standalone scripts do not get Next.js's .env.local loading, and the connection
 * string must never be hardcoded — this repo is public.
 */
function loadEnvLocal() {
  if (process.env.DATABASE_URL) return;

  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

async function main() {
  loadEnvLocal();

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to .env.local first.');
    process.exit(1);
  }
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`No SQLite database at ${SQLITE_PATH}.`);
    process.exit(1);
  }

  const sqlite = new DatabaseSync(SQLITE_PATH);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const ddl = TABLES.map(
    (t) => `CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data JSONB NOT NULL);`
  ).join('\n');
  await pool.query(`${ddl}\nCREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);

  const existing = await pool.query<{ total: string }>(
    `SELECT ${TABLES.map((t) => `(SELECT COUNT(*) FROM ${t})`).join(' + ')} AS total`
  );
  const already = Number(existing.rows[0]?.total ?? 0);
  if (already > 0 && !FORCE) {
    console.error(`Target already holds ${already} rows. Re-run with --force to replace them.`);
    process.exit(1);
  }

  const client = await pool.connect();
  let grandTotal = 0;

  try {
    await client.query('BEGIN');

    for (const table of TABLES) {
      const rows = sqlite.prepare(`SELECT id, data FROM ${table}`).all() as { id: string; data: string }[];
      await client.query(`DELETE FROM ${table}`);

      // Chunked: Postgres caps a statement at 65535 parameters, two per row.
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const values: unknown[] = [];
        const placeholders = chunk
          .map((r, n) => {
            values.push(r.id, r.data);
            return `($${n * 2 + 1}, $${n * 2 + 2})`;
          })
          .join(',');
        await client.query(
          `INSERT INTO ${table} (id, data) VALUES ${placeholders}
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
          values
        );
      }

      grandTotal += rows.length;
      console.log(`  ${table.padEnd(18)} ${String(rows.length).padStart(6)} rows`);
    }

    const meta = sqlite.prepare('SELECT key, value FROM metadata').all() as { key: string; value: string }[];
    await client.query('DELETE FROM metadata');
    for (const m of meta) {
      await client.query(
        'INSERT INTO metadata (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [m.key, m.value]
      );
    }
    console.log(`  ${'metadata'.padEnd(18)} ${String(meta.length).padStart(6)} keys`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Read back independently of the write transaction, so the reported figure is
  // what the database actually holds rather than what was submitted.
  const verify = await pool.query<{ total: string }>(
    `SELECT ${TABLES.map((t) => `(SELECT COUNT(*) FROM ${t})`).join(' + ')} AS total`
  );
  const landed = Number(verify.rows[0]?.total ?? 0);

  console.log(`\ncopied ${grandTotal} rows, target now holds ${landed}`);
  if (landed !== grandTotal) {
    console.error('MISMATCH — the target row count does not match what was copied.');
    process.exit(1);
  }
  console.log('OK');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
