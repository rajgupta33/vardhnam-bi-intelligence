export type ValidationSeverity = 'Critical' | 'Warning' | 'Info';

export type IssueType =
  | 'MISSING_REQUIRED_COLUMN'
  | 'INVALID_DATE'
  | 'INVALID_QUANTITY'
  | 'INVALID_VALUE'
  | 'UNMAPPED_SKU'
  | 'QUANTITY_CONVERSION_REQUIRED'
  | 'DUPLICATE_MAPPING'
  | 'CONFLICTING_SKU_MAPPING'
  | 'MISSING_SKU_MASTER_RECORD'
  | 'MISSING_CROP'
  | 'MISSING_CATEGORY'
  | 'RETURN_WITHOUT_SKU'
  | 'STOCK_WITHOUT_SKU'
  | 'SALES_WITHOUT_SKU'
  | 'PURCHASE_WITHOUT_SKU'
  | 'SOURCE_OUTSIDE_FY'
  | 'POSSIBLE_DUPLICATE_ROW'
  | 'INVALID_RETURN_SEMANTICS'
  | 'MISSING_SALES_PARTY'
  | 'RETURN_WITHOUT_PARTY_CONTEXT'
  | 'UNMATCHED_RETURN_VOUCHER'
  | 'POSSIBLE_PARTY_NAME_VARIANT';

export interface ValidationIssue {
  issueId: string;
  source: string;
  sourceRowNumber?: number;
  severity: ValidationSeverity;
  issueType: IssueType;
  originalItemName?: string;
  skuId?: string;
  message: string;
  impactQuantity?: number;
  impactValue?: number;
}

export type RecordValidationStatus = 'VALID' | 'WARNING' | 'EXCLUDED';

export interface BaseProcessedRecord {
  id: string;
  sourceRowNumber: number;
  validationStatus: RecordValidationStatus;
}

export interface ProcessedPurchaseRecord extends BaseProcessedRecord {
  date: Date | null;
  voucherNo: string;
  supplier: string;
  originalItemName: string;
  normalisedItemName: string;
  skuId: string | null;
  quantityKg: number | null;
  originalQuantity: number | null;
  originalUnit: string | null;
  rate: number | null;
  value: number | null;
  purchaseSource: 'Purchase UP' | 'Purchase Source 2';
}

export interface ProcessedSalesRecord extends BaseProcessedRecord {
  date: Date | null;
  voucherNo: string;
  party: string;
  originalItemName: string;
  normalisedItemName: string;
  skuId: string | null;
  quantityKg: number | null;
  originalQuantity: number | null;
  originalUnit: string | null;
  rate: number | null;
  value: number | null;
}

export interface ProcessedSalesReturnRecord extends BaseProcessedRecord {
  date: Date | null;
  voucherNo: string;
  party: string;
  originalItemName: string;
  normalisedItemName: string;
  skuId: string | null;
  returnQuantityKg: number | null;
  originalQuantity: number | null;
  originalUnit: string | null;
  returnValue: number | null;
}

export interface ProcessedStockRecord extends BaseProcessedRecord {
  snapshotDate: Date | null; // e.g., 31-Mar-2026
  godown: string;
  originalItemName: string;
  normalisedItemName: string;
  skuId: string | null;
  closingQuantityKg: number | null;
  originalClosingQuantity: number | null;
  originalUnit: string | null;
  closingRate: number | null;
  closingValue: number | null;
}

export interface SkuMasterRecord {
  skuId: string;
  uniqueSkuName: string;
  crop: string;
  variety: string;
  packSize: string;
  category: string;
  skuStatus: string;
  mappingConfidence: string;
  reviewFlag: string;
  reviewReason: string | null;
}

export interface SkuMappingRecord {
  originalItemName: string;
  normalisedItemName: string;
  sourceType: string;
  sourceFile: string;
  skuId: string;
  uniqueSkuName: string;
  mappingConfidence: string;
  reviewFlag: string;
  mappingReason: string | null;
}

export interface VoucherHeaderRecord {
  voucher_id: string;
  page: string;
  date: Date | null;
  date_original: string;
  party: string;
  vch_type: string;
  vch_no: string;
  primary_ledger: string;
  credit_amount: number | null;
  agst_refs: string | null;
  narration: string | null;
}
