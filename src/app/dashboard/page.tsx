"use client";

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { loadProcessedData } from '@/lib/db';
import { calculateGlobalMetrics, GlobalMetrics, aggregateByCrop, CropMetrics, listCategories, listCompanies, listFinancialYears } from '@/lib/analytics';
import { formatQuantity, formatCurrencyINR, truncateText } from '@/lib/utils';
import { Activity, AlertTriangle, IndianRupee, Package, Scale, TrendingDown, RefreshCcw, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { ScopeFilter } from '@/components/dashboard/ScopeFilter';
import type { ProcessedDataset } from '@/lib/db';

type KpiCardProps = {
  title: string;
  value: string;
  exactValue: string;
  icon: LucideIcon;
  description: string;
};

export default function CommandCentre() {
  const [data, setData] = useState<ProcessedDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [financialYear, setFinancialYear] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => loadProcessedData()
      .then(d => {
        if (cancelled) return;
        if (d.sales.length > 0 && d.skuMaster.length > 0) {
          setData(d);
          setLoadError(null);
        } else {
          setData(null);
          setLoadError('No dashboard data is stored yet. Run Fetch All Data from the Sync page on the machine that can reach Tally, then refresh this page.');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        setLoadError(err instanceof Error ? err.message : 'Failed to load data from the server');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const companies = useMemo(() => (data ? listCompanies(data.sales) : []), [data]);
  const financialYears = useMemo(() => (data ? listFinancialYears(data.sales) : []), [data]);
  const categories = useMemo(() => (data ? listCategories(data.skuMaster) : []), [data]);

  const metrics: GlobalMetrics | null = useMemo(() => {
    if (!data) return null;
    return calculateGlobalMetrics(data.sales, data.purchase, data.returns, data.purchaseReturns, data.stock, data.skuMaster, { company, financialYear, category });
  }, [data, company, financialYear, category]);

  const cropData: CropMetrics[] = useMemo(() => {
    if (!data) return [];
    return aggregateByCrop(data.sales, data.purchase, data.returns, data.purchaseReturns, data.stock, data.skuMaster, { company, financialYear, category });
  }, [data, company, financialYear, category]);

  if (loading) {
    return <div className="p-8 text-slate-500 flex h-full items-center justify-center">Loading Command Centre...</div>;
  }

  if (loadError || !metrics) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <Card className="border-red-200">
          <CardContent className="p-6 flex gap-3 text-red-900">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <h1 className="font-semibold text-slate-900">Dashboard data could not be loaded</h1>
              <p className="text-sm mt-2 leading-relaxed">{loadError ?? 'The server returned an incomplete dataset.'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sortedByDemand = [...cropData].sort((a, b) => b.netDemand - a.netDemand).slice(0, 10);

  const scopeNote = category ? `${category} only` : 'All categories';
  const yearLabel = financialYear || (financialYears.length > 1 ? 'all years' : financialYears[0] || '');

  /**
   * Whether a figure can honestly claim to tie to Tally is now per-year, not
   * global: Tally supplies FY2024-25 while FY2025-26 comes from the converted
   * registers and has no Tally control total to check against. Rather than
   * guess which years are verified, the net figures point at Reconciliation,
   * which shows the per-company-per-year variance directly.
   */
  const netNote = category ? `${scopeNote} — see Reconciliation` : 'Net of returns & adjustments';

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">CEO COMMAND CENTRE</h1>
          <p className="text-slate-500 mt-1">
            {yearLabel} Purchase, Demand, Return &amp; Stock Overview
            {company ? ` · ${company}` : companies.length > 1 ? ' · all companies' : ''}
          </p>
        </div>
        <ScopeFilter
          companies={companies}
          financialYears={financialYears}
          categories={categories}
          company={company}
          financialYear={financialYear}
          category={category}
          onCompanyChange={setCompany}
          onFinancialYearChange={setFinancialYear}
          onCategoryChange={setCategory}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Purchase Quantity" value={formatQuantity(metrics.purchaseQuantity)} exactValue={`${metrics.purchaseQuantity.toLocaleString()} Kg`} icon={Package} description="Kilogram lines only" />
        <KpiCard title="Purchase Value" value={formatCurrencyINR(metrics.purchaseValue)} exactValue={`₹${metrics.purchaseValue.toLocaleString()}`} icon={IndianRupee} description="Gross, before debit notes" />
        <KpiCard title="Net Purchase Value" value={formatCurrencyINR(metrics.netPurchaseValue)} exactValue={`₹${metrics.netPurchaseValue.toLocaleString()}`} icon={Scale} description={netNote} />
        <KpiCard title="Physical Purchase Return" value={formatQuantity(metrics.purchaseReturnQuantity)} exactValue={`${metrics.purchaseReturnQuantity.toLocaleString()} Kg`} icon={Undo2} description="Goods sent back to supplier" />
        <KpiCard title="Value-Only Debit Notes" value={formatCurrencyINR(metrics.valueOnlyDebitNoteValue)} exactValue={`₹${metrics.valueOnlyDebitNoteValue.toLocaleString()}`} icon={IndianRupee} description="Rate difference / discount" />
        <KpiCard title="Gross Sales Qty" value={formatQuantity(metrics.grossSalesQuantity)} exactValue={`${metrics.grossSalesQuantity.toLocaleString()} Kg`} icon={Activity} description="Kilogram lines only" />
        <KpiCard title="Total Sales Value" value={formatCurrencyINR(metrics.grossSalesValue)} exactValue={`₹${metrics.grossSalesValue.toLocaleString()}`} icon={IndianRupee} description="Gross, before credit notes" />
        <KpiCard title="Net Sales Value" value={formatCurrencyINR(metrics.netSalesValue)} exactValue={`₹${metrics.netSalesValue.toLocaleString()}`} icon={Scale} description={netNote} />
        <KpiCard title="Physical Sales Return" value={formatQuantity(metrics.salesReturnQuantity)} exactValue={`${metrics.salesReturnQuantity.toLocaleString()} Kg`} icon={Undo2} description="Goods actually returned" />
        <KpiCard title="Value-Only Credit Notes" value={formatCurrencyINR(metrics.valueOnlyCreditNoteValue)} exactValue={`₹${metrics.valueOnlyCreditNoteValue.toLocaleString()}`} icon={IndianRupee} description="Rate difference / discount" />
        <KpiCard title="Return Rate" value={metrics.grossSalesQuantity ? (metrics.salesReturnQuantity / metrics.grossSalesQuantity * 100).toFixed(1) + '%' : '0%'} exactValue="Physical return qty / gross sales qty" icon={TrendingDown} description="Physical returns only" />
        <KpiCard title="Closing Stock Value" value={formatCurrencyINR(metrics.closingStockValue)} exactValue={`₹${metrics.closingStockValue.toLocaleString()}`} icon={IndianRupee} description="Godown Stock Value" />
      </div>

      <div className="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-4">
        <RefreshCcw className="h-5 w-5 text-blue-600 shrink-0" />
        <p className="text-sm text-blue-900 font-medium leading-relaxed">
          Executive Insight: Total Purchase-to-Demand gap is {formatQuantity(metrics.purchaseQuantity - metrics.netDemand)}.
          Opening stock is not included. Quantity figures count kilogram-denominated lines only —
          see Reconciliation for the full per-unit breakdown and any unmapped value.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Purchase vs Net Demand by Crop</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedByDemand} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="crop" axisLine={false} tickLine={false} tickFormatter={(val) => truncateText(val, 8)} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => (val / 1000) + 'k'} />
                <RechartsTooltip formatter={(value: unknown) => [`${Number(value || 0).toLocaleString()} Kg`, '']} />
                <Legend iconType="circle" />
                <Bar dataKey="purchaseQuantity" name="Purchase Qty" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="netDemand" name="Net Demand" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Gross Sales vs Physical Return by Crop</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedByDemand} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="crop" axisLine={false} tickLine={false} tickFormatter={(val) => truncateText(val, 8)} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => (val / 1000) + 'k'} />
                <RechartsTooltip formatter={(value: unknown) => [`${Number(value || 0).toLocaleString()} Kg`, '']} />
                <Legend iconType="circle" />
                <Bar dataKey="grossSalesQuantity" name="Gross Sales Qty" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="salesReturnQuantity" name="Sales Return Qty" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, exactValue, icon: Icon, description }: KpiCardProps) {
  return (
    <Card className="overflow-hidden group border-slate-200/60 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-500">{title}</h3>
          <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-blue-50 transition-colors">
            <Icon className="h-4 w-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 group cursor-help" title={exactValue}>
          <div className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">{value}</div>
        </div>
        <p className="text-xs text-slate-400 mt-2">{description}</p>
      </CardContent>
    </Card>
  );
}
