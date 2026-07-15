import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  ProcessedSalesRecord,
  ProcessedPurchaseRecord,
  ProcessedSalesReturnRecord,
  ProcessedStockRecord,
  ValidationIssue,
  SkuMasterRecord
} from '@/types';

interface VardhnamDB extends DBSchema {
  sales: {
    key: string;
    value: ProcessedSalesRecord;
  };
  purchase: {
    key: string;
    value: ProcessedPurchaseRecord;
  };
  returns: {
    key: string;
    value: ProcessedSalesReturnRecord;
  };
  stock: {
    key: string;
    value: ProcessedStockRecord;
  };
  issues: {
    key: string;
    value: ValidationIssue;
  };
  skuMaster: {
    key: string;
    value: SkuMasterRecord;
  };
  metadata: {
    key: string;
    value: { key: string; value: any };
  }
}

let dbPromise: Promise<IDBPDatabase<VardhnamDB>> | null = null;

export async function getDB() {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB cannot be used on the server');
  }
  
  if (!dbPromise) {
    dbPromise = openDB<VardhnamDB>('VardhnamAnalyticsDB', 1, {
      upgrade(db) {
        db.createObjectStore('sales', { keyPath: 'id' });
        db.createObjectStore('purchase', { keyPath: 'id' });
        db.createObjectStore('returns', { keyPath: 'id' });
        db.createObjectStore('stock', { keyPath: 'id' });
        db.createObjectStore('issues', { keyPath: 'issueId' });
        db.createObjectStore('skuMaster', { keyPath: 'skuId' });
        db.createObjectStore('metadata', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export async function clearAllData() {
  const db = await getDB();
  const tx = db.transaction(['sales', 'purchase', 'returns', 'stock', 'issues', 'skuMaster', 'metadata'], 'readwrite');
  await Promise.all([
    tx.objectStore('sales').clear(),
    tx.objectStore('purchase').clear(),
    tx.objectStore('returns').clear(),
    tx.objectStore('stock').clear(),
    tx.objectStore('issues').clear(),
    tx.objectStore('skuMaster').clear(),
    tx.objectStore('metadata').clear(),
    tx.done
  ]);
}

export async function saveProcessedData(data: {
  sales: ProcessedSalesRecord[];
  purchase: ProcessedPurchaseRecord[];
  returns: ProcessedSalesReturnRecord[];
  stock: ProcessedStockRecord[];
  issues: ValidationIssue[];
  skuMaster: SkuMasterRecord[];
}) {
  const db = await getDB();
  await clearAllData();
  
  const tx = db.transaction(['sales', 'purchase', 'returns', 'stock', 'issues', 'skuMaster', 'metadata'], 'readwrite');
  
  for (const s of data.sales) tx.objectStore('sales').put(s);
  for (const p of data.purchase) tx.objectStore('purchase').put(p);
  for (const r of data.returns) tx.objectStore('returns').put(r);
  for (const st of data.stock) tx.objectStore('stock').put(st);
  for (const i of data.issues) tx.objectStore('issues').put(i);
  for (const sku of data.skuMaster) tx.objectStore('skuMaster').put(sku);
  
  tx.objectStore('metadata').put({ key: 'lastUpdated', value: new Date().toISOString() });
  
  await tx.done;
}

export async function loadProcessedData() {
  const db = await getDB();
  
  const [sales, purchase, returns, stock, issues, skuMaster, meta] = await Promise.all([
    db.getAll('sales'),
    db.getAll('purchase'),
    db.getAll('returns'),
    db.getAll('stock'),
    db.getAll('issues'),
    db.getAll('skuMaster'),
    db.get('metadata', 'lastUpdated'),
  ]);

  return {
    sales,
    purchase,
    returns,
    stock,
    issues,
    skuMaster,
    lastUpdated: meta ? new Date(meta.value) : null,
  };
}
