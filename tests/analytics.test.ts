import test from 'node:test';
import assert from 'node:assert';
import { calculateGlobalMetrics, calculatePurchaseDemandGap, calculateReturnRate, calculateForecastScenario } from '../src/lib/analytics/index';
import { ProcessedSalesRecord, ProcessedPurchaseRecord, ProcessedSalesReturnRecord, ProcessedPurchaseReturnRecord, ProcessedStockRecord, SkuMasterRecord } from '../src/types';

test('calculateReturnRate', () => {
  assert.strictEqual(calculateReturnRate(10, 100), 10);
  assert.strictEqual(calculateReturnRate(0, 100), 0);
  assert.strictEqual(calculateReturnRate(10, 0), 0);
});

test('calculatePurchaseDemandGap', () => {
  assert.strictEqual(calculatePurchaseDemandGap(100, 80), 20);
  assert.strictEqual(calculatePurchaseDemandGap(50, 80), -30);
});

test('calculateForecastScenario', () => {
  const result = calculateForecastScenario(1000, 10, 500, 80);
  // forecastDemand = 1000 * 1.1 = 1100
  // usableStock = 500 * 0.8 = 400
  // freshPurchaseReq = 1100 - 400 = 700
  assert.strictEqual(result.forecastDemand, 1100);
  assert.strictEqual(result.usableStock, 400);
  assert.strictEqual(result.freshPurchaseReq, 700);
  
  // Test floor at 0
  const result2 = calculateForecastScenario(100, 0, 500, 100);
  assert.strictEqual(result2.freshPurchaseReq, 0);
});

test('calculateGlobalMetrics with Seed filter', () => {
  const skuMaster: SkuMasterRecord[] = [
    { skuId: 'S1', category: 'Seed', uniqueSkuName: 'Seed1', crop: 'Paddy', variety: 'V1', packSize: '1Kg', skuStatus: 'Active', mappingConfidence: 'High', reviewFlag: 'No', reviewReason: null },
    { skuId: 'C1', category: 'Chemical', uniqueSkuName: 'Chem1', crop: 'N/A', variety: 'N/A', packSize: '1L', skuStatus: 'Active', mappingConfidence: 'High', reviewFlag: 'No', reviewReason: null }
  ];

  const sales: ProcessedSalesRecord[] = [
    { id: '1', sourceRowNumber: 1, validationStatus: 'VALID', date: null, voucherNo: 'V1', party: 'P', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', quantity: 100, unit: 'KGS', quantityKg: 100, value: 1000, originalQuantity: null, originalUnit: null, rate: null },
    { id: '2', sourceRowNumber: 2, validationStatus: 'VALID', date: null, voucherNo: 'V2', party: 'P', originalItemName: 'C1', normalisedItemName: 'C1', skuId: 'C1', quantity: 50, unit: 'KGS', quantityKg: 50, value: 500, originalQuantity: null, originalUnit: null, rate: null },
  ];

  const returns: ProcessedSalesReturnRecord[] = [
    { id: '1', sourceRowNumber: 1, validationStatus: 'VALID', date: null, voucherNo: 'R1', party: 'P', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', returnKind: 'PHYSICAL', returnQuantity: 10, unit: 'KGS', returnQuantityKg: 10, returnValue: 100, originalQuantity: null, originalUnit: null },
  ];

  const purchase: ProcessedPurchaseRecord[] = [
    { id: '1', sourceRowNumber: 1, validationStatus: 'VALID', date: null, voucherNo: 'P1', supplier: 'S', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', quantity: 120, unit: 'KGS', quantityKg: 120, value: 1000, originalQuantity: null, originalUnit: null, rate: null, purchaseSource: 'Purchase UP' }
  ];

  const stock: ProcessedStockRecord[] = [
    { id: '1', sourceRowNumber: 1, validationStatus: 'VALID', snapshotDate: null, godown: 'G', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', closingQuantity: 30, unit: 'KGS', closingQuantityKg: 30, closingValue: 300, originalClosingQuantity: null, originalUnit: null, closingRate: null }
  ];

  const seedOnly = calculateGlobalMetrics(sales, purchase, returns, [], stock, skuMaster, { category: 'Seed' });

  assert.strictEqual(seedOnly.grossSalesQuantity, 100);
  assert.strictEqual(seedOnly.salesReturnQuantity, 10);
  assert.strictEqual(seedOnly.netDemand, 90);
  assert.strictEqual(seedOnly.purchaseQuantity, 120);
  assert.strictEqual(seedOnly.closingStockQuantity, 30);

  // Default is every category, so totals can be reconciled against Tally.
  const all = calculateGlobalMetrics(sales, purchase, returns, [], stock, skuMaster);
  assert.strictEqual(all.grossSalesQuantity, 150);
  assert.strictEqual(all.grossSalesValue, 1500);
});

test('value-only credit notes are excluded from physical return quantity', () => {
  const skuMaster: SkuMasterRecord[] = [
    { skuId: 'S1', category: 'Seed', uniqueSkuName: 'Seed1', crop: 'Paddy', variety: 'V1', packSize: '1Kg', skuStatus: 'Active', mappingConfidence: 'High', reviewFlag: 'No', reviewReason: null },
  ];

  const returns: ProcessedSalesReturnRecord[] = [
    { id: '1', sourceRowNumber: 1, validationStatus: 'VALID', date: null, voucherNo: 'CN1', party: 'P', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', returnKind: 'PHYSICAL', returnQuantity: 10, unit: 'KGS', returnQuantityKg: 10, returnValue: 100, originalQuantity: null, originalUnit: null },
    { id: '2', sourceRowNumber: 2, validationStatus: 'VALID', date: null, voucherNo: 'CN2', party: 'P', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', returnKind: 'VALUE_ONLY', returnQuantity: 0, unit: null, returnQuantityKg: 0, returnValue: 4400, originalQuantity: null, originalUnit: null },
  ];

  const metrics = calculateGlobalMetrics([], [], returns, [], [], skuMaster);

  assert.strictEqual(metrics.salesReturnQuantity, 10);
  assert.strictEqual(metrics.salesReturnValue, 100);
  assert.strictEqual(metrics.valueOnlyCreditNoteValue, 4400);
});

test('quantities are reported per unit and never summed across units', () => {
  const skuMaster: SkuMasterRecord[] = [
    { skuId: 'S1', category: 'Seed', uniqueSkuName: 'Seed1', crop: 'Paddy', variety: 'V1', packSize: '1Kg', skuStatus: 'Active', mappingConfidence: 'High', reviewFlag: 'No', reviewReason: null },
  ];

  const purchase: ProcessedPurchaseRecord[] = [
    { id: '1', sourceRowNumber: 1, validationStatus: 'VALID', date: null, voucherNo: 'P1', supplier: 'S', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', quantity: 100, unit: 'KGS', quantityKg: 100, value: 1000, originalQuantity: null, originalUnit: null, rate: null, purchaseSource: 'Tally' },
    { id: '2', sourceRowNumber: 2, validationStatus: 'VALID', date: null, voucherNo: 'P2', supplier: 'S', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', quantity: 7, unit: 'NOS', quantityKg: 0, value: 500, originalQuantity: null, originalUnit: null, rate: null, purchaseSource: 'Tally' },
  ];

  const metrics = calculateGlobalMetrics([], purchase, [], [], [], skuMaster);

  assert.deepStrictEqual(metrics.quantityByUnit.purchase, { KGS: 100, NOS: 7 });
  // The kilogram headline must not absorb the seven pieces.
  assert.strictEqual(metrics.purchaseQuantity, 100);
  assert.strictEqual(metrics.purchaseValue, 1500);
});

test('debit notes (purchase returns) reduce net purchase value, mirroring credit notes', () => {
  const skuMaster: SkuMasterRecord[] = [
    { skuId: 'S1', category: 'Seed', uniqueSkuName: 'Seed1', crop: 'Paddy', variety: 'V1', packSize: '1Kg', skuStatus: 'Active', mappingConfidence: 'High', reviewFlag: 'No', reviewReason: null },
  ];

  const purchase: ProcessedPurchaseRecord[] = [
    { id: '1', sourceRowNumber: 1, validationStatus: 'VALID', date: null, voucherNo: 'P1', supplier: 'S', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', quantity: 100, unit: 'KGS', quantityKg: 100, value: 10000, originalQuantity: null, originalUnit: null, rate: null, purchaseSource: 'Tally' },
  ];

  const purchaseReturns: ProcessedPurchaseReturnRecord[] = [
    { id: '1', sourceRowNumber: 1, validationStatus: 'VALID', date: null, voucherNo: 'DN1', supplier: 'S', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', returnKind: 'PHYSICAL', returnQuantity: 20, unit: 'KGS', returnQuantityKg: 20, returnValue: 2000, originalQuantity: null, originalUnit: null },
    { id: '2', sourceRowNumber: 2, validationStatus: 'VALID', date: null, voucherNo: 'DN2', supplier: 'S', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', returnKind: 'VALUE_ONLY', returnQuantity: 0, unit: null, returnQuantityKg: 0, returnValue: 500, originalQuantity: null, originalUnit: null },
  ];

  const metrics = calculateGlobalMetrics([], purchase, [], purchaseReturns, [], skuMaster);

  assert.strictEqual(metrics.purchaseValue, 10000);
  assert.strictEqual(metrics.purchaseReturnQuantity, 20);
  assert.strictEqual(metrics.purchaseReturnValue, 2000);
  assert.strictEqual(metrics.valueOnlyDebitNoteValue, 500);
  assert.strictEqual(metrics.netPurchaseValue, 7500);
});
