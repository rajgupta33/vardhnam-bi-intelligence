import {
  ProcessedSalesRecord,
  ProcessedPurchaseRecord,
  ProcessedSalesReturnRecord,
  ProcessedStockRecord,
  SkuMasterRecord,
} from '@/types';

export interface GlobalMetrics {
  purchaseQuantity: number;
  purchaseValue: number;
  grossSalesQuantity: number;
  grossSalesValue: number;
  salesReturnQuantity: number;
  netDemand: number;
  closingStockQuantity: number;
  closingStockValue: number;
}

export function calculateGlobalMetrics(
  sales: ProcessedSalesRecord[],
  purchase: ProcessedPurchaseRecord[],
  returns: ProcessedSalesReturnRecord[],
  stock: ProcessedStockRecord[],
  skuMaster: SkuMasterRecord[]
): GlobalMetrics {
  const isSeed = (skuId: string | null) => {
    if (!skuId) return false;
    const sku = skuMaster.find((s) => s.skuId === skuId);
    return sku?.category === 'Seed';
  };

  let purchaseQuantity = 0;
  let purchaseValue = 0;
  purchase.forEach((r) => {
    if (r.validationStatus !== 'EXCLUDED' && isSeed(r.skuId)) {
      purchaseQuantity += r.quantityKg || 0;
      purchaseValue += r.value || 0;
    }
  });

  let grossSalesQuantity = 0;
  let grossSalesValue = 0;
  sales.forEach((r) => {
    if (r.validationStatus !== 'EXCLUDED' && isSeed(r.skuId)) {
      grossSalesQuantity += r.quantityKg || 0;
      grossSalesValue += r.value || 0;
    }
  });

  let salesReturnQuantity = 0;
  returns.forEach((r) => {
    if (r.validationStatus !== 'EXCLUDED' && isSeed(r.skuId)) {
      salesReturnQuantity += r.returnQuantityKg || 0;
    }
  });

  const netDemand = grossSalesQuantity - salesReturnQuantity;

  let closingStockQuantity = 0;
  let closingStockValue = 0;
  stock.forEach((r) => {
    if (r.validationStatus !== 'EXCLUDED' && isSeed(r.skuId)) {
      closingStockQuantity += r.closingQuantityKg || 0;
      closingStockValue += r.closingValue || 0;
    }
  });

  return {
    purchaseQuantity,
    purchaseValue,
    grossSalesQuantity,
    grossSalesValue,
    salesReturnQuantity,
    netDemand,
    closingStockQuantity,
    closingStockValue,
  };
}

export function calculatePurchaseDemandGap(purchaseQuantity: number, netDemand: number) {
  return purchaseQuantity - netDemand;
}

export function calculateReturnRate(returnQuantity: number, grossSalesQuantity: number) {
  if (grossSalesQuantity === 0) return 0;
  return (returnQuantity / grossSalesQuantity) * 100;
}

export function calculateForecastScenario(
  netDemand: number,
  growthRatePercent: number,
  closingStock: number,
  usableStockPercent: number
) {
  const forecastDemand = netDemand * (1 + growthRatePercent / 100);
  const usableStock = closingStock * (usableStockPercent / 100);
  const freshPurchaseReq = Math.max(forecastDemand - usableStock, 0);

  return {
    forecastDemand,
    usableStock,
    freshPurchaseReq,
  };
}

export interface CropMetrics extends GlobalMetrics {
  crop: string;
  returnRate: number;
  purchaseToDemandGap: number;
}

export function aggregateByCrop(
  sales: ProcessedSalesRecord[],
  purchase: ProcessedPurchaseRecord[],
  returns: ProcessedSalesReturnRecord[],
  stock: ProcessedStockRecord[],
  skuMaster: SkuMasterRecord[]
): CropMetrics[] {
  const cropMap = new Map<string, CropMetrics>();

  const getCrop = (skuId: string | null) => {
    if (!skuId) return null;
    const sku = skuMaster.find((s) => s.skuId === skuId);
    return sku?.category === 'Seed' ? sku.crop : null;
  };

  const getOrCreate = (crop: string) => {
    if (!cropMap.has(crop)) {
      cropMap.set(crop, {
        crop,
        purchaseQuantity: 0,
        purchaseValue: 0,
        grossSalesQuantity: 0,
        grossSalesValue: 0,
        salesReturnQuantity: 0,
        netDemand: 0,
        closingStockQuantity: 0,
        closingStockValue: 0,
        returnRate: 0,
        purchaseToDemandGap: 0,
      });
    }
    return cropMap.get(crop)!;
  };

  purchase.forEach((r) => {
    if (r.validationStatus === 'EXCLUDED') return;
    const crop = getCrop(r.skuId);
    if (crop) {
      const m = getOrCreate(crop);
      m.purchaseQuantity += r.quantityKg || 0;
      m.purchaseValue += r.value || 0;
    }
  });

  sales.forEach((r) => {
    if (r.validationStatus === 'EXCLUDED') return;
    const crop = getCrop(r.skuId);
    if (crop) {
      const m = getOrCreate(crop);
      m.grossSalesQuantity += r.quantityKg || 0;
      m.grossSalesValue += r.value || 0;
    }
  });

  returns.forEach((r) => {
    if (r.validationStatus === 'EXCLUDED') return;
    const crop = getCrop(r.skuId);
    if (crop) {
      const m = getOrCreate(crop);
      m.salesReturnQuantity += r.returnQuantityKg || 0;
    }
  });

  stock.forEach((r) => {
    if (r.validationStatus === 'EXCLUDED') return;
    const crop = getCrop(r.skuId);
    if (crop) {
      const m = getOrCreate(crop);
      m.closingStockQuantity += r.closingQuantityKg || 0;
      m.closingStockValue += r.closingValue || 0;
    }
  });

  return Array.from(cropMap.values()).map((m) => {
    m.netDemand = m.grossSalesQuantity - m.salesReturnQuantity;
    m.returnRate = calculateReturnRate(m.salesReturnQuantity, m.grossSalesQuantity);
    m.purchaseToDemandGap = calculatePurchaseDemandGap(m.purchaseQuantity, m.netDemand);
    return m;
  });
}

export * from './sku';
export * from './dealer';
