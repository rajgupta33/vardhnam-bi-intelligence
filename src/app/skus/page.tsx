"use client";

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { loadProcessedData, type ProcessedDataset } from '@/lib/db';
import { aggregateBySku, SkuMetrics, aggregateByDealer, DealerMetrics, listCompanies, listFinancialYears, listCategories } from '@/lib/analytics';
import { formatQuantity, formatCurrencyINR } from '@/lib/utils';
import { Search, X, ArrowRight } from 'lucide-react';
import { ScopeFilter } from '@/components/dashboard/ScopeFilter';

export default function SkuIntelligence() {
  const [data, setData] = useState<ProcessedDataset | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSku, setSelectedSku] = useState<SkuMetrics | null>(null);
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
  const dealerData: DealerMetrics[] = useMemo(
    () => (data ? aggregateByDealer(data.sales, data.returns, data.skuMaster, scope) : []),
    [data, company, financialYear, category]
  );

  const filtered = skuData.filter(s => 
    s.uniqueSkuName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.skuId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.crop.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Compute dealer rankings for the selected SKU
  const topPartiesByNetDemand = selectedSku 
    ? dealerData
        .map(d => {
          const mix = d.skuMix.find(s => s.skuId === selectedSku.skuId);
          if (!mix) return null;
          return { partyName: d.partyName, ...mix };
        })
        .filter(Boolean)
        .sort((a, b) => b!.netDemand - a!.netDemand)
        .slice(0, 10)
    : [];

  const topPartiesByReturn = selectedSku
    ? dealerData
        .map(d => {
          const mix = d.skuMix.find(s => s.skuId === selectedSku.skuId);
          if (!mix) return null;
          return { partyName: d.partyName, ...mix };
        })
        .filter(Boolean)
        .sort((a, b) => b!.salesReturnQty - a!.salesReturnQty)
        .slice(0, 10)
    : [];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 relative">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">SKU INTELLIGENCE</h1>
          <p className="text-slate-500 mt-1">Detailed performance by product</p>
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>All SKUs</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search SKUs..." 
              className="pl-8 w-full border-slate-200 rounded-md text-sm focus:ring-blue-500 p-2 border"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">SKU ID</th>
                  <th className="px-4 py-3">Unique SKU Name</th>
                  <th className="px-4 py-3">Crop</th>
                  <th className="px-4 py-3 text-right">Purchase Qty</th>
                  <th className="px-4 py-3 text-right">Gross Sales Qty</th>
                  <th className="px-4 py-3 text-right">Return Qty</th>
                  <th className="px-4 py-3 text-right">Net Demand</th>
                  <th className="px-4 py-3 text-right">Return %</th>
                  <th className="px-4 py-3 text-right rounded-tr-lg">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((sku) => (
                  <tr key={sku.skuId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">{sku.skuId}</td>
                    <td className="px-4 py-3 text-slate-900">{sku.uniqueSkuName}</td>
                    <td className="px-4 py-3 text-slate-500">{sku.crop}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-600">{formatQuantity(sku.purchaseQuantity)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-600">{formatQuantity(sku.grossSalesQuantity)}</td>
                    <td className="px-4 py-3 text-right text-red-600 font-medium">{formatQuantity(sku.salesReturnQuantity)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{formatQuantity(sku.netDemand)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{sku.returnRate.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedSku(sku)}>
                        Detail <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      {selectedSku && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedSku(null)} />
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{selectedSku.uniqueSkuName}</h2>
                <p className="text-sm text-slate-500 mt-1">{selectedSku.crop} | {selectedSku.skuId}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedSku(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 space-y-8">
              {/* Profile KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-lg">
                  <div className="text-xs text-slate-500 uppercase">Gross Sales</div>
                  <div className="font-bold">{formatQuantity(selectedSku.grossSalesQuantity)}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <div className="text-xs text-slate-500 uppercase">Net Demand</div>
                  <div className="font-bold text-blue-600">{formatQuantity(selectedSku.netDemand)}</div>
                </div>
                <div className="bg-rose-50 p-4 rounded-lg">
                  <div className="text-xs text-rose-500 uppercase">Return Rate</div>
                  <div className="font-bold text-rose-600">{selectedSku.returnRate.toFixed(1)}%</div>
                </div>
                <div className="bg-amber-50 p-4 rounded-lg">
                  <div className="text-xs text-amber-600 uppercase">Closing Stock</div>
                  <div className="font-bold text-amber-700">{formatQuantity(selectedSku.closingStockQuantity)}</div>
                </div>
              </div>

              {/* Top Parties by Demand */}
              <div>
                <h3 className="text-sm font-semibold uppercase text-slate-500 mb-4">Top Parties By Net Demand</h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs uppercase border-b">
                      <tr>
                        <th className="px-4 py-2">Party Name</th>
                        <th className="px-4 py-2 text-right">Gross Qty</th>
                        <th className="px-4 py-2 text-right">Return Qty</th>
                        <th className="px-4 py-2 text-right">Net Demand</th>
                        <th className="px-4 py-2 text-right">Return Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {topPartiesByNetDemand.map(p => (
                        <tr key={p!.partyName} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium">{p!.partyName}</td>
                          <td className="px-4 py-2 text-right">{formatQuantity(p!.grossSalesQty)}</td>
                          <td className="px-4 py-2 text-right text-rose-600">{formatQuantity(p!.salesReturnQty)}</td>
                          <td className="px-4 py-2 text-right font-medium text-blue-600">{formatQuantity(p!.netDemand)}</td>
                          <td className="px-4 py-2 text-right">{p!.returnRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top Parties by Return */}
              <div>
                <h3 className="text-sm font-semibold uppercase text-slate-500 mb-4">Top Parties By Physical Sales Return</h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs uppercase border-b">
                      <tr>
                        <th className="px-4 py-2">Party Name</th>
                        <th className="px-4 py-2 text-right">Gross Qty</th>
                        <th className="px-4 py-2 text-right">Return Qty</th>
                        <th className="px-4 py-2 text-right">Net Demand</th>
                        <th className="px-4 py-2 text-right">Return Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {topPartiesByReturn.map(p => (
                        <tr key={p!.partyName} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium">{p!.partyName}</td>
                          <td className="px-4 py-2 text-right">{formatQuantity(p!.grossSalesQty)}</td>
                          <td className="px-4 py-2 text-right text-rose-600 font-medium">{formatQuantity(p!.salesReturnQty)}</td>
                          <td className="px-4 py-2 text-right text-blue-600">{formatQuantity(p!.netDemand)}</td>
                          <td className="px-4 py-2 text-right">{p!.returnRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
