import { 
  ProcessedPurchaseRecord, 
  ProcessedSalesRecord, 
  ProcessedSalesReturnRecord, 
  ProcessedStockRecord, 
  SkuMappingRecord, 
  SkuMasterRecord 
} from '@/types';
import { normalizeItemName } from './normalisation';
import { ValidationEngine } from '../validation/engine';

export class SkuMapper {
  private masterMap = new Map<string, SkuMasterRecord>();
  private mappingMap = new Map<string, string>(); // normalisedName+sourceType -> skuId

  constructor(
    masterRecords: SkuMasterRecord[],
    mappingRecords: SkuMappingRecord[],
    private validationEngine: ValidationEngine
  ) {
    masterRecords.forEach(m => {
      this.masterMap.set(m.skuId, m);
      // Register the unique name itself as a valid mapping fallback
      this.mappingMap.set(normalizeItemName(m.uniqueSkuName), m.skuId);
    });

    // Build mapping dictionary prioritizing source-specific mappings
    mappingRecords.forEach(m => {
      const normalisedKey = m.normalisedItemName;
      
      // Always register as a general fallback (first one wins, though later ones might overwrite. We prefer source-specific anyway)
      this.mappingMap.set(normalisedKey, m.skuId);
      
      // Source specific mapping
      if (m.sourceType && m.sourceType.toLowerCase() !== 'all') {
        const key = `${normalisedKey}::${m.sourceType}`;
        this.mappingMap.set(key, m.skuId);
      }
    });
  }

  public getSku(originalName: string, sourceType: string): SkuMasterRecord | null {
    const normalised = normalizeItemName(originalName);
    
    let skuId = this.mappingMap.get(`${normalised}::${sourceType}`);
    if (!skuId) {
      skuId = this.mappingMap.get(normalised);
    }

    if (skuId) {
      const master = this.masterMap.get(skuId);
      if (master) return master;
    }
    
    return null;
  }

  public applyToSales(records: ProcessedSalesRecord[]): void {
    records.forEach(r => {
      if (r.validationStatus === 'EXCLUDED') return;
      r.normalisedItemName = normalizeItemName(r.originalItemName);
      const sku = this.getSku(r.originalItemName, 'Sales');
      if (sku) {
        r.skuId = sku.skuId;
      } else {
        r.validationStatus = 'WARNING';
        this.validationEngine.logIssue('Sales', r.sourceRowNumber, 'Warning', 'UNMAPPED_SKU', 'SKU unmapped', r.originalItemName, undefined, r.quantityKg || 0, r.value || 0);
      }
    });
  }

  public applyToPurchase(records: ProcessedPurchaseRecord[]): void {
    records.forEach(r => {
      if (r.validationStatus === 'EXCLUDED') return;
      r.normalisedItemName = normalizeItemName(r.originalItemName);
      const sku = this.getSku(r.originalItemName, 'Purchase');
      if (sku) {
        r.skuId = sku.skuId;
      } else {
        r.validationStatus = 'WARNING';
        this.validationEngine.logIssue(r.purchaseSource, r.sourceRowNumber, 'Warning', 'UNMAPPED_SKU', 'SKU unmapped', r.originalItemName, undefined, r.quantityKg || 0, r.value || 0);
      }
    });
  }

  public applyToReturns(records: ProcessedSalesReturnRecord[]): void {
    records.forEach(r => {
      if (r.validationStatus === 'EXCLUDED') return;
      r.normalisedItemName = normalizeItemName(r.originalItemName);
      const sku = this.getSku(r.originalItemName, 'Sales Return');
      if (sku) {
        r.skuId = sku.skuId;
      } else {
        r.validationStatus = 'WARNING';
        this.validationEngine.logIssue('Sales Return', r.sourceRowNumber, 'Warning', 'UNMAPPED_SKU', 'SKU unmapped', r.originalItemName, undefined, r.returnQuantityKg || 0, r.returnValue || 0);
      }
    });
  }

  public applyToStock(records: ProcessedStockRecord[]): void {
    records.forEach(r => {
      if (r.validationStatus === 'EXCLUDED') return;
      r.normalisedItemName = normalizeItemName(r.originalItemName);
      const sku = this.getSku(r.originalItemName, 'Godown Stock');
      if (sku) {
        r.skuId = sku.skuId;
      } else {
        r.validationStatus = 'WARNING';
        this.validationEngine.logIssue('Godown Stock', r.sourceRowNumber, 'Warning', 'UNMAPPED_SKU', 'SKU unmapped', r.originalItemName, undefined, r.closingQuantityKg || 0, r.closingValue || 0);
      }
    });
  }
}
