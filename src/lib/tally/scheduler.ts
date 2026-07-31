import { runFullIngest } from '../ingest/fetchAll';
import { getTallyCompanies } from './companies';

let started = false;

/**
 * Background refresh of the whole dataset.
 *
 * Deliberately calls `runFullIngest` rather than `runTallySync`: persistence is
 * a full-table replace, so a Tally-only run would delete the FY2025-26 records
 * that come from the converted registers in data/approval. Every scheduled run
 * must therefore load every source, exactly like the "Fetch All Data" button.
 */
export function startTallyScheduler() {
  if (started) return;
  started = true;

  // Reads the same configuration the sync itself uses. An earlier version
  // checked the singular TALLY_COMPANY, which multi-company setups no longer
  // set — so background sync silently disabled itself while looking configured.
  try {
    getTallyCompanies();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[tally-sync] background sync disabled: ${message} Set TALLY_COMPANIES in .env.local.`);
    return;
  }

  const intervalMinutes = Number(process.env.TALLY_SYNC_INTERVAL_MINUTES) || 5;
  const intervalMs = intervalMinutes * 60 * 1000;

  let running = false;

  const tick = async () => {
    // Tally's gateway is single-threaded, and overlapping requests are what
    // wedged it during testing, so a slow run skips the next tick rather than
    // stacking on top of it.
    if (running) {
      console.warn('[tally-sync] previous run still in progress; skipping this tick');
      return;
    }
    running = true;
    try {
      const result = await runFullIngest();
      if (result.success) {
        console.log(
          `[tally-sync] synced at ${result.syncedAt} (${result.financialYears?.join(', ') || 'no years found'})`,
          result.counts
        );
      } else {
        console.error(`[tally-sync] sync failed at ${result.syncedAt}: ${result.error}`);
      }
    } catch (err) {
      console.error('[tally-sync] sync threw:', err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };

  // Fire an initial sync shortly after startup, then on the configured interval.
  setTimeout(tick, 2000);
  setInterval(tick, intervalMs);

  console.log(`[tally-sync] background sync scheduled every ${intervalMinutes} minute(s)`);
}
