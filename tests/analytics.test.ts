import test from 'node:test';
import assert from 'node:assert';
import { calculateGlobalMetrics, calculatePurchaseDemandGap, calculateReturnRate, calculateForecastScenario } from '../src/lib/analytics/index';
import { ProcessedSalesRecord, ProcessedPurchaseRecord, ProcessedSalesReturnRecord, ProcessedStockRecord, SkuMasterRecord } from '../src/types';

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
    { id: '1', sourceRowNumber: 1, validationStatus: 'VALID', date: null, voucherNo: 'V1', party: 'P', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', quantityKg: 100, value: 1000, originalQuantity: null, originalUnit: null, rate: null },
    { id: '2', sourceRowNumber: 2, validationStatus: 'VALID', date: null, voucherNo: 'V2', party: 'P', originalItemName: 'C1', normalisedItemName: 'C1', skuId: 'C1', quantityKg: 50, value: 500, originalQuantity: null, originalUnit: null, rate: null },
  ];

  const returns: ProcessedSalesReturnRecord[] = [
    { id: '1', sourceRowNumber: 1, validationStatus: 'VALID', date: null, voucherNo: 'R1', party: 'P', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', returnQuantityKg: 10, returnValue: 100, originalQuantity: null, originalUnit: null },
  ];

  const purchase: ProcessedPurchaseRecord[] = [
    { id: '1', sourceRowNumber: 1, validationStatus: 'VALID', date: null, voucherNo: 'P1', supplier: 'S', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', quantityKg: 120, value: 1000, originalQuantity: null, originalUnit: null, rate: null, purchaseSource: 'Purchase UP' }
  ];

  const stock: ProcessedStockRecord[] = [
    { id: '1', sourceRowNumber: 1, validationStatus: 'VALID', snapshotDate: null, godown: 'G', originalItemName: 'S1', normalisedItemName: 'S1', skuId: 'S1', closingQuantityKg: 30, closingValue: 300, originalClosingQuantity: null, originalUnit: null, closingRate: null }
  ];

  const metrics = calculateGlobalMetrics(sales, purchase, returns, stock, skuMaster);
  
  // Should only include Seed
  assert.strictEqual(metrics.grossSalesQuantity, 100);
  assert.strictEqual(metrics.salesReturnQuantity, 10);
  assert.strictEqual(metrics.netDemand, 90);
  assert.strictEqual(metrics.purchaseQuantity, 120);
  assert.strictEqual(metrics.closingStockQuantity, 30);
});
