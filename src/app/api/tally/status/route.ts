import { NextResponse } from 'next/server';
import { loadLastUpdated, loadSyncResult } from '@/lib/db/store';
import { getTallyCompanies } from '@/lib/tally/companies';

/** Data older than this is treated as stale, so a failed sync cannot pass unnoticed. */
const STALE_AFTER_MINUTES = Number(process.env.TALLY_STALE_AFTER_MINUTES || 60);

export async function GET() {
  const [lastSync, lastUpdated] = await Promise.all([loadSyncResult(), loadLastUpdated()]);

  const ageMinutes = lastUpdated ? (Date.now() - lastUpdated.getTime()) / 60000 : null;
  const isStale = ageMinutes === null || ageMinutes > STALE_AFTER_MINUTES;

  let companies: { name: string; label: string }[] = [];
  let companyConfigError: string | null = null;
  try {
    companies = getTallyCompanies();
  } catch (err) {
    companyConfigError = err instanceof Error ? err.message : 'TALLY_COMPANIES is not configured.';
  }

  return NextResponse.json({
    lastSync,
    lastUpdated,
    /**
     * The dashboard previously kept rendering the last good snapshot after a
     * failed sync with no indication, so freshness is reported explicitly.
     */
    freshness: {
      ageMinutes,
      isStale,
      staleAfterMinutes: STALE_AFTER_MINUTES,
      lastSyncFailed: lastSync ? !lastSync.success : false,
      lastSyncError: lastSync && !lastSync.success ? lastSync.error ?? null : null,
    },
    tallyUrl: process.env.TALLY_URL || 'http://localhost:9000',
    companies,
    companyConfigError,
    syncIntervalMinutes: process.env.TALLY_SYNC_INTERVAL_MINUTES
      ? Number(process.env.TALLY_SYNC_INTERVAL_MINUTES)
      : 5,
  });
}
