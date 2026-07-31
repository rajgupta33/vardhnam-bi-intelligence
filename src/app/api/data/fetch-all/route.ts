import { NextResponse } from 'next/server';
import { runFullIngest } from '@/lib/ingest/fetchAll';

/**
 * Loads every configured source in one pass — Tally for FY2024-25 and the
 * converted registers in data/approval for FY2025-26 — merging them into a
 * single dataset before SKU mapping and reconciliation.
 *
 * Returns 200 with per-source outcomes even when one source failed, so a
 * partial load is visible rather than looking like a total failure; only a
 * complete failure of every source returns 500.
 */
export async function POST() {
  try {
    const result = await runFullIngest();
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error: unknown) {
    console.error('[fetch-all] failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error during full ingest';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
