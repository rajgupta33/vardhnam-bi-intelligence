import { NextResponse } from 'next/server';
import { loadReconciliation, loadLastUpdated, describeDbError } from '@/lib/db/store';

/**
 * Serves the stored leakage waterfall and ledger checks.
 *
 * The report is computed during sync rather than on request, so what is served
 * is exactly what the stored dataset produced.
 */
export async function GET() {
  try {
    const [report, lastUpdated] = await Promise.all([loadReconciliation(), loadLastUpdated()]);

    if (!report) {
      return NextResponse.json(
        { error: 'No reconciliation report stored yet. Run a Tally sync first.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ report, lastUpdated });
  } catch (err) {
    const error = describeDbError(err);
    console.error('[api/reconciliation] failed:', error);
    return NextResponse.json({ error }, { status: 500 });
  }
}
