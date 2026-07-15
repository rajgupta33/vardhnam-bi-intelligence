"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { saveProcessedData, loadProcessedData } from '@/lib/db';
import { ValidationIssue } from '@/types';
import { formatQuantity, formatCurrencyINR, cn } from '@/lib/utils';
import { Server, AlertCircle, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

export default function DataWorkspace() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProcessedData().then(data => {
      if (data.lastUpdated) {
        setHasData(true);
        setIssues(data.issues);
      }
    });
  }, []);

  const handleProcess = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/process', { method: 'POST' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to process files');
      }
      const data = await res.json();
      await saveProcessedData(data);
      setIssues(data.issues);
      setHasData(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const hasCritical = issues.some(i => i.severity === 'Critical');

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">VARDHNAM ANALYTICS</h1>
        <p className="text-slate-500 mt-1">FY 2025–26 Purchase-to-Demand Intelligence</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-600" />
            Local Data Source
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            This MVP processes the default FY 2025-26 Excel and CSV datasets securely from the local filesystem.
            No data is transmitted externally.
          </p>
          <div className="flex items-center gap-4">
            <Button onClick={handleProcess} disabled={loading}>
              {loading ? 'Processing...' : 'Process Default Dataset'}
            </Button>
            {hasData && (
              <Button variant="secondary" onClick={() => router.push('/dashboard')}>
                Go to Command Centre <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
          {error && (
            <div className="p-4 bg-red-50 text-red-900 rounded-md text-sm border border-red-200">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {hasData && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-slate-900">DATA VALIDATION SUMMARY</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-slate-500">Total Data Issues</div>
                <div className="text-2xl md:text-3xl font-bold mt-2">{issues.length}</div>
              </CardContent>
            </Card>
            <Card className={hasCritical ? 'border-red-500 bg-red-50' : ''}>
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-slate-500">Critical Errors</div>
                <div className={`text-2xl md:text-3xl font-bold mt-2 ${hasCritical ? 'text-red-700' : ''}`}>
                  {issues.filter(i => i.severity === 'Critical').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-slate-500">Warnings</div>
                <div className="text-2xl md:text-3xl font-bold mt-2 text-amber-600">
                  {issues.filter(i => i.severity === 'Warning').length}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Issue Log</CardTitle>
            </CardHeader>
            <CardContent>
              {issues.length === 0 ? (
                <div className="text-center p-8 text-slate-500 flex flex-col items-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                  <p>All data validated successfully with no issues.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium">
                      <tr>
                        <th className="px-4 py-3 rounded-tl-lg">Severity</th>
                        <th className="px-4 py-3">Source</th>
                        <th className="px-4 py-3">Row</th>
                        <th className="px-4 py-3">Issue</th>
                        <th className="px-4 py-3">Item Name</th>
                        <th className="px-4 py-3 text-right rounded-tr-lg">Impact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {issues.map((issue) => (
                        <tr key={issue.issueId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
                              issue.severity === 'Critical' ? 'bg-red-100 text-red-700' : 
                              issue.severity === 'Warning' ? 'bg-amber-100 text-amber-700' :
                              'bg-blue-100 text-blue-700'
                            )}>
                              {issue.severity === 'Critical' ? <AlertCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                              {issue.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-700">{issue.source}</td>
                          <td className="px-4 py-3 text-slate-500">{issue.sourceRowNumber || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{issue.issueType.replace(/_/g, ' ')}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{issue.message}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{issue.originalItemName || '-'}</td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {issue.impactQuantity ? <div>{formatQuantity(issue.impactQuantity)}</div> : null}
                            {issue.impactValue ? <div className="text-xs mt-0.5">{formatCurrencyINR(issue.impactValue)}</div> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
