"use client";

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { loadProcessedData, type ProcessedDataset } from '@/lib/db';
import { aggregateBySku, SkuMetrics, aggregateByCrop, CropMetrics, listCompanies, listFinancialYears, listCategories } from '@/lib/analytics';
import { formatQuantity, formatCurrencyINR, truncateText } from '@/lib/utils';
import { Boxes, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { ScopeFilter } from '@/components/dashboard/ScopeFilter';

export default function StockAnalysis() {
  const [data, setData] = useState<ProcessedDataset | null>(null);
  const [mode, setMode] = useState<'Quantity' | 'Value'>('Quantity');
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

  const skuData: SkuMetrics[] = useMemo(
    () => (data ? aggregateBySku(data.sales, data.purchase, data.returns, data.purchaseReturns, data.stock, data.skuMaster, scope) : []),
    [data, company, financialYear, category]
  );
  const cropData: CropMetrics[] = useMemo(
    () => (data ? aggregateByCrop(data.sales, data.purchase, data.returns, data.purchaseReturns, data.stock, data.skuMaster, scope) : []),
    [data, company, financialYear, category]
  );

  const totalStockQty = cropData.reduce((acc, c) => acc + c.closingStockQuantity, 0);
  const totalStockValue = cropData.reduce((acc, c) => acc + c.closingStockValue, 0);
  const skusWithStock = skuData.filter(s => s.closingStockQuantity > 0).length;
  const cropsWithStock = cropData.filter(c => c.closingStockQuantity > 0).length;

  const getStockFlag = (sku: SkuMetrics) => {
    if (sku.closingStockQuantity > 0 && sku.netDemand <= 0) {
      return <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 text-xs px-2 py-1 rounded" title="Stock exists but zero or negative net demand">NO NET DEMAND WITH STOCK</span>;
    }
    if (sku.closingStockQuantity > sku.netDemand) {
      return <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded" title="Closing stock exceeds total net demand for the year">HIGH STOCK VS DEMAND</span>;
    }
    return <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs px-2 py-1 rounded">HEALTHY</span>;
  };

  const activeDataKey = mode === 'Quantity' ? 'closingStockQuantity' : 'closingStockValue';
  const formatValue = mode === 'Quantity' ? formatQuantity : formatCurrencyINR;

  const topSkus = [...skuData]
    .sort((a, b) => b[activeDataKey] - a[activeDataKey])
    .slice(0, 10);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">CLOSING STOCK ANALYSIS</h1>
          <p className="text-slate-500 mt-1">
            Review closing positions and stock flags
            {!financialYear && financialYears.length > 1 && ` — showing the latest snapshot (${financialYears[financialYears.length - 1]})`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
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
          <div className="flex border rounded-md overflow-hidden shadow-sm">
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${mode === 'Quantity' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            onClick={() => setMode('Quantity')}
          >
            Quantity
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${mode === 'Value' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            onClick={() => setMode('Value')}
          >
            Value
          </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-slate-500 mb-1">Total Stock Qty</div>
            <div className="text-2xl font-bold text-slate-900">{formatQuantity(totalStockQty)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-slate-500 mb-1">Total Stock Value</div>
            <div className="text-2xl font-bold text-slate-900">{formatCurrencyINR(totalStockValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-slate-500 mb-1">SKUs with Stock</div>
            <div className="text-2xl font-bold text-slate-900">{skusWithStock}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-slate-500 mb-1">Crops with Stock</div>
            <div className="text-2xl font-bold text-slate-900">{cropsWithStock}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Closing Stock {mode} by Crop</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...cropData].sort((a, b) => b[activeDataKey] - a[activeDataKey])} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(val) => mode === 'Quantity' ? (val / 1000) + 'k' : '₹' + (val / 100000).toFixed(1) + 'L'} />
                <YAxis dataKey="crop" type="category" width={90} tickFormatter={(val) => truncateText(val, 12)} tick={{fontSize: 11}} axisLine={false} tickLine={false} />
                <RechartsTooltip formatter={(value: any) => [formatValue(Number(value || 0)), `Closing ${mode}`]} />
                <Bar dataKey={activeDataKey} name={`Closing ${mode}`} fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 10 SKUs by Closing Stock {mode}</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSkus} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(val) => mode === 'Quantity' ? (val / 1000) + 'k' : '₹' + (val / 100000).toFixed(1) + 'L'} />
                <YAxis dataKey="uniqueSkuName" type="category" axisLine={false} tickLine={false} tickFormatter={(val) => truncateText(val, 15)} tick={{fontSize: 11}} width={110} />
                <RechartsTooltip formatter={(value: any) => [formatValue(Number(value || 0)), `Closing ${mode}`]} />
                <Bar dataKey={activeDataKey} name={`Closing ${mode}`} fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SKU Stock Analysis Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">SKU ID</th>
                  <th className="px-4 py-3">Unique SKU Name</th>
                  <th className="px-4 py-3">Crop</th>
                  <th className="px-4 py-3 text-right">Closing Qty</th>
                  <th className="px-4 py-3 text-right">Closing Value</th>
                  <th className="px-4 py-3 text-right">Net Demand</th>
                  <th className="px-4 py-3 text-right">Stock/Demand Ratio</th>
                  <th className="px-4 py-3 rounded-tr-lg">Review Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...skuData]
                  .filter(s => s.closingStockQuantity > 0)
                  .sort((a, b) => b.closingStockQuantity - a.closingStockQuantity)
                  .map((sku) => (
                  <tr key={sku.skuId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">{sku.skuId}</td>
                    <td className="px-4 py-3 text-slate-900">{sku.uniqueSkuName}</td>
                    <td className="px-4 py-3 text-slate-500">{sku.crop}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatQuantity(sku.closingStockQuantity)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-600">{formatCurrencyINR(sku.closingStockValue)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatQuantity(sku.netDemand)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {sku.netDemand > 0 ? (sku.closingStockQuantity / sku.netDemand).toFixed(2) : 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      {getStockFlag(sku)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
