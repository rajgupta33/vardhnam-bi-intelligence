"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrencyINR, truncateText } from '@/lib/utils';
import { Scale, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ReconciliationReport } from '@/lib/reconciliation';

interface ApiResponse {
  report: ReconciliationReport;
  lastUpdated: string | null;
}

export default function Reconciliation() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      fetch('/api/reconciliation')
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${res.status})`);
          }
          return res.json();
        })
        .then((json: ApiResponse) => {
          setData(json);
          setError(null);
        })
        .catch((err: Error) => setError(err.message));

    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <p className="text-slate-700 font-medium">{error}</p>
            <p className="text-slate-500 text-sm mt-1">
              Run a Tally sync to generate the reconciliation report.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return <div className="p-8 text-slate-500">Loading reconciliation…</div>;
  }

  const { report } = data;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Scale className="w-7 h-7" /> RECONCILIATION
        </h1>
        <p className="text-slate-500 mt-1">
          Proves the dashboard still ties to Tally, and shows exactly where records are lost
          {report.financialYears.length > 0 && ` · ${report.financialYears.join(', ')}`}
        </p>
      </div>

      {/* Ledger checks against Tally's own group totals, one set per company per financial year */}
      <div className="grid gap-4 md:grid-cols-2">
        {report.ledgerChecks.map((check) => {
          const reconciled = check.variance !== null && Math.abs(check.variance) < 0.01;
          return (
            <Card key={`${check.company}-${check.financialYear ?? 'all'}-${check.label}`}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>
                  {check.label}
                  <span className="block text-xs font-normal text-slate-500 mt-0.5">
                    {check.company}
                    {check.financialYear ? ` · ${check.financialYear}` : report.financialYears.length > 1 ? ' · all years' : ''}
                  </span>
                </CardTitle>
                {check.expected === null ? (
                  <span className="text-xs text-slate-500">no target configured</span>
                ) : reconciled ? (
                  <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4" /> RECONCILED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium">
                    <AlertTriangle className="w-4 h-4" /> VARIANCE
                  </span>
                )}
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <tbody>
                    {check.components.map((c) => (
                      <tr key={c.label} className="border-b last:border-0">
                        <td className="py-1.5 text-slate-600">{c.label}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatCurrencyINR(c.value)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 font-semibold">
                      <td className="py-1.5">Computed</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCurrencyINR(check.computed)}</td>
                    </tr>
                    {check.expected !== null && (
                      <>
                        <tr>
                          <td className="py-1.5 text-slate-600">Tally</td>
                          <td className="py-1.5 text-right tabular-nums">{formatCurrencyINR(check.expected)}</td>
                        </tr>
                        <tr className={reconciled ? 'text-green-700' : 'text-red-700'}>
                          <td className="py-1.5 font-semibold">Variance</td>
                          <td className="py-1.5 text-right tabular-nums font-semibold">
                            {formatCurrencyINR(check.variance ?? 0)}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
                {check.expected === null && (
                  <p className="text-xs text-slate-500 mt-3">
                    Set TALLY_EXPECTED_SALES_ACCOUNTS / TALLY_EXPECTED_PURCHASE_ACCOUNTS to compare
                    against Tally&apos;s dashboard figures automatically.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Related-party trade — flagged, deliberately not eliminated */}
      {report.interCompany && report.interCompany.parties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Inter-company trade</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <p className="text-sm text-slate-500 mb-4">
              Transactions with related group entities. These are <strong>included</strong> in
              combined figures, so group totals double-count them. Shown here so the size is
              visible; nothing is netted out.
            </p>
            <div className="grid gap-3 sm:grid-cols-3 mb-4">
              <div className="border rounded-md p-3">
                <p className="text-xs uppercase text-slate-500">Sales to group</p>
                <p className="text-xl font-bold tabular-nums">
                  {formatCurrencyINR(report.interCompany.salesValue)}
                </p>
                <p className="text-xs text-slate-500">{report.interCompany.salesRows} rows</p>
              </div>
              <div className="border rounded-md p-3">
                <p className="text-xs uppercase text-slate-500">Purchases from group</p>
                <p className="text-xl font-bold tabular-nums">
                  {formatCurrencyINR(report.interCompany.purchaseValue)}
                </p>
                <p className="text-xs text-slate-500">{report.interCompany.purchaseRows} rows</p>
              </div>
              <div className="border rounded-md p-3">
                <p className="text-xs uppercase text-slate-500">Journal adjustments</p>
                <p className="text-xl font-bold tabular-nums">
                  {formatCurrencyINR(report.interCompany.adjustmentValue)}
                </p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 font-medium">Related party</th>
                  <th className="py-2 font-medium">Dataset</th>
                  <th className="py-2 font-medium text-right">Rows</th>
                  <th className="py-2 font-medium text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {report.interCompany.parties.map((p) => (
                  <tr key={`${p.dataset}-${p.party}`} className="border-b last:border-0">
                    <td className="py-2" title={p.party}>
                      {truncateText(p.party, 46)}
                    </td>
                    <td className="py-2 text-slate-500">{p.dataset}</td>
                    <td className="py-2 text-right tabular-nums">{p.rows}</td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {formatCurrencyINR(p.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Where rows stop reaching the dashboard */}
      <Card>
        <CardHeader>
          <CardTitle>Leakage waterfall</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="grid gap-6 md:grid-cols-2">
            {report.datasets
              .filter((d) => d.stages[0]?.rows > 0)
              .map((d) => (
                <div key={d.dataset}>
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="font-semibold uppercase text-slate-800 text-sm">{d.dataset}</h3>
                    <span
                      className={`text-xs font-medium ${d.leakagePercent > 5 ? 'text-red-700' : 'text-slate-500'}`}
                    >
                      {d.leakagePercent.toFixed(1)}% of value not displayed
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {d.stages.map((s) => (
                        <tr key={s.label} className="border-b last:border-0">
                          <td className="py-1.5 text-slate-600" title={s.note}>
                            {s.label}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-slate-500">{s.rows}</td>
                          <td className="py-1.5 text-right tabular-nums">{formatCurrencyINR(s.value)}</td>
                          <td className="py-1.5 text-right tabular-nums text-red-700">
                            {s.delta ? `−${formatCurrencyINR(s.delta)}` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Quantities kept separate per unit */}
      <Card>
        <CardHeader>
          <CardTitle>Quantities by unit</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 mb-3">
            Quantities in different units are reported separately — kilograms are never added to
            pieces.
          </p>
          <table className="w-full text-sm">
            <tbody>
              {report.quantities
                .filter((q) => q.measure.primaryUnit)
                .map((q) => (
                  <tr key={q.dataset} className="border-b last:border-0">
                    <td className="py-2 font-medium text-slate-700 capitalize">{q.dataset}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(q.measure.byUnit).map(([unit, qty]) => (
                          <span key={unit} className="bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded tabular-nums">
                            {qty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* The actionable backlog: fix these mappings, recover this value */}
      <Card>
        <CardHeader>
          <CardTitle>Unmapped items — ranked by value impact</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            {report.mappingCoverage
              .filter((c) => c.total > 0)
              .map((c) => (
                <div key={c.dataset} className="border rounded-md p-3">
                  <p className="text-xs uppercase text-slate-500">{c.dataset}</p>
                  <p
                    className={`text-xl font-bold tabular-nums ${c.percent < 99 ? 'text-red-700' : 'text-green-700'}`}
                  >
                    {c.percent.toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.mapped} of {c.total} rows mapped
                  </p>
                </div>
              ))}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 font-medium">Item name in Tally</th>
                <th className="py-2 font-medium">Dataset</th>
                <th className="py-2 font-medium text-right">Rows</th>
                <th className="py-2 font-medium text-right">Quantity</th>
                <th className="py-2 font-medium text-right">Value not shown</th>
              </tr>
            </thead>
            <tbody>
              {report.unmapped.slice(0, 25).map((u) => (
                <tr key={`${u.dataset}-${u.originalItemName}`} className="border-b last:border-0">
                  <td className="py-2" title={u.originalItemName}>
                    {truncateText(u.originalItemName, 46)}
                  </td>
                  <td className="py-2 text-slate-500">{u.dataset}</td>
                  <td className="py-2 text-right tabular-nums">{u.rows}</td>
                  <td className="py-2 text-right tabular-nums">
                    {u.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {u.unit ?? ''}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatCurrencyINR(u.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.unmapped.length > 25 && (
            <p className="text-xs text-slate-500 mt-3">
              Showing top 25 of {report.unmapped.length} unmapped items.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
