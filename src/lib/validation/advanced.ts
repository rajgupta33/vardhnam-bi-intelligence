import { 
  ProcessedPurchaseRecord, 
  ProcessedSalesReturnRecord, 
  VoucherHeaderRecord 
} from '@/types';
import { ValidationEngine } from './engine';

export function detectPurchaseOverlap(
  purchaseRecords: ProcessedPurchaseRecord[],
  validationEngine: ValidationEngine
) {
  // Overlap detection: same date, same supplier, same voucherNo, same originalItemName
  const seen = new Map<string, ProcessedPurchaseRecord>();
  
  purchaseRecords.forEach(record => {
    if (record.validationStatus === 'EXCLUDED') return;
    
    // Some vouchers might just be '1' or '2', so we include item name and supplier to reduce false positives
    const dateStr = record.date ? record.date.toISOString().split('T')[0] : 'nodate';
    const key = `${dateStr}::${record.supplier}::${record.voucherNo}::${record.originalItemName}::${record.quantityKg}`;
    
    if (seen.has(key)) {
      validationEngine.logIssue(
        record.purchaseSource,
        record.sourceRowNumber,
        'Critical',
        'POSSIBLE_DUPLICATE_ROW',
        'Purchase record appears to be a duplicate across sources or within the same source.',
        record.originalItemName,
        record.skuId || undefined,
        record.quantityKg || 0,
        record.value || 0
      );
      record.validationStatus = 'WARNING'; // Flag but don't strictly exclude unless user requests
    } else {
      seen.set(key, record);
    }
  });
}

export function validateSalesReturnSemantics(
  returnRecords: ProcessedSalesReturnRecord[],
  voucherHeaders: VoucherHeaderRecord[],
  validationEngine: ValidationEngine
) {
  // Data Join Validation: check if returns map to a valid voucher context
  const headerMap = new Map<string, VoucherHeaderRecord>();
  voucherHeaders.forEach(h => headerMap.set(h.vch_no, h));

  returnRecords.forEach(record => {
    if (record.validationStatus === 'EXCLUDED') return;

    if (record.voucherNo && !headerMap.has(record.voucherNo)) {
      validationEngine.logIssue(
        'Sales Return Items',
        record.sourceRowNumber,
        'Warning',
        'MISSING_REQUIRED_COLUMN', // Or a new issue type like MISSING_VOUCHER_CONTEXT
        `Return item lacks matching voucher header for ${record.voucherNo}`,
        record.originalItemName,
        record.skuId || undefined,
        record.returnQuantityKg || 0,
        record.returnValue || 0
      );
      record.validationStatus = 'WARNING'; // Flag it, don't silently assign
    } else if (record.voucherNo) {
      // If header exists, but party on header doesn't match or party is missing on return
      const header = headerMap.get(record.voucherNo);
      if (header && !record.party) {
        record.party = header.party; // Enrich from header
      }
    }
  });
}

export function validateDealerCoverage(
  salesRecords: any[],
  returnRecords: ProcessedSalesReturnRecord[],
  voucherHeaders: VoucherHeaderRecord[],
  validationEngine: ValidationEngine
) {
  let salesWithParty = 0;
  let salesWithoutParty = 0;
  let returnsWithParty = 0;
  let returnsWithoutParty = 0;
  let unmatchedReturns = 0;

  const headerMap = new Map<string, VoucherHeaderRecord>();
  voucherHeaders.forEach(h => headerMap.set(h.vch_no, h));

  salesRecords.forEach(r => {
    if (r.validationStatus === 'EXCLUDED') return;
    if (r.party && r.party !== 'Unknown') {
      salesWithParty++;
    } else {
      salesWithoutParty++;
      validationEngine.logIssue(
        'Sales',
        r.sourceRowNumber,
        'Critical',
        'MISSING_SALES_PARTY',
        'Sales record missing party name',
        r.originalItemName,
        r.skuId || undefined,
        r.quantityKg || 0,
        r.value || 0
      );
    }
  });

  returnRecords.forEach(r => {
    if (r.validationStatus === 'EXCLUDED') return;
    
    // Check if voucher exists
    if (r.voucherNo && !headerMap.has(r.voucherNo)) {
      unmatchedReturns++;
      validationEngine.logIssue(
        'Sales Return Items',
        r.sourceRowNumber,
        'Critical',
        'UNMATCHED_RETURN_VOUCHER',
        `Return item lacks matching voucher header for ${r.voucherNo}`,
        r.originalItemName,
        r.skuId || undefined,
        r.returnQuantityKg || 0,
        r.returnValue || 0
      );
      r.party = 'Unknown'; // Do not silently assign to anything
    }

    if (r.party && r.party !== 'Unknown') {
      returnsWithParty++;
    } else {
      returnsWithoutParty++;
      validationEngine.logIssue(
        'Sales Return Items',
        r.sourceRowNumber,
        'Critical',
        'RETURN_WITHOUT_PARTY_CONTEXT',
        'Return item lacks party context (dealer name missing and no voucher header link)',
        r.originalItemName,
        r.skuId || undefined,
        r.returnQuantityKg || 0,
        r.returnValue || 0
      );
    }
  });
}
