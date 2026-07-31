"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

interface Freshness {
  ageMinutes: number | null;
  isStale: boolean;
  staleAfterMinutes: number;
  lastSyncFailed: boolean;
  lastSyncError: string | null;
}

function describeAge(minutes: number | null): string {
  if (minutes === null) return 'never';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * Warns when the displayed figures are stale or the last sync failed.
 *
 * A failed sync leaves the previous snapshot in place, which otherwise looks
 * identical to fresh data — the dashboard sat three days stale without any
 * indication before this existed.
 */
export function FreshnessBanner() {
  const [freshness, setFreshness] = useState<Freshness | null>(null);

  useEffect(() => {
    const load = () =>
      fetch('/api/tally/status')
        .then((res) => res.json())
        .then((json) => setFreshness(json.freshness ?? null))
        .catch(() => setFreshness(null));

    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!freshness || (!freshness.isStale && !freshness.lastSyncFailed)) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-300 text-amber-900 px-4 py-2.5 text-sm">
      <div className="max-w-7xl mx-auto flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1">
          {freshness.lastSyncFailed ? (
            <>
              <span className="font-semibold">Last Tally sync failed.</span> Figures below are from
              the previous successful sync ({describeAge(freshness.ageMinutes)}).
              {freshness.lastSyncError && (
                <span className="block text-amber-800/80 text-xs mt-0.5">
                  {freshness.lastSyncError}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="font-semibold">Data may be stale.</span> Last updated{' '}
              {describeAge(freshness.ageMinutes)}, beyond the {freshness.staleAfterMinutes} minute
              threshold.
            </>
          )}
        </div>
        <Link href="/sync" className="underline font-medium shrink-0">
          Go to sync
        </Link>
      </div>
    </div>
  );
}
