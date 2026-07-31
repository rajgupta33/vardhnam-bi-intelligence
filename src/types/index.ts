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
  /**
   * Composite identity from the source system. Tally voucher numbers are neither
   * unique nor always present, so upserts key on this instead.
   */
  rowKey?: string;
  /** Which system supplied the row — Tally today, other feeds later. */
  source?: string;
  /** Owning Tally company. Multiple companies share these tables. */
  company?: string;
  /** Indian financial year (Apr–Mar) derived from the record's own date, e.g. "FY2024-25". */
  financialYear?: string | null;
  /**
   * Set when the counterparty is a related group entity. Combined figures still
   * include these rows; the flag exists so the double-counting is visible.
   */
  isInterCompany?: boolean;
  /** Cancelled or optional vouchers are kept and flagged, never silently dropped. */
  isCancelled?: boolean;
  isOptional?: boolean;
}

/**
 * Quantities are never summed across units. A measure carries the per-unit
 * breakdown, plus the dominant unit for headline display.
 */
export interface QuantityMeasure {
  byUnit: Record<string, number>;
  primaryUnit: string | null;
  primary: number;
}

/**
 * Distinguishes credit notes where goods physically came back from those raised
 * purely to adjust value (rate difference, discount). Both reduce revenue; only
 * the first is a return in any operational sense.
 */
export type ReturnKind = 'PHYSICAL' | 'VALUE_ONLY';

/**
 * A value-only posting to a revenue or purchase ledger from a non-inventory
 * voucher, typically a Journal. Carries no quantity by construction.
 */
export interface ProcessedAdjustmentRecord extends BaseProcessedRecord {
  date: Date | null;
  voucherNo: string;
  voucherType: string;
  party: string;
  ledgerName: string;
  kind: 'SALES' | 'PURCHASE';
  /** Signed as Tally stores it; credit-natured ledgers post negative. */
  amount: number;
  narration: string;
}

export interface ProcessedPurchaseRecord extends BaseProcessedRecord {
  date: Date | null;
  voucherNo: string;
  supplier: string;
  originalItemName: string;
  normalisedItemName: string;
  skuId: string | null;
  /** Quantity in `unit`. Never add these across records without grouping by unit. */
  quantity: number | null;
  unit: string | null;
  /** Quantity only when the line is denominated in KGS, else 0 — never a converted figure. */
  quantityKg: number | null;
  originalQuantity: number | null;
  originalUnit: string | null;
  rate: number | null;
  value: number | null;
  purchaseSource: 'Purchase UP' | 'Purchase Source 2' | 'Tally';
}

export interface ProcessedSalesRecord extends BaseProcessedRecord {
  date: Date | null;
  voucherNo: string;
  party: string;
  originalItemName: string;
  normalisedItemName: string;
  skuId: string | null;
  quantity: number | null;
  unit: string | null;
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
  /** PHYSICAL means goods came back; VALUE_ONLY is a rate/discount credit note. */
  returnKind: ReturnKind;
  returnQuantity: number | null;
  unit: string | null;
  returnQuantityKg: number | null;
  originalQuantity: number | null;
  originalUnit: string | null;
  returnValue: number | null;
}

/**
 * The purchase-side mirror of a sales return: goods sent back to a supplier via
 * a Debit Note. Without these, purchase totals overstate by exactly the value
 * of anything returned — confirmed live (Telangana FY24-25, ₹7,38,900).
 */
export interface ProcessedPurchaseReturnRecord extends BaseProcessedRecord {
  date: Date | null;
  voucherNo: string;
  supplier: string;
  originalItemName: string;
  normalisedItemName: string;
  skuId: string | null;
  returnKind: ReturnKind;
  returnQuantity: number | null;
  unit: string | null;
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
  closingQuantity: number | null;
  unit: string | null;
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
