import {
  ProcessedSalesRecord,
  ProcessedSalesReturnRecord,
  SkuMasterRecord,
} from '@/types';
import { calculateReturnRate } from './index';

export interface MonthlyDealerPattern {
  month: string;
  grossSalesQty: number;
  salesReturnQty: number;
  netDemand: number;
}

export interface DealerCropMix {
  crop: string;
  grossSalesQty: number;
  salesReturnQty: number;
  netDemand: number;
  returnRate: number;
  netDemandShare: number;
}

export interface DealerSkuMix {
  skuId: string;
  uniqueSkuName: string;
  crop: string;
  grossSalesQty: number;
  salesReturnQty: number;
  netDemand: number;
  returnRate: number;
}

export interface DealerMetrics {
  partyName: string;
  grossSalesQuantity: number;
  grossSalesValue: number;
  salesReturnQuantity: number;
  netDemand: number;
  returnRate: number;
  shareOfTotalNetDemand: number;
  shareOfTotalPhysicalReturn: number;
  cropCount: number;
  skuCount: number;
  topCropByNetDemand: string | null;
  topSkuByNetDemand: string | null;
  cropMix: DealerCropMix[];
  skuMix: DealerSkuMix[];
  monthlyPattern: MonthlyDealerPattern[];
}

const FINANCIAL_MONTHS = [
  'April', 'May', 'June', 'July', 'August', 'September', 
  'October', 'November', 'December', 'January', 'February', 'March'
];

export function aggregateByDealer(
  sales: ProcessedSalesRecord[],
  returns: ProcessedSalesReturnRecord[],
  skuMaster: SkuMasterRecord[]
): DealerMetrics[] {
  const isSeed = (skuId: string | null) => {
    if (!skuId) return false;
    const sku = skuMaster.find((s) => s.skuId === skuId);
    return sku?.category === 'Seed';
  };

  const getSkuInfo = (skuId: string | null) => {
    if (!skuId) return null;
    return skuMaster.find((s) => s.skuId === skuId) || null;
  };

  const getMonthName = (date: Date | null) => {
    if (!date) return 'Unknown';
    return date.toLocaleString('default', { month: 'long' });
  };

  // Intermediate state
  const dealerMap = new Map<string, {
    grossSalesQuantity: number;
    grossSalesValue: number;
    salesReturnQuantity: number;
    crops: Map<string, { grossSalesQty: number; salesReturnQty: number }>;
    skus: Map<string, { grossSalesQty: number; salesReturnQty: number }>;
    months: Map<string, { grossSalesQty: number; salesReturnQty: number }>;
  }>();

  const getOrCreate = (partyName: string) => {
    if (!partyName) partyName = 'Unknown';
    if (!dealerMap.has(partyName)) {
      dealerMap.set(partyName, {
        grossSalesQuantity: 0,
        grossSalesValue: 0,
        salesReturnQuantity: 0,
        crops: new Map(),
        skus: new Map(),
        months: new Map(),
      });
    }
    return dealerMap.get(partyName)!;
  };

  let totalNetDemand = 0;
  let totalPhysicalReturn = 0;

  sales.forEach(r => {
    if (r.validationStatus === 'EXCLUDED' || !isSeed(r.skuId)) return;
    const m = getOrCreate(r.party);
    const qty = r.quantityKg || 0;
    const val = r.value || 0;
    const skuInfo = getSkuInfo(r.skuId);
    if (!skuInfo) return;

    m.grossSalesQuantity += qty;
    m.grossSalesValue += val;

    // Crop mix
    const cropData = m.crops.get(skuInfo.crop) || { grossSalesQty: 0, salesReturnQty: 0 };
    cropData.grossSalesQty += qty;
    m.crops.set(skuInfo.crop, cropData);

    // SKU mix
    const skuData = m.skus.get(skuInfo.skuId) || { grossSalesQty: 0, salesReturnQty: 0 };
    skuData.grossSalesQty += qty;
    m.skus.set(skuInfo.skuId, skuData);

    // Monthly
    const month = getMonthName(r.date);
    const monthData = m.months.get(month) || { grossSalesQty: 0, salesReturnQty: 0 };
    monthData.grossSalesQty += qty;
    m.months.set(month, monthData);
  });

  returns.forEach(r => {
    if (r.validationStatus === 'EXCLUDED' || !isSeed(r.skuId)) return;
    // Do not implicitly create dealers if they only have returns (or maybe we do, since they are parties)
    const m = getOrCreate(r.party);
    const qty = r.returnQuantityKg || 0;
    const skuInfo = getSkuInfo(r.skuId);
    if (!skuInfo) return;

    m.salesReturnQuantity += qty;
    totalPhysicalReturn += qty;

    // Crop mix
    const cropData = m.crops.get(skuInfo.crop) || { grossSalesQty: 0, salesReturnQty: 0 };
    cropData.salesReturnQty += qty;
    m.crops.set(skuInfo.crop, cropData);

    // SKU mix
    const skuData = m.skus.get(skuInfo.skuId) || { grossSalesQty: 0, salesReturnQty: 0 };
    skuData.salesReturnQty += qty;
    m.skus.set(skuInfo.skuId, skuData);

    // Monthly
    const month = getMonthName(r.date);
    const monthData = m.months.get(month) || { grossSalesQty: 0, salesReturnQty: 0 };
    monthData.salesReturnQty += qty;
    m.months.set(month, monthData);
  });

  const dealers: DealerMetrics[] = [];

  dealerMap.forEach((data, partyName) => {
    const netDemand = data.grossSalesQuantity - data.salesReturnQuantity;
    totalNetDemand += netDemand; // Note: if netDemand is negative, it still affects total

    const cropMix: DealerCropMix[] = Array.from(data.crops.entries()).map(([crop, cData]) => {
      const cNet = cData.grossSalesQty - cData.salesReturnQty;
      return {
        crop,
        grossSalesQty: cData.grossSalesQty,
        salesReturnQty: cData.salesReturnQty,
        netDemand: cNet,
        returnRate: calculateReturnRate(cData.salesReturnQty, cData.grossSalesQty),
        netDemandShare: 0 // Will calculate below
      };
    }).sort((a, b) => b.netDemand - a.netDemand);

    // Calculate crop net demand share within party
    cropMix.forEach(c => {
      // Use absolute netDemand to avoid weird negatives in pie charts, or just cap at 0
      if (netDemand > 0 && c.netDemand > 0) {
        c.netDemandShare = (c.netDemand / netDemand) * 100;
      }
    });

    const skuMix: DealerSkuMix[] = Array.from(data.skus.entries()).map(([skuId, sData]) => {
      const skuInfo = getSkuInfo(skuId)!;
      return {
        skuId,
        uniqueSkuName: skuInfo.uniqueSkuName,
        crop: skuInfo.crop,
        grossSalesQty: sData.grossSalesQty,
        salesReturnQty: sData.salesReturnQty,
        netDemand: sData.grossSalesQty - sData.salesReturnQty,
        returnRate: calculateReturnRate(sData.salesReturnQty, sData.grossSalesQty)
      };
    }).sort((a, b) => b.netDemand - a.netDemand);

    const monthlyPattern: MonthlyDealerPattern[] = FINANCIAL_MONTHS.map(month => {
      const mData = data.months.get(month) || { grossSalesQty: 0, salesReturnQty: 0 };
      return {
        month,
        grossSalesQty: mData.grossSalesQty,
        salesReturnQty: mData.salesReturnQty,
        netDemand: mData.grossSalesQty - mData.salesReturnQty
      };
    });

    dealers.push({
      partyName,
      grossSalesQuantity: data.grossSalesQuantity,
      grossSalesValue: data.grossSalesValue,
      salesReturnQuantity: data.salesReturnQuantity,
      netDemand,
      returnRate: calculateReturnRate(data.salesReturnQuantity, data.grossSalesQuantity),
      shareOfTotalNetDemand: 0, // Calculated after
      shareOfTotalPhysicalReturn: 0, // Calculated after
      cropCount: data.crops.size,
      skuCount: data.skus.size,
      topCropByNetDemand: cropMix.length > 0 ? cropMix[0].crop : null,
      topSkuByNetDemand: skuMix.length > 0 ? skuMix[0].uniqueSkuName : null,
      cropMix,
      skuMix,
      monthlyPattern
    });
  });

  // Calculate shares globally
  dealers.forEach(d => {
    if (totalNetDemand > 0 && d.netDemand > 0) {
      d.shareOfTotalNetDemand = (d.netDemand / totalNetDemand) * 100;
    }
    if (totalPhysicalReturn > 0 && d.salesReturnQuantity > 0) {
      d.shareOfTotalPhysicalReturn = (d.salesReturnQuantity / totalPhysicalReturn) * 100;
    }
  });

  return dealers.sort((a, b) => b.netDemand - a.netDemand);
}

export function calculateDealerConcentration(dealers: DealerMetrics[], topN: number): number {
  const sortedDealers = [...dealers].sort((a, b) => b.netDemand - a.netDemand);
  
  // Calculate total positive net demand
  const totalPositiveNetDemand = sortedDealers.reduce((sum, d) => sum + (d.netDemand > 0 ? d.netDemand : 0), 0);
  if (totalPositiveNetDemand === 0) return 0;

  const topNDemand = sortedDealers
    .slice(0, topN)
    .reduce((sum, d) => sum + (d.netDemand > 0 ? d.netDemand : 0), 0);

  return (topNDemand / totalPositiveNetDemand) * 100;
}
