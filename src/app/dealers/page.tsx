"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { loadProcessedData } from '@/lib/db';
import { DealerMetrics, aggregateByDealer, calculateDealerConcentration } from '@/lib/analytics/dealer';
import { formatQuantity, formatCurrencyINR, truncateText } from '@/lib/utils';
import { Users, TrendingDown, ArrowRight, X, TrendingUp } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';

export default function DealersIntelligence() {
  const [dealers, setDealers] = useState<DealerMetrics[]>([]);
  const [selectedDealer, setSelectedDealer] = useState<DealerMetrics | null>(null);

  useEffect(() => {
    loadProcessedData().then((data) => {
      if (data && data.sales && data.skuMaster) {
        const computedDealers = aggregateByDealer(data.sales, data.returns || [], data.skuMaster);
        setDealers(computedDealers);
      }
    });
  }, []);

  // Summary Metrics
  const summary = useMemo(() => {
    const activeDealers = dealers.filter(d => d.grossSalesQuantity > 0).length;
    const dealersWithReturn = dealers.filter(d => d.salesReturnQuantity > 0).length;
    
    const sortedByDemand = [...dealers].sort((a, b) => b.netDemand - a.netDemand);
    const sortedByValue = [...dealers].sort((a, b) => b.grossSalesValue - a.grossSalesValue);
    
    const topPartyDemand = sortedByDemand.length > 0 ? sortedByDemand[0].partyName : 'N/A';
    const topPartyValue = sortedByValue.length > 0 ? sortedByValue[0].partyName : 'N/A';
    
    const top5Concentration = calculateDealerConcentration(dealers, 5);
    const totalDealerNetDemand = dealers.reduce((sum, d) => sum + d.netDemand, 0);

    return {
      activeDealers,
      dealersWithReturn,
      topPartyDemand,
      topPartyValue,
      top5Concentration,
      totalDealerNetDemand
    };
  }, [dealers]);

  // Chart Data
  const top10Demand = [...dealers].sort((a, b) => b.netDemand - a.netDemand).slice(0, 10);
  const top10Value = [...dealers].sort((a, b) => b.grossSalesValue - a.grossSalesValue).slice(0, 10);
  const top10Return = [...dealers].sort((a, b) => b.salesReturnQuantity - a.salesReturnQuantity).slice(0, 10);

  if (dealers.length === 0) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto flex items-center justify-center h-full text-slate-500">
        No dealer data available. Please process the dataset in the Data Workspace.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 relative">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">DEALER INTELLIGENCE</h1>
        <p className="text-slate-500 mt-1">Party performance, return behaviour, and net demand concentration.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase">Active Sales Parties</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.activeDealers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase">Parties w/ Return</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.dealersWithReturn}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase">Top Party (Demand)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold truncate" title={summary.topPartyDemand}>{summary.topPartyDemand}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase">Top Party (Value)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold truncate" title={summary.topPartyValue}>{summary.topPartyValue}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase">Top 5 Concentration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.top5Concentration.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase">Total Net Demand</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{formatQuantity(summary.totalDealerNetDemand)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top 10 Parties by Net Demand (Kg)</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10Demand} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${v/1000}k`} />
                <YAxis dataKey="partyName" type="category" width={110} tickFormatter={(val) => truncateText(val, 15)} tick={{fontSize: 11}} />
                <RechartsTooltip formatter={(v: any) => formatQuantity(Number(v || 0))} />
                <Bar dataKey="netDemand" fill="#0284c7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top 10 Parties by Gross Sales Value (₹)</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10Value} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${(v/1000000).toFixed(1)}M`} />
                <YAxis dataKey="partyName" type="category" width={110} tickFormatter={(val) => truncateText(val, 15)} tick={{fontSize: 11}} />
                <RechartsTooltip formatter={(v: any) => formatCurrencyINR(Number(v || 0))} />
                <Bar dataKey="grossSalesValue" fill="#0d9488" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top 10 Parties by Physical Return (Kg)</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10Return} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${v/1000}k`} />
                <YAxis dataKey="partyName" type="category" width={110} tickFormatter={(val) => truncateText(val, 15)} tick={{fontSize: 11}} />
                <RechartsTooltip formatter={(v: any) => formatQuantity(Number(v || 0))} />
                <Bar dataKey="salesReturnQuantity" fill="#e11d48" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Dealer Table */}
      <Card>
        <CardHeader>
          <CardTitle>Dealer Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50/50 uppercase border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">Dealer / Party</th>
                  <th className="px-4 py-3 font-medium text-right">Gross Sales Qty</th>
                  <th className="px-4 py-3 font-medium text-right">Gross Value</th>
                  <th className="px-4 py-3 font-medium text-right">Physical Return</th>
                  <th className="px-4 py-3 font-medium text-right">Net Demand</th>
                  <th className="px-4 py-3 font-medium text-right">Return Rate</th>
                  <th className="px-4 py-3 font-medium text-right">% Demand Share</th>
                  <th className="px-4 py-3 font-medium text-right">% Return Share</th>
                  <th className="px-4 py-3 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dealers.map((d) => (
                  <tr key={d.partyName} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-3 font-medium text-slate-900">{d.partyName}</td>
                    <td className="px-4 py-3 text-right">{formatQuantity(d.grossSalesQuantity)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrencyINR(d.grossSalesValue)}</td>
                    <td className="px-4 py-3 text-right text-rose-600 font-medium">
                      {formatQuantity(d.salesReturnQuantity)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-600">
                      {formatQuantity(d.netDemand)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {d.returnRate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {d.shareOfTotalNetDemand.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {d.shareOfTotalPhysicalReturn.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedDealer(d)}>
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
      {selectedDealer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedDealer(null)} />
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{selectedDealer.partyName}</h2>
                <p className="text-sm text-slate-500 mt-1">Dealer Intelligence Profile</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedDealer(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 space-y-8">
              {/* Profile KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-lg">
                  <div className="text-xs text-slate-500 uppercase">Gross Value</div>
                  <div className="font-bold">{formatCurrencyINR(selectedDealer.grossSalesValue)}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <div className="text-xs text-slate-500 uppercase">Net Demand</div>
                  <div className="font-bold text-blue-600">{formatQuantity(selectedDealer.netDemand)}</div>
                </div>
                <div className="bg-rose-50 p-4 rounded-lg">
                  <div className="text-xs text-rose-500 uppercase">Return Rate</div>
                  <div className="font-bold text-rose-600">{selectedDealer.returnRate.toFixed(1)}%</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <div className="text-xs text-slate-500 uppercase">% Demand Share</div>
                  <div className="font-bold">{selectedDealer.shareOfTotalNetDemand.toFixed(1)}%</div>
                </div>
              </div>

              {/* Monthly Pattern */}
              <div>
                <h3 className="text-sm font-semibold uppercase text-slate-500 mb-4">Monthly Sales & Net Demand Pattern</h3>
                <div className="h-[300px] border rounded-lg p-4 bg-slate-50/50">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selectedDealer.monthlyPattern}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{fontSize: 12}} />
                      <YAxis tickFormatter={(v) => `${v/1000}k`} width={50} />
                      <RechartsTooltip formatter={(v: any) => formatQuantity(Number(v || 0))} />
                      <Legend />
                      <Line type="monotone" dataKey="grossSalesQty" name="Gross Sales" stroke="#94a3b8" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="salesReturnQty" name="Physical Return" stroke="#e11d48" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="netDemand" name="Net Demand" stroke="#0284c7" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Crop Mix */}
              <div>
                <h3 className="text-sm font-semibold uppercase text-slate-500 mb-4">Crop Mix by Net Demand</h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs uppercase border-b">
                      <tr>
                        <th className="px-4 py-2">Crop</th>
                        <th className="px-4 py-2 text-right">Gross Qty</th>
                        <th className="px-4 py-2 text-right">Return Qty</th>
                        <th className="px-4 py-2 text-right">Net Demand</th>
                        <th className="px-4 py-2 text-right">Return Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedDealer.cropMix.map(c => (
                        <tr key={c.crop} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium">{c.crop}</td>
                          <td className="px-4 py-2 text-right">{formatQuantity(c.grossSalesQty)}</td>
                          <td className="px-4 py-2 text-right text-rose-600">{formatQuantity(c.salesReturnQty)}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatQuantity(c.netDemand)}</td>
                          <td className="px-4 py-2 text-right">{c.returnRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SKU Mix */}
              <div>
                <h3 className="text-sm font-semibold uppercase text-slate-500 mb-4">SKU Mix by Net Demand</h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs uppercase border-b">
                      <tr>
                        <th className="px-4 py-2">SKU</th>
                        <th className="px-4 py-2 text-right">Net Demand</th>
                        <th className="px-4 py-2 text-right">Return Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedDealer.skuMix.map(s => (
                        <tr key={s.skuId} className="hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <div className="font-medium">{s.uniqueSkuName}</div>
                            <div className="text-xs text-slate-400">{s.crop} | {s.skuId}</div>
                          </td>
                          <td className="px-4 py-2 text-right font-medium">{formatQuantity(s.netDemand)}</td>
                          <td className="px-4 py-2 text-right">{s.returnRate.toFixed(1)}%</td>
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
