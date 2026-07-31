import {
  ProcessedSalesRecord,
  ProcessedPurchaseRecord,
  ProcessedSalesReturnRecord,
  ProcessedPurchaseReturnRecord,
  ProcessedStockRecord,
  SkuMasterRecord,
} from '@/types';

export interface GlobalMetrics {
  /** Gross purchase, before debit notes (purchase returns) are subtracted. */
  purchaseQuantity: number;
  purchaseValue: number;
  /** Goods physically sent back to a supplier. Excludes value-only debit notes. */
  purchaseReturnQuantity: number;
  purchaseReturnValue: number;
  /** Rate-difference and discount debit notes, which move value but no goods. */
  valueOnlyDebitNoteValue: number;
  /** purchaseValue minus physical and value-only debit notes — the figure that ties to Tally. */
  netPurchaseValue: number;
  grossSalesQuantity: number;
  grossSalesValue: number;
  /** Goods physically returned. Excludes value-only credit notes. */
  salesReturnQuantity: number;
  salesReturnValue: number;
  /** Rate-difference and discount credit notes, which move value but no goods. */
  valueOnlyCreditNoteValue: number;
  netDemand: number;
  netSalesValue: number;
  closingStockQuantity: number;
  closingStockValue: number;
  /** Per-unit breakdowns, since quantities in different units must never be summed. */
  quantityByUnit: {
    purchase: Record<string, number>;
    sales: Record<string, number>;
    returns: Record<string, number>;
    purchaseReturns: Record<string, number>;
    stock: Record<string, number>;
  };
}

/**
 * Restricts a dataset to one SKU category (e.g. 'Seed'), or passes everything
 * through when no category is given.
 *
 * The dashboard previously hardcoded a Seed-only filter, which guaranteed its
 * totals could never agree with Tally's. Category is now a caller's choice.
 */
export interface MetricsOptions {
  category?: string | null;
  /** Include rows that have no SKU mapping. They carry real value and are shown by default. */
  includeUnmapped?: boolean;
  /** Restrict to one Tally company. Null means all companies combined. */
  company?: string | null;
  /** Restrict to one financial year, e.g. "FY2024-25". Null means every year combined. */
  financialYear?: string | null;
}

/**
 * Restricts rows to one company when a filter is active.
 *
 * Combined figures include inter-company trade by design — see the
 * reconciliation page for its size — so nothing is netted out here.
 */
export function filterByCompany<T extends { company?: string }>(
  rows: T[],
  company?: string | null
): T[] {
  if (!company) return rows;
  return rows.filter((r) => r.company === company);
}

/** Distinct companies present in a dataset, for the dashboard's company filter. */
export function listCompanies(rows: { company?: string }[]): string[] {
  return Array.from(new Set(rows.map((r) => r.company).filter((c): c is string => Boolean(c)))).sort();
}

/**
 * Restricts rows to one financial year when a filter is active.
 *
 * For dated flows only — sales, purchases, returns, adjustments. Closing stock
 * goes through `scopeStockToSnapshot` instead, because summing balances from
 * different year ends is meaningless.
 */
export function filterByFinancialYear<T extends { financialYear?: string | null }>(
  rows: T[],
  financialYear?: string | null
): T[] {
  if (!financialYear) return rows;
  return rows.filter((r) => r.financialYear === financialYear);
}

/** Distinct financial years present in a dataset, for the dashboard's year filter. */
export function listFinancialYears(rows: { financialYear?: string | null }[]): string[] {
  return Array.from(new Set(rows.map((r) => r.financialYear).filter((fy): fy is string => Boolean(fy)))).sort();
}

/**
 * Narrows closing stock to a single point in time.
 *
 * Sales and purchases accumulate over a year, so "all years" sensibly means
 * their sum. Closing stock does not: each year's file holds the balance as at
 * that year end, and adding several together describes no real moment. With a
 * year selected the caller gets that year's snapshot; without one they get the
 * most recent, which is what "current closing stock" means.
 */
export function scopeStockToSnapshot<T extends { financialYear?: string | null }>(
  rows: T[],
  financialYear?: string | null
): T[] {
  if (financialYear) return rows.filter((r) => r.financialYear === financialYear);

  const years = listFinancialYears(rows);
  if (years.length <= 1) return rows;

  const latest = years[years.length - 1];
  // Untagged rows are kept: they predate year tagging and dropping them would
  // silently zero the stock figures rather than show a stale one.
  return rows.filter((r) => !r.financialYear || r.financialYear === latest);
}

function categoryMatcher(skuMaster: SkuMasterRecord[], options?: MetricsOptions) {
  const { category = null, includeUnmapped = true } = options ?? {};
  const byId = new Map(skuMaster.map((s) => [s.skuId, s]));

  return (skuId: string | null) => {
    if (!skuId) return includeUnmapped && !category;
    const sku = byId.get(skuId);
    if (!sku) return includeUnmapped && !category;
    return category ? sku.category === category : true;
  };
}

/** Rows excluded by validation, or belonging to cancelled/optional vouchers, never count. */
function isCountable(r: { validationStatus: string; isCancelled?: boolean; isOptional?: boolean }) {
  return r.validationStatus !== 'EXCLUDED' && !r.isCancelled && !r.isOptional;
}

function addUnit(bucket: Record<string, number>, unit: string | null | undefined, qty: number | null | undefined) {
  const key = unit || 'UNSPECIFIED';
  bucket[key] = (bucket[key] || 0) + (qty || 0);
}

export function calculateGlobalMetrics(
  allSales: ProcessedSalesRecord[],
  allPurchase: ProcessedPurchaseRecord[],
  allReturns: ProcessedSalesReturnRecord[],
  allPurchaseReturns: ProcessedPurchaseReturnRecord[],
  allStock: ProcessedStockRecord[],
  skuMaster: SkuMasterRecord[],
  options?: MetricsOptions
): GlobalMetrics {
  const inScope = categoryMatcher(skuMaster, options);

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

  const quantityByUnit = {
    purchase: {} as Record<string, number>,
    sales: {} as Record<string, number>,
    returns: {} as Record<string, number>,
    purchaseReturns: {} as Record<string, number>,
    stock: {} as Record<string, number>,
  };

  let purchaseQuantity = 0;
  let purchaseValue = 0;
  purchase.forEach((r) => {
    if (!isCountable(r) || !inScope(r.skuId)) return;
    purchaseQuantity += r.quantityKg || 0;
    purchaseValue += r.value || 0;
    addUnit(quantityByUnit.purchase, r.unit, r.quantity);
  });

  let purchaseReturnQuantity = 0;
  let purchaseReturnValue = 0;
  let valueOnlyDebitNoteValue = 0;
  purchaseReturns.forEach((r) => {
    if (!isCountable(r) || !inScope(r.skuId)) return;
    if (r.returnKind === 'VALUE_ONLY') {
      valueOnlyDebitNoteValue += r.returnValue || 0;
      return;
    }
    purchaseReturnQuantity += r.returnQuantityKg || 0;
    purchaseReturnValue += r.returnValue || 0;
    addUnit(quantityByUnit.purchaseReturns, r.unit, r.returnQuantity);
  });
  const netPurchaseValue = purchaseValue - purchaseReturnValue - valueOnlyDebitNoteValue;

  let grossSalesQuantity = 0;
  let grossSalesValue = 0;
  sales.forEach((r) => {
    if (!isCountable(r) || !inScope(r.skuId)) return;
    grossSalesQuantity += r.quantityKg || 0;
    grossSalesValue += r.value || 0;
    addUnit(quantityByUnit.sales, r.unit, r.quantity);
  });

  let salesReturnQuantity = 0;
  let salesReturnValue = 0;
  let valueOnlyCreditNoteValue = 0;
  returns.forEach((r) => {
    if (!isCountable(r) || !inScope(r.skuId)) return;
    if (r.returnKind === 'VALUE_ONLY') {
      valueOnlyCreditNoteValue += r.returnValue || 0;
      return;
    }
    salesReturnQuantity += r.returnQuantityKg || 0;
    salesReturnValue += r.returnValue || 0;
    addUnit(quantityByUnit.returns, r.unit, r.returnQuantity);
  });

  const netDemand = grossSalesQuantity - salesReturnQuantity;
  const netSalesValue = grossSalesValue - salesReturnValue - valueOnlyCreditNoteValue;

  let closingStockQuantity = 0;
  let closingStockValue = 0;
  stock.forEach((r) => {
    if (!isCountable(r) || !inScope(r.skuId)) return;
    closingStockQuantity += r.closingQuantityKg || 0;
    closingStockValue += r.closingValue || 0;
    addUnit(quantityByUnit.stock, r.unit, r.closingQuantity);
  });

  return {
    purchaseQuantity,
    purchaseValue,
    purchaseReturnQuantity,
    purchaseReturnValue,
    valueOnlyDebitNoteValue,
    netPurchaseValue,
    grossSalesQuantity,
    grossSalesValue,
    salesReturnQuantity,
    salesReturnValue,
    valueOnlyCreditNoteValue,
    netDemand,
    netSalesValue,
    closingStockQuantity,
    closingStockValue,
    quantityByUnit,
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
  allSales: ProcessedSalesRecord[],
  allPurchase: ProcessedPurchaseRecord[],
  allReturns: ProcessedSalesReturnRecord[],
  allPurchaseReturns: ProcessedPurchaseReturnRecord[],
  allStock: ProcessedStockRecord[],
  skuMaster: SkuMasterRecord[],
  options?: MetricsOptions
): CropMetrics[] {
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

  const cropMap = new Map<string, CropMetrics>();
  const byId = new Map(skuMaster.map((s) => [s.skuId, s]));
  const category = options?.category ?? null;

  /**
   * Rows without a SKU are bucketed under "Unmapped" rather than dropped, so the
   * crop breakdown still adds up to the headline totals.
   */
  const getCrop = (skuId: string | null) => {
    if (!skuId) return category ? null : 'Unmapped';
    const sku = byId.get(skuId);
    if (!sku) return category ? null : 'Unmapped';
    if (category && sku.category !== category) return null;
    return sku.crop || 'Uncategorised';
  };

  const getOrCreate = (crop: string) => {
    if (!cropMap.has(crop)) {
      cropMap.set(crop, {
        crop,
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
    return cropMap.get(crop)!;
  };

  purchase.forEach((r) => {
    if (!isCountable(r)) return;
    const crop = getCrop(r.skuId);
    if (!crop) return;
    const m = getOrCreate(crop);
    m.purchaseQuantity += r.quantityKg || 0;
    m.purchaseValue += r.value || 0;
    addUnit(m.quantityByUnit.purchase, r.unit, r.quantity);
  });

  sales.forEach((r) => {
    if (!isCountable(r)) return;
    const crop = getCrop(r.skuId);
    if (!crop) return;
    const m = getOrCreate(crop);
    m.grossSalesQuantity += r.quantityKg || 0;
    m.grossSalesValue += r.value || 0;
    addUnit(m.quantityByUnit.sales, r.unit, r.quantity);
  });

  returns.forEach((r) => {
    if (!isCountable(r)) return;
    const crop = getCrop(r.skuId);
    if (!crop) return;
    const m = getOrCreate(crop);
    if (r.returnKind === 'VALUE_ONLY') {
      m.valueOnlyCreditNoteValue += r.returnValue || 0;
      return;
    }
    m.salesReturnQuantity += r.returnQuantityKg || 0;
    m.salesReturnValue += r.returnValue || 0;
    addUnit(m.quantityByUnit.returns, r.unit, r.returnQuantity);
  });

  purchaseReturns.forEach((r) => {
    if (!isCountable(r)) return;
    const crop = getCrop(r.skuId);
    if (!crop) return;
    const m = getOrCreate(crop);
    if (r.returnKind === 'VALUE_ONLY') {
      m.valueOnlyDebitNoteValue += r.returnValue || 0;
      return;
    }
    m.purchaseReturnQuantity += r.returnQuantityKg || 0;
    m.purchaseReturnValue += r.returnValue || 0;
    addUnit(m.quantityByUnit.purchaseReturns, r.unit, r.returnQuantity);
  });

  stock.forEach((r) => {
    if (!isCountable(r)) return;
    const crop = getCrop(r.skuId);
    if (!crop) return;
    const m = getOrCreate(crop);
    m.closingStockQuantity += r.closingQuantityKg || 0;
    m.closingStockValue += r.closingValue || 0;
    addUnit(m.quantityByUnit.stock, r.unit, r.closingQuantity);
  });

  return Array.from(cropMap.values()).map((m) => {
    m.netDemand = m.grossSalesQuantity - m.salesReturnQuantity;
    m.netSalesValue = m.grossSalesValue - m.salesReturnValue - m.valueOnlyCreditNoteValue;
    m.netPurchaseValue = m.purchaseValue - m.purchaseReturnValue - m.valueOnlyDebitNoteValue;
    m.returnRate = calculateReturnRate(m.salesReturnQuantity, m.grossSalesQuantity);
    m.purchaseToDemandGap = calculatePurchaseDemandGap(m.purchaseQuantity, m.netDemand);
    return m;
  });
}

/** Distinct SKU categories present in the master, for the dashboard's category filter. */
export function listCategories(skuMaster: SkuMasterRecord[]): string[] {
  return Array.from(new Set(skuMaster.map((s) => s.category).filter(Boolean))).sort();
}

export * from './sku';
export * from './dealer';
