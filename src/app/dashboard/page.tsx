"use client";

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { loadProcessedData } from '@/lib/db';
import { calculateGlobalMetrics, GlobalMetrics, aggregateByCrop, CropMetrics } from '@/lib/analytics';
import { formatQuantity, formatCurrencyINR, truncateText } from '@/lib/utils';
import { Activity, IndianRupee, Package, Scale, TrendingDown, RefreshCcw, Undo2, Boxes } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

export default function CommandCentre() {
  const [metrics, setMetrics] = useState<GlobalMetrics | null>(null);
  const [cropData, setCropData] = useState<CropMetrics[]>([]);

  useEffect(() => {
    loadProcessedData().then(data => {
      if (data.sales && data.skuMaster) {
        setMetrics(calculateGlobalMetrics(data.sales, data.purchase, data.returns, data.stock, data.skuMaster));
        setCropData(aggregateByCrop(data.sales, data.purchase, data.returns, data.stock, data.skuMaster));
      }
    });
  }, []);

  if (!metrics) {
    return <div className="p-8 text-slate-500 flex h-full items-center justify-center">Loading Command Centre...</div>;
  }

  const sortedByDemand = [...cropData].sort((a, b) => b.netDemand - a.netDemand).slice(0, 10);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">CEO COMMAND CENTRE</h1>
        <p className="text-slate-500 mt-1">FY 2025–26 Purchase, Demand, Return & Stock Overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Purchase Quantity" value={formatQuantity(metrics.purchaseQuantity)} exactValue={`${metrics.purchaseQuantity.toLocaleString()} Kg`} icon={Package} description="Mapped Seed Purchase" />
        <KpiCard title="Purchase Value" value={formatCurrencyINR(metrics.purchaseValue)} exactValue={`₹${metrics.purchaseValue.toLocaleString()}`} icon={IndianRupee} description="Total Purchase Value" />
        <KpiCard title="Gross Sales Qty" value={formatQuantity(metrics.grossSalesQuantity)} exactValue={`${metrics.grossSalesQuantity.toLocaleString()} Kg`} icon={Activity} description="Gross Seed Sales" />
        <KpiCard title="Net Demand" value={formatQuantity(metrics.netDemand)} exactValue={`${metrics.netDemand.toLocaleString()} Kg`} icon={Scale} description="Sales minus Returns" />
        <KpiCard title="Physical Sales Return" value={formatQuantity(metrics.salesReturnQuantity)} exactValue={`${metrics.salesReturnQuantity.toLocaleString()} Kg`} icon={Undo2} description="Actual Return Qty" />
        <KpiCard title="Return Rate" value={metrics.grossSalesQuantity ? (metrics.salesReturnQuantity / metrics.grossSalesQuantity * 100).toFixed(1) + '%' : '0%'} exactValue="Return Qty / Gross Sales Qty" icon={TrendingDown} description="Overall Return Rate" />
        <KpiCard title="Closing Stock Qty" value={formatQuantity(metrics.closingStockQuantity)} exactValue={`${metrics.closingStockQuantity.toLocaleString()} Kg`} icon={Boxes} description="Actual Godown Stock" />
        <KpiCard title="Closing Stock Value" value={formatCurrencyINR(metrics.closingStockValue)} exactValue={`₹${metrics.closingStockValue.toLocaleString()}`} icon={IndianRupee} description="Godown Stock Value" />
      </div>
      
      <div className="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-4">
        <RefreshCcw className="h-5 w-5 text-blue-600 shrink-0" />
        <p className="text-sm text-blue-900 font-medium leading-relaxed">
          Executive Insight: Total Purchase-to-Demand gap is {formatQuantity(metrics.purchaseQuantity - metrics.netDemand)}. 
          Opening stock is not included in this reconciliation.
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
                <RechartsTooltip formatter={(value: any) => [`${Number(value || 0).toLocaleString()} Kg`, '']} />
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
                <RechartsTooltip formatter={(value: any) => [`${Number(value || 0).toLocaleString()} Kg`, '']} />
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

function KpiCard({ title, value, exactValue, icon: Icon, description }: any) {
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
