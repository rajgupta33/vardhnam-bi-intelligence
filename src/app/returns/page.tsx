"use client";

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { loadProcessedData, type ProcessedDataset } from '@/lib/db';
import { aggregateByCrop, CropMetrics, aggregateBySku, SkuMetrics, aggregateByDealer, DealerMetrics, listCompanies, listFinancialYears, listCategories } from '@/lib/analytics';
import { formatQuantity, formatCurrencyINR, truncateText } from '@/lib/utils';
import { Undo2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { ScopeFilter } from '@/components/dashboard/ScopeFilter';

export default function SalesReturnAnalysis() {
  const [data, setData] = useState<ProcessedDataset | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [financialYear, setFinancialYear] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    const load = () => loadProcessedData().then(d => {
      if (d.sales && d.skuMaster) setData(d);
    });
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const companies = useMemo(() => (data ? listCompanies(data.sales) : []), [data]);
  const financialYears = useMemo(() => (data ? listFinancialYears(data.sales) : []), [data]);
  const categories = useMemo(() => (data ? listCategories(data.skuMaster) : []), [data]);
  const scope = { company, financialYear, category };

  const cropData: CropMetrics[] = useMemo(
    () => (data ? aggregateByCrop(data.sales, data.purchase, data.returns, data.purchaseReturns, data.stock, data.skuMaster, scope) : []),
    [data, company, financialYear, category]
  );
  const skuData: SkuMetrics[] = useMemo(
    () => (data ? aggregateBySku(data.sales, data.purchase, data.returns, data.purchaseReturns, data.stock, data.skuMaster, scope) : []),
    [data, company, financialYear, category]
  );
  const dealerData: DealerMetrics[] = useMemo(
    () => (data ? aggregateByDealer(data.sales, data.returns, data.skuMaster, scope) : []),
    [data, company, financialYear, category]
  );

  const totalReturnQty = cropData.reduce((acc, c) => acc + c.salesReturnQuantity, 0);
  const totalGrossQty = cropData.reduce((acc, c) => acc + c.grossSalesQuantity, 0);
  const overallReturnRate = totalGrossQty ? (totalReturnQty / totalGrossQty) * 100 : 0;

  const topReturnedSkus = [...skuData]
    .sort((a, b) => b.salesReturnQuantity - a.salesReturnQuantity)
    .slice(0, 10);

  const topReturnedDealers = [...dealerData]
    .sort((a, b) => b.salesReturnQuantity - a.salesReturnQuantity)
    .slice(0, 10);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">SALES RETURN ANALYSIS</h1>
          <p className="text-slate-500 mt-1">Physical return quantity and return rate</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-500 mb-1">Total Physical Return Qty</div>
              <div className="text-2xl md:text-3xl font-bold text-slate-900">{formatQuantity(totalReturnQty)}</div>
            </div>
            <Undo2 className="h-8 w-8 text-red-500 opacity-20" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-500 mb-1">Overall Return Rate</div>
              <div className="text-2xl md:text-3xl font-bold text-slate-900">{overallReturnRate.toFixed(1)}%</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-500 mb-1">Returned SKU Count</div>
              <div className="text-2xl md:text-3xl font-bold text-slate-900">{skuData.filter(s => s.salesReturnQuantity > 0).length}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Return Qty by Crop</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...cropData].sort((a, b) => b.salesReturnQuantity - a.salesReturnQuantity)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="crop" axisLine={false} tickLine={false} tickFormatter={(val) => truncateText(val, 8)} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => (val / 1000) + 'k'} />
                <RechartsTooltip formatter={(value: any) => [`${Number(value || 0).toLocaleString()} Kg`, '']} />
                <Bar dataKey="salesReturnQuantity" name="Return Qty" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Return Rate by Crop (%)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...cropData].sort((a, b) => b.returnRate - a.returnRate)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="crop" axisLine={false} tickLine={false} tickFormatter={(val) => truncateText(val, 8)} />
                <YAxis axisLine={false} tickLine={false} />
                <RechartsTooltip formatter={(value: any) => [`${Number(value || 0).toFixed(1)}%`, '']} />
                <Bar dataKey="returnRate" name="Return Rate %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 Returned SKUs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">SKU ID</th>
                  <th className="px-4 py-3">Unique SKU Name</th>
                  <th className="px-4 py-3">Crop</th>
                  <th className="px-4 py-3 text-right">Return Qty</th>
                  <th className="px-4 py-3 text-right">Return Rate</th>
                  <th className="px-4 py-3 text-right rounded-tr-lg">Gross Sales Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topReturnedSkus.map((sku) => (
                  <tr key={sku.skuId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">{sku.skuId}</td>
                    <td className="px-4 py-3 text-slate-900">{sku.uniqueSkuName}</td>
                    <td className="px-4 py-3 text-slate-500">{sku.crop}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-600">{formatQuantity(sku.salesReturnQuantity)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{sku.returnRate.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatQuantity(sku.grossSalesQuantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Parties by Physical Sales Return (Kg)</CardTitle>
        </CardHeader>
        <CardContent className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topReturnedDealers} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `${v/1000}k`} />
              <YAxis dataKey="partyName" type="category" width={110} tickFormatter={(val) => truncateText(val, 15)} tick={{fontSize: 11}} />
              <RechartsTooltip 
                formatter={(v: any, name: any, props: any) => {
                  if (name === 'salesReturnQuantity') return [formatQuantity(v), 'Return Qty'];
                  return [v, name];
                }}
                labelFormatter={(label, payload) => {
                  if (payload && payload.length > 0) {
                    const d = payload[0].payload;
                    return `${d.partyName} (Gross: ${formatQuantity(d.grossSalesQuantity)}, Net: ${formatQuantity(d.netDemand)}, Rate: ${d.returnRate.toFixed(1)}%, Share: ${d.shareOfTotalPhysicalReturn.toFixed(1)}%)`;
                  }
                  return label;
                }}
              />
              <Bar dataKey="salesReturnQuantity" fill="#e11d48" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
