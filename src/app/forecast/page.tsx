"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { loadProcessedData } from '@/lib/db';
import { aggregateByCrop, CropMetrics, calculateForecastScenario } from '@/lib/analytics';
import { formatQuantity } from '@/lib/utils';
import { TrendingUp, AlertTriangle } from 'lucide-react';

export default function ForecastPlanner() {
  const [cropData, setCropData] = useState<CropMetrics[]>([]);
  const [selectedCrop, setSelectedCrop] = useState<string>('All');
  
  const [growthRate, setGrowthRate] = useState<number>(0);
  const [usableStock, setUsableStock] = useState<number>(100);

  useEffect(() => {
    loadProcessedData().then(data => {
      if (data.sales && data.skuMaster) {
        setCropData(aggregateByCrop(data.sales, data.purchase, data.returns, data.stock, data.skuMaster));
      }
    });
  }, []);

  const activeData = selectedCrop === 'All' 
    ? { netDemand: cropData.reduce((acc, c) => acc + c.netDemand, 0), closingStock: cropData.reduce((acc, c) => acc + c.closingStockQuantity, 0) }
    : { netDemand: cropData.find(c => c.crop === selectedCrop)?.netDemand || 0, closingStock: cropData.find(c => c.crop === selectedCrop)?.closingStockQuantity || 0 };

  const scenario = calculateForecastScenario(activeData.netDemand, growthRate, activeData.closingStock, usableStock);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">NEXT-SEASON PURCHASE PLANNER</h1>
        <p className="text-slate-500 mt-1">Scenario-based planning using FY 2025–26 Net Demand and Closing Stock</p>
      </div>
      
      <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-medium">This is a scenario planner, not a machine-learning forecast.</p>
          <p className="text-xs mt-1 text-amber-700/80">Projections are purely deterministic based on your inputs and current historical data.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Scenario Assumptions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Crop Filter</label>
                <select 
                  className="w-full border-slate-200 rounded-md text-sm focus:ring-blue-500 p-2 border"
                  value={selectedCrop}
                  onChange={e => setSelectedCrop(e.target.value)}
                >
                  <option value="All">All Crops</option>
                  {cropData.map(c => <option key={c.crop} value={c.crop}>{c.crop}</option>)}
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-slate-700">Expected Growth (%)</label>
                  <span className="text-sm font-bold text-blue-600">{growthRate > 0 ? '+' : ''}{growthRate}%</span>
                </div>
                <input 
                  type="range" min="-30" max="100" step="5"
                  value={growthRate}
                  onChange={e => setGrowthRate(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-slate-700">Usable Stock (%)</label>
                  <span className="text-sm font-bold text-blue-600">{usableStock}%</span>
                </div>
                <input 
                  type="range" min="0" max="100" step="10"
                  value={usableStock}
                  onChange={e => setUsableStock(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <p className="text-xs text-slate-500 leading-relaxed">
                  Management assumption for the share of Closing Stock considered usable for next season.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-gradient-to-br from-blue-900 to-slate-900 text-white border-0 shadow-lg">
            <CardContent className="p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-blue-500/20 rounded-xl">
                  <TrendingUp className="h-6 w-6 text-blue-300" />
                </div>
                <h2 className="text-xl font-medium text-blue-100">Recommended Fresh Purchase</h2>
              </div>
              <div className="text-5xl font-bold tracking-tight mb-2">
                {formatQuantity(scenario.freshPurchaseReq)}
              </div>
              <p className="text-blue-200/80 text-sm">Required new intake to meet forecast demand considering usable stock.</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="text-sm font-medium text-slate-500 mb-1">Base Net Demand</div>
                <div className="text-2xl font-bold text-slate-900">{formatQuantity(activeData.netDemand)}</div>
                <div className="text-xs text-slate-400 mt-1">FY 25-26 Actual</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm font-medium text-slate-500 mb-1">Forecast Demand</div>
                <div className="text-2xl font-bold text-slate-900">{formatQuantity(scenario.forecastDemand)}</div>
                <div className="text-xs text-slate-400 mt-1">Based on {growthRate}% growth</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm font-medium text-slate-500 mb-1">Total Closing Stock</div>
                <div className="text-2xl font-bold text-slate-900">{formatQuantity(activeData.closingStock)}</div>
                <div className="text-xs text-slate-400 mt-1">FY 25-26 Ending</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm font-medium text-slate-500 mb-1">Usable Stock</div>
                <div className="text-2xl font-bold text-slate-900">{formatQuantity(scenario.usableStock)}</div>
                <div className="text-xs text-slate-400 mt-1">Based on {usableStock}% usable</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
