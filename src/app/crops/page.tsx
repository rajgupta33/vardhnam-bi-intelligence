"use client";

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { loadProcessedData, type ProcessedDataset } from '@/lib/db';
import { aggregateByCrop, CropMetrics, aggregateBySku, SkuMetrics, aggregateByDealer, DealerMetrics, listCompanies, listFinancialYears, listCategories } from '@/lib/analytics';
import { formatQuantity, formatCurrencyINR } from '@/lib/utils';
import { ArrowRight, Package, Activity, Undo2, Scale, Boxes } from 'lucide-react';
import { ScopeFilter } from '@/components/dashboard/ScopeFilter';

export default function CropIntelligence() {
  const [data, setData] = useState<ProcessedDataset | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<string>('');
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

  useEffect(() => {
    if (cropData.length > 0) {
      setSelectedCrop((prev) => (prev && cropData.some((c) => c.crop === prev) ? prev : cropData[0].crop));
    }
  }, [cropData]);

  const activeCrop = cropData.find(c => c.crop === selectedCrop);
  const activeSkus = skuData.filter(s => s.crop === selectedCrop);
  const activeDealers = dealerData.map(d => {
    const mix = d.cropMix.find(c => c.crop === selectedCrop);
    if (!mix) return null;
    return {
      partyName: d.partyName,
      grossSalesQty: mix.grossSalesQty,
      salesReturnQty: mix.salesReturnQty,
      netDemand: mix.netDemand,
      returnRate: mix.returnRate,
      topSku: d.skuMix.filter(s => s.crop === selectedCrop)[0]?.uniqueSkuName || 'N/A'
    };
  }).filter(Boolean).sort((a, b) => b!.netDemand - a!.netDemand);

  if (!activeCrop) {
    return <div className="p-8 text-slate-500">Loading Crop Intelligence...</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">CROP INTELLIGENCE</h1>
          <p className="text-slate-500 mt-1">Deep-dive analysis by crop</p>
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
      <div className="flex items-end justify-end">
        <div>
          <select
            className="border-slate-200 rounded-md text-sm font-medium focus:ring-blue-500 p-2.5 bg-white shadow-sm border min-w-[200px]"
            value={selectedCrop}
            onChange={e => setSelectedCrop(e.target.value)}
          >
            {cropData.map(c => <option key={c.crop} value={c.crop}>{c.crop}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-8 shadow-sm">
        <h2 className="text-sm font-bold text-slate-400 tracking-wider mb-6">BUSINESS FLOW: {activeCrop.crop.toUpperCase()}</h2>
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <FlowNode title="PURCHASE" value={formatQuantity(activeCrop.purchaseQuantity)} icon={Package} color="blue" />
          <ArrowRight className="hidden md:block h-6 w-6 text-slate-300" />
          <FlowNode title="GROSS SALES" value={formatQuantity(activeCrop.grossSalesQuantity)} icon={Activity} color="indigo" />
          <ArrowRight className="hidden md:block h-6 w-6 text-slate-300" />
          <FlowNode title="SALES RETURN" value={formatQuantity(activeCrop.salesReturnQuantity)} icon={Undo2} color="red" />
          <ArrowRight className="hidden md:block h-6 w-6 text-slate-300" />
          <FlowNode title="NET DEMAND" value={formatQuantity(activeCrop.netDemand)} icon={Scale} color="emerald" />
          <ArrowRight className="hidden md:block h-6 w-6 text-slate-300" />
          <FlowNode title="CLOSING STOCK" value={formatQuantity(activeCrop.closingStockQuantity)} icon={Boxes} color="amber" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SKU Performance ({activeCrop.crop})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">SKU ID</th>
                  <th className="px-4 py-3">Unique SKU Name</th>
                  <th className="px-4 py-3">Pack Size</th>
                  <th className="px-4 py-3 text-right">Purchase Qty</th>
                  <th className="px-4 py-3 text-right">Gross Sales Qty</th>
                  <th className="px-4 py-3 text-right">Return Qty</th>
                  <th className="px-4 py-3 text-right">Net Demand</th>
                  <th className="px-4 py-3 text-right">Return %</th>
                  <th className="px-4 py-3 text-right rounded-tr-lg">Closing Stock Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeSkus.map((sku) => (
                  <tr key={sku.skuId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">{sku.skuId}</td>
                    <td className="px-4 py-3 text-slate-900">{sku.uniqueSkuName}</td>
                    <td className="px-4 py-3 text-slate-500">{sku.packSize}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-600">{formatQuantity(sku.purchaseQuantity)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-600">{formatQuantity(sku.grossSalesQuantity)}</td>
                    <td className="px-4 py-3 text-right text-red-600 font-medium">{formatQuantity(sku.salesReturnQuantity)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{formatQuantity(sku.netDemand)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{sku.returnRate.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-600">{formatQuantity(sku.closingStockQuantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dealer / Party Performance — {activeCrop.crop}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Dealer / Party</th>
                  <th className="px-4 py-3 text-right">Gross Sales Qty</th>
                  <th className="px-4 py-3 text-right">Physical Return Qty</th>
                  <th className="px-4 py-3 text-right">Net Demand</th>
                  <th className="px-4 py-3 text-right">Return Rate</th>
                  <th className="px-4 py-3 rounded-tr-lg">Top SKU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeDealers.map((dealer: any) => (
                  <tr key={dealer.partyName} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{dealer.partyName}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-600">{formatQuantity(dealer.grossSalesQty)}</td>
                    <td className="px-4 py-3 text-right text-rose-600 font-medium">{formatQuantity(dealer.salesReturnQty)}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{formatQuantity(dealer.netDemand)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{dealer.returnRate.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={dealer.topSku}>{dealer.topSku}</td>
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

function FlowNode({ title, value, icon: Icon, color }: any) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  
  return (
    <div className={`flex flex-col items-center justify-center p-4 rounded-xl border w-40 text-center ${colorMap[color]}`}>
      <Icon className="h-6 w-6 mb-2 opacity-80" />
      <div className="text-[10px] font-bold tracking-wider opacity-70 mb-1">{title}</div>
      <div className="font-bold text-lg">{value}</div>
    </div>
  );
}
