import {
  ProcessedSalesRecord,
  ProcessedPurchaseRecord,
  ProcessedSalesReturnRecord,
  ProcessedPurchaseReturnRecord,
  ProcessedStockRecord,
  ProcessedAdjustmentRecord,
  ValidationIssue,
  SkuMasterRecord,
} from '@/types';

function reviveDates<T extends object>(records: T[], fields: (keyof T)[]): T[] {
  return records.map((r) => {
    const copy = { ...r };
    for (const field of fields) {
      const value = copy[field];
      if (value) copy[field] = new Date(value as unknown as string) as unknown as T[keyof T];
    }
    return copy;
  });
}

export interface ProcessedDataset {
  sales: ProcessedSalesRecord[];
  purchase: ProcessedPurchaseRecord[];
  returns: ProcessedSalesReturnRecord[];
  purchaseReturns: ProcessedPurchaseReturnRecord[];
  stock: ProcessedStockRecord[];
  adjustments: ProcessedAdjustmentRecord[];
  issues: ValidationIssue[];
  skuMaster: SkuMasterRecord[];
  lastUpdated: Date | null;
}

export async function loadProcessedData(): Promise<ProcessedDataset> {
  const res = await fetch('/api/data', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load data from the server');
  const data = await res.json();

  return {
    sales: reviveDates<ProcessedSalesRecord>(data.sales, ['date']),
    purchase: reviveDates<ProcessedPurchaseRecord>(data.purchase, ['date']),
    returns: reviveDates<ProcessedSalesReturnRecord>(data.returns, ['date']),
    purchaseReturns: reviveDates<ProcessedPurchaseReturnRecord>(data.purchaseReturns ?? [], ['date']),
    stock: reviveDates<ProcessedStockRecord>(data.stock, ['snapshotDate']),
    adjustments: reviveDates<ProcessedAdjustmentRecord>(data.adjustments ?? [], ['date']),
    issues: data.issues as ValidationIssue[],
    skuMaster: data.skuMaster as SkuMasterRecord[],
    lastUpdated: data.lastUpdated ? new Date(data.lastUpdated) : null,
  };
}
