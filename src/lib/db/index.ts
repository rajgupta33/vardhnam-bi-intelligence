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

type ApiDataPayload = Partial<{
  sales: ProcessedSalesRecord[];
  purchase: ProcessedPurchaseRecord[];
  returns: ProcessedSalesReturnRecord[];
  purchaseReturns: ProcessedPurchaseReturnRecord[];
  stock: ProcessedStockRecord[];
  adjustments: ProcessedAdjustmentRecord[];
  issues: ValidationIssue[];
  skuMaster: SkuMasterRecord[];
  lastUpdated: string | null;
}>;

function getServerError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const error = (payload as { error?: unknown }).error;
  return typeof error === 'string' && error.trim() ? error : null;
}

export async function loadProcessedData(): Promise<ProcessedDataset> {
  const res = await fetch('/api/data', { cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(getServerError(data) ?? 'Failed to load data from the server');
  }
  const payload: ApiDataPayload = data && typeof data === 'object' ? data : {};

  return {
    sales: reviveDates<ProcessedSalesRecord>(payload.sales ?? [], ['date']),
    purchase: reviveDates<ProcessedPurchaseRecord>(payload.purchase ?? [], ['date']),
    returns: reviveDates<ProcessedSalesReturnRecord>(payload.returns ?? [], ['date']),
    purchaseReturns: reviveDates<ProcessedPurchaseReturnRecord>(payload.purchaseReturns ?? [], ['date']),
    stock: reviveDates<ProcessedStockRecord>(payload.stock ?? [], ['snapshotDate']),
    adjustments: reviveDates<ProcessedAdjustmentRecord>(payload.adjustments ?? [], ['date']),
    issues: payload.issues ?? [],
    skuMaster: payload.skuMaster ?? [],
    lastUpdated: payload.lastUpdated ? new Date(payload.lastUpdated) : null,
  };
}
