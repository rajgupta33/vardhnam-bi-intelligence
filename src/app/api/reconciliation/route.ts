import { NextResponse } from 'next/server';
import { loadReconciliation, loadLastUpdated } from '@/lib/db/store';

/**
 * Serves the stored leakage waterfall and ledger checks.
 *
 * The report is computed during sync rather than on request, so what is served
 * is exactly what the stored dataset produced.
 */
export async function GET() {
  const [report, lastUpdated] = await Promise.all([loadReconciliation(), loadLastUpdated()]);

  if (!report) {
    return NextResponse.json(
      { error: 'No reconciliation report stored yet. Run a Tally sync first.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ report, lastUpdated });
}
