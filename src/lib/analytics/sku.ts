import {
  ProcessedSalesRecord,
  ProcessedPurchaseRecord,
  ProcessedSalesReturnRecord,
  ProcessedPurchaseReturnRecord,
  ProcessedStockRecord,
  SkuMasterRecord,
} from '@/types';
import {
  GlobalMetrics,
  calculateReturnRate,
  calculatePurchaseDemandGap,
  filterByCompany,
  filterByFinancialYear,
  scopeStockToSnapshot,
  type MetricsOptions,
} from './index';

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
  allSales: ProcessedSalesRecord[],
  allPurchase: ProcessedPurchaseRecord[],
  allReturns: ProcessedSalesReturnRecord[],
  allPurchaseReturns: ProcessedPurchaseReturnRecord[],
  allStock: ProcessedStockRecord[],
  skuMaster: SkuMasterRecord[],
  options?: MetricsOptions
): SkuMetrics[] {
  const sales = filterByFinancialYear(
    filterByCompany(allSales, options?.company),
    options?.financialYear
  );
  const purchase = filterByFinancialYear(
    filterByCompany(allPurchase, options?.company),
    options?.financialYear
  );
  const returns = filterByFinancialYear(
    filterByCompany(allReturns, options?.company),
    options?.financialYear
  );
  const purchaseReturns = filterByFinancialYear(
    filterByCompany(allPurchaseReturns, options?.company),
    options?.financialYear
  );
  // Closing stock is a snapshot, not a flow — never summed across years.
  const stock = scopeStockToSnapshot(
    filterByCompany(allStock, options?.company),
    options?.financialYear
  );

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
        purchaseReturnQuantity: 0,
        purchaseReturnValue: 0,
        valueOnlyDebitNoteValue: 0,
        netPurchaseValue: 0,
        grossSalesQuantity: 0,
        grossSalesValue: 0,
        salesReturnQuantity: 0,
        salesReturnValue: 0,
        valueOnlyCreditNoteValue: 0,
        netDemand: 0,
        netSalesValue: 0,
        closingStockQuantity: 0,
        closingStockValue: 0,
        returnRate: 0,
        purchaseToDemandGap: 0,
        quantityByUnit: { purchase: {}, sales: {}, returns: {}, purchaseReturns: {}, stock: {} },
      });
    }
    return skuMap.get(sku.skuId)!;
  };

  const byId = new Map(skuMaster.map((s) => [s.skuId, s]));
  const getSku = (id: string | null) => (id ? byId.get(id) || null : null);

  const addUnit = (bucket: Record<string, number>, unit: string | null | undefined, qty: number | null | undefined) => {
    const key = unit || 'UNSPECIFIED';
    bucket[key] = (bucket[key] || 0) + (qty || 0);
  };

  const isCountable = (r: { validationStatus: string; isCancelled?: boolean; isOptional?: boolean }) =>
    r.validationStatus !== 'EXCLUDED' && !r.isCancelled && !r.isOptional;

  purchase.forEach(r => {
    if (!isCountable(r)) return;
    const sku = getSku(r.skuId);
    if (sku) {
      const m = getOrCreate(sku);
      m.purchaseQuantity += r.quantityKg || 0;
      m.purchaseValue += r.value || 0;
      addUnit(m.quantityByUnit.purchase, r.unit, r.quantity);
    }
  });

  sales.forEach(r => {
    if (!isCountable(r)) return;
    const sku = getSku(r.skuId);
    if (sku) {
      const m = getOrCreate(sku);
      m.grossSalesQuantity += r.quantityKg || 0;
      m.grossSalesValue += r.value || 0;
      addUnit(m.quantityByUnit.sales, r.unit, r.quantity);
    }
  });

  returns.forEach(r => {
    if (!isCountable(r)) return;
    const sku = getSku(r.skuId);
    if (sku) {
      const m = getOrCreate(sku);
      if (r.returnKind === 'VALUE_ONLY') {
        m.valueOnlyCreditNoteValue += r.returnValue || 0;
        return;
      }
      m.salesReturnQuantity += r.returnQuantityKg || 0;
      m.salesReturnValue += r.returnValue || 0;
      addUnit(m.quantityByUnit.returns, r.unit, r.returnQuantity);
    }
  });

  purchaseReturns.forEach(r => {
    if (!isCountable(r)) return;
    const sku = getSku(r.skuId);
    if (sku) {
      const m = getOrCreate(sku);
      if (r.returnKind === 'VALUE_ONLY') {
        m.valueOnlyDebitNoteValue += r.returnValue || 0;
        return;
      }
      m.purchaseReturnQuantity += r.returnQuantityKg || 0;
      m.purchaseReturnValue += r.returnValue || 0;
      addUnit(m.quantityByUnit.purchaseReturns, r.unit, r.returnQuantity);
    }
  });

  stock.forEach(r => {
    if (!isCountable(r)) return;
    const sku = getSku(r.skuId);
    if (sku) {
      const m = getOrCreate(sku);
      m.closingStockQuantity += r.closingQuantityKg || 0;
      m.closingStockValue += r.closingValue || 0;
      addUnit(m.quantityByUnit.stock, r.unit, r.closingQuantity);
    }
  });

  return Array.from(skuMap.values()).map(m => {
    m.netDemand = m.grossSalesQuantity - m.salesReturnQuantity;
    m.netSalesValue = m.grossSalesValue - m.salesReturnValue - m.valueOnlyCreditNoteValue;
    m.netPurchaseValue = m.purchaseValue - m.purchaseReturnValue - m.valueOnlyDebitNoteValue;
    m.returnRate = calculateReturnRate(m.salesReturnQuantity, m.grossSalesQuantity);
    m.purchaseToDemandGap = calculatePurchaseDemandGap(m.purchaseQuantity, m.netDemand);
    return m;
  });
}
