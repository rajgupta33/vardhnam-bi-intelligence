import {
  ProcessedSalesRecord,
  ProcessedPurchaseRecord,
  ProcessedSalesReturnRecord,
  ProcessedStockRecord,
  SkuMasterRecord,
} from '@/types';
import { GlobalMetrics, calculateReturnRate, calculatePurchaseDemandGap } from './index';

export interface SkuMetrics extends GlobalMetrics {
  skuId: string;
  uniqueSkuName: string;
  crop: string;
  variety: string;
  packSize: string;
  category: string;
  returnRate: number;
  purchaseToDemandGap: number;
}

export function aggregateBySku(
  sales: ProcessedSalesRecord[],
  purchase: ProcessedPurchaseRecord[],
  returns: ProcessedSalesReturnRecord[],
  stock: ProcessedStockRecord[],
  skuMaster: SkuMasterRecord[]
): SkuMetrics[] {
  const skuMap = new Map<string, SkuMetrics>();

  const getOrCreate = (sku: SkuMasterRecord) => {
    if (!skuMap.has(sku.skuId)) {
      skuMap.set(sku.skuId, {
        skuId: sku.skuId,
        uniqueSkuName: sku.uniqueSkuName,
        crop: sku.crop,
        variety: sku.variety,
        packSize: sku.packSize,
        category: sku.category,
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
    return skuMap.get(sku.skuId)!;
  };

  const getSku = (id: string | null) => {
    if (!id) return null;
    return skuMaster.find(s => s.skuId === id) || null;
  };

  purchase.forEach(r => {
    if (r.validationStatus === 'EXCLUDED') return;
    const sku = getSku(r.skuId);
    if (sku) {
      const m = getOrCreate(sku);
      m.purchaseQuantity += r.quantityKg || 0;
      m.purchaseValue += r.value || 0;
    }
  });

  sales.forEach(r => {
    if (r.validationStatus === 'EXCLUDED') return;
    const sku = getSku(r.skuId);
    if (sku) {
      const m = getOrCreate(sku);
      m.grossSalesQuantity += r.quantityKg || 0;
      m.grossSalesValue += r.value || 0;
    }
  });

  returns.forEach(r => {
    if (r.validationStatus === 'EXCLUDED') return;
    const sku = getSku(r.skuId);
    if (sku) {
      const m = getOrCreate(sku);
      m.salesReturnQuantity += r.returnQuantityKg || 0;
    }
  });

  stock.forEach(r => {
    if (r.validationStatus === 'EXCLUDED') return;
    const sku = getSku(r.skuId);
    if (sku) {
      const m = getOrCreate(sku);
      m.closingStockQuantity += r.closingQuantityKg || 0;
      m.closingStockValue += r.closingValue || 0;
    }
  });

  return Array.from(skuMap.values()).map(m => {
    m.netDemand = m.grossSalesQuantity - m.salesReturnQuantity;
    m.returnRate = calculateReturnRate(m.salesReturnQuantity, m.grossSalesQuantity);
    m.purchaseToDemandGap = calculatePurchaseDemandGap(m.purchaseQuantity, m.netDemand);
    return m;
  });
}
