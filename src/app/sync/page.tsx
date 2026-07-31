"use client";

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RefreshCcw, CheckCircle2, XCircle, Clock, Server, AlertTriangle, Database } from 'lucide-react';

interface StatusResponse {
  lastSync: {
    success: boolean;
    syncedAt: string;
    error?: string;
    fetchedRange?: { fromDate: string; toDate: string };
    financialYears?: string[];
    duplicates?: { byDataset: Record<string, number>; total: number };
    sources?: {
      source: string;
      ok: boolean;
      error?: string;
      counts: { sales: number; purchase: number; returns: number; purchaseReturns: number; stock: number; adjustments: number };
    }[];
    counts?: Record<string, number>;
    companies?: { label: string; name: string; sales: number; purchase: number; returns: number; purchaseReturns: number; stock: number; adjustments: number }[];
  } | null;
  lastUpdated: string | null;
  tallyUrl: string;
  companies: { name: string; label: string }[];
  companyConfigError: string | null;
  syncIntervalMinutes: number;
}

/** Renders Tally's YYYYMMDD date format as DD-MMM-YYYY. */
function formatTallyDate(d: string): string {
  if (!/^\d{8}$/.test(d)) return d;
  const date = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8))));
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

async function fetchStatus(): Promise<StatusResponse | null> {
  try {
    const res = await fetch('/api/tally/status');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default function SyncPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [running, setRunning] = useState<null | 'tally' | 'all'>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () =>
      fetchStatus().then((data) => {
        if (data) setStatus(data);
      });
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const runIngest = async (mode: 'tally' | 'all') => {
    setRunning(mode);
    setError('');
    try {
      const endpoint = mode === 'all' ? '/api/data/fetch-all' : '/api/tally/sync';
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fetch failed');
      const refreshed = await fetchStatus();
      if (refreshed) setStatus(refreshed);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setRunning(null);
    }
  };

  const lastSync = status?.lastSync;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Data Sync</h1>
        <p className="text-slate-500 mt-1">
          Tally supplies FY2024-25; the converted registers in data/approval supply FY2025-26 until
          that year is available from Tally directly.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-600" />
            Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-500">Tally Gateway</div>
              <div className="font-medium text-slate-900">{status?.tallyUrl || '—'}</div>
            </div>
            <div>
              <div className="text-slate-500">Companies</div>
              <div className="font-medium text-slate-900">
                {status?.companyConfigError ? (
                  <span className="text-red-600">{status.companyConfigError}</span>
                ) : status?.companies.length ? (
                  // Deduped: one file per financial year means a label repeats.
                  Array.from(new Set(status.companies.map((c) => c.label))).join(', ')
                ) : (
                  'Not configured'
                )}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Background sync interval</div>
              <div className="font-medium text-slate-900">Every {status?.syncIntervalMinutes ?? '—'} minute(s)</div>
            </div>
            <div>
              <div className="text-slate-500">Data last saved</div>
              <div className="font-medium text-slate-900">
                {status?.lastUpdated ? new Date(status.lastUpdated).toLocaleString('en-IN') : 'Never'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => runIngest('all')} disabled={running !== null}>
              <Database className={cn('mr-2 h-4 w-4', running === 'all' && 'animate-pulse')} />
              {running === 'all' ? 'Fetching all data...' : 'Fetch All Data'}
            </Button>
            <Button variant="outline" onClick={() => runIngest('tally')} disabled={running !== null}>
              <RefreshCcw className={cn('mr-2 h-4 w-4', running === 'tally' && 'animate-spin')} />
              {running === 'tally' ? 'Syncing...' : 'Tally Only'}
            </Button>
            <span className="text-xs text-slate-500">
              Fetch All Data loads Tally and the local registers together. Tally Only refreshes the
              Tally years and drops the local ones.
            </span>
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-900 rounded-md text-sm border border-red-200">{error}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last Sync Result</CardTitle>
        </CardHeader>
        <CardContent>
          {!lastSync ? (
            <div className="text-center p-8 text-slate-500 flex flex-col items-center">
              <Clock className="h-10 w-10 text-slate-300 mb-3" />
              <p>No sync has run yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {lastSync.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="font-medium text-slate-900">
                  {lastSync.success ? 'Success' : 'Failed'}
                </span>
                <span className="text-slate-500 text-sm">
                  at {new Date(lastSync.syncedAt).toLocaleString('en-IN')}
                </span>
              </div>

              {lastSync.error && (
                <div className="p-4 bg-red-50 text-red-900 rounded-md text-sm border border-red-200">
                  {lastSync.error}
                </div>
              )}

              {lastSync.fetchedRange && (
                <div className="text-sm rounded-md p-3 border bg-slate-50 border-slate-200 text-slate-700">
                  Fetched {formatTallyDate(lastSync.fetchedRange.fromDate)} to{' '}
                  {formatTallyDate(lastSync.fetchedRange.toDate)}
                  {lastSync.financialYears && lastSync.financialYears.length > 0 && (
                    <>
                      {' '}
                      — found {lastSync.financialYears.length === 1 ? 'financial year' : 'financial years'}:{' '}
                      <strong>{lastSync.financialYears.join(', ')}</strong>
                    </>
                  )}
                </div>
              )}

              {lastSync.sources && lastSync.sources.length > 0 && (
                <div className="space-y-2">
                  {lastSync.sources.map((s) => (
                    <div
                      key={s.source}
                      className={cn(
                        'rounded-md border p-3 text-sm',
                        s.ok ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-200 text-red-900'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {s.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                        )}
                        <span className="font-medium">
                          {s.source === 'tally' ? 'Tally' : 'Local registers (data/approval)'}
                        </span>
                        {s.ok ? (
                          <span className="text-slate-600 text-xs">
                            sales {s.counts.sales} · purchase {s.counts.purchase} · returns {s.counts.returns} ·
                            purch. ret. {s.counts.purchaseReturns} · stock {s.counts.stock} · adj {s.counts.adjustments}
                          </span>
                        ) : (
                          <span className="text-xs">{s.error}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {lastSync.duplicates && lastSync.duplicates.total > 0 && (
                <div className="p-4 bg-red-50 text-red-900 rounded-md text-sm border border-red-200 flex gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>{lastSync.duplicates.total} duplicate row(s) detected.</strong> The same
                    voucher line was found in more than one Tally company file, so its value is
                    counted twice. Check whether the configured companies overlap in date range.
                    <span className="block mt-1 text-xs">
                      {Object.entries(lastSync.duplicates.byDataset)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' · ')}
                    </span>
                  </span>
                </div>
              )}

              {lastSync.counts && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {Object.entries(lastSync.counts).map(([key, value]) => (
                    <div key={key} className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-slate-500 capitalize">{key}</div>
                      <div className="text-xl font-bold text-slate-900">{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {lastSync.companies && lastSync.companies.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-slate-500">
                        <th className="py-2 font-medium">Company</th>
                        <th className="py-2 font-medium text-right">Sales</th>
                        <th className="py-2 font-medium text-right">Purchase</th>
                        <th className="py-2 font-medium text-right">Returns</th>
                        <th className="py-2 font-medium text-right">Purch. Ret.</th>
                        <th className="py-2 font-medium text-right">Stock</th>
                        <th className="py-2 font-medium text-right">Adj.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastSync.companies.map((c) => (
                        <tr key={c.name} className="border-b last:border-0">
                          <td className="py-2">
                            <span className="font-medium text-slate-900">{c.label}</span>
                            {/* Several Tally files can share one label (one per financial
                                year), so the source file is shown to keep rows distinct. */}
                            <span className="block text-xs text-slate-500">{c.name}</span>
                          </td>
                          <td className="py-2 text-right tabular-nums">{c.sales}</td>
                          <td className="py-2 text-right tabular-nums">{c.purchase}</td>
                          <td className="py-2 text-right tabular-nums">{c.returns}</td>
                          <td className="py-2 text-right tabular-nums">{c.purchaseReturns}</td>
                          <td className="py-2 text-right tabular-nums">{c.stock}</td>
                          <td className="py-2 text-right tabular-nums">{c.adjustments}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
