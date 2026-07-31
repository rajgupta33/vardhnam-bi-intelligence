import test from 'node:test';
import assert from 'node:assert';
import { aggregateByDealer, calculateDealerConcentration } from '../src/lib/analytics/dealer';
import { ProcessedSalesRecord, ProcessedSalesReturnRecord, SkuMasterRecord } from '../src/types';

  const mockSkuMaster: SkuMasterRecord[] = [
    { skuId: 'SKU1', uniqueSkuName: 'Crop A Seed 1', crop: 'Crop A', category: 'Seed' } as SkuMasterRecord,
    { skuId: 'SKU2', uniqueSkuName: 'Crop B Seed 2', crop: 'Crop B', category: 'Seed' } as SkuMasterRecord,
    { skuId: 'SKU3', uniqueSkuName: 'Chem 1', crop: 'NA', category: 'Chemical' } as SkuMasterRecord, // Non-seed, should be ignored
  ];

  const mockSales: ProcessedSalesRecord[] = [
    { party: 'Dealer A', skuId: 'SKU1', quantityKg: 100, value: 1000, date: new Date('2025-05-15'), validationStatus: 'VALID' } as ProcessedSalesRecord,
    { party: 'Dealer A', skuId: 'SKU2', quantityKg: 50, value: 500, date: new Date('2025-06-15'), validationStatus: 'VALID' } as ProcessedSalesRecord,
    { party: 'Dealer B', skuId: 'SKU1', quantityKg: 200, value: 2000, date: new Date('2025-04-15'), validationStatus: 'VALID' } as ProcessedSalesRecord,
    { party: 'Dealer C', skuId: 'SKU2', quantityKg: 0, value: 0, date: new Date('2025-07-15'), validationStatus: 'VALID' } as ProcessedSalesRecord, // Zero gross sales test
    { party: 'Dealer A', skuId: 'SKU3', quantityKg: 900, value: 9000, date: new Date('2025-05-15'), validationStatus: 'VALID' } as ProcessedSalesRecord, // Should be ignored
  ];

  const mockReturns: ProcessedSalesReturnRecord[] = [
    { party: 'Dealer A', skuId: 'SKU1', returnKind: 'PHYSICAL', returnQuantity: 10, returnQuantityKg: 10, returnValue: 100, date: new Date('2025-05-20'), validationStatus: 'VALID' } as ProcessedSalesReturnRecord,
    { party: 'Dealer B', skuId: 'SKU1', returnKind: 'PHYSICAL', returnQuantity: 50, returnQuantityKg: 50, returnValue: 500, date: new Date('2025-05-20'), validationStatus: 'VALID' } as ProcessedSalesReturnRecord,
    { party: 'Dealer C', skuId: 'SKU2', returnKind: 'PHYSICAL', returnQuantity: 10, returnQuantityKg: 10, returnValue: 100, date: new Date('2025-07-20'), validationStatus: 'VALID' } as ProcessedSalesReturnRecord, // Return without previous sales
  ];

  test('aggregateByDealer calculates basic metrics', () => {
    const dealers = aggregateByDealer(mockSales, mockReturns, mockSkuMaster, { category: 'Seed' });
    assert.strictEqual(dealers.length, 3); // Dealer A, Dealer B, Dealer C

    const dealerA = dealers.find(d => d.partyName === 'Dealer A')!;
    assert.strictEqual(dealerA.grossSalesQuantity, 150); // 100 + 50 (SKU3 ignored)
    assert.strictEqual(dealerA.grossSalesValue, 1500);
    assert.strictEqual(dealerA.salesReturnQuantity, 10);
    assert.strictEqual(dealerA.netDemand, 140);
    assert.ok(Math.abs((dealerA.returnRate) - ((10 / 150) * 100)) < 1e-6);

    const dealerB = dealers.find(d => d.partyName === 'Dealer B')!;
    assert.strictEqual(dealerB.grossSalesQuantity, 200);
    assert.strictEqual(dealerB.salesReturnQuantity, 50);
    assert.strictEqual(dealerB.netDemand, 150);

    const dealerC = dealers.find(d => d.partyName === 'Dealer C')!;
    assert.strictEqual(dealerC.grossSalesQuantity, 0);
    assert.strictEqual(dealerC.salesReturnQuantity, 10);
    assert.strictEqual(dealerC.netDemand, -10); // Negative demand is correct mathematically
    assert.strictEqual(dealerC.returnRate, 0); // Zero denominator should yield 0
  });

  test('aggregateByDealer calculates shares', () => {
    const dealers = aggregateByDealer(mockSales, mockReturns, mockSkuMaster, { category: 'Seed' });
    const totalPositiveNetDemand = 140 + 150; // Dealer C is negative, wait - aggregateByDealer totals all net demands
    // totalNetDemand = 140 + 150 - 10 = 280
    // shareOfTotalNetDemand: A = 140/280 = 50%, B = 150/280 = 53.57%
    
    const dealerB = dealers.find(d => d.partyName === 'Dealer B')!;
    assert.ok(Math.abs((dealerB.shareOfTotalNetDemand) - ((150 / 280) * 100)) < 1e-6);
    assert.ok(Math.abs((dealerB.shareOfTotalPhysicalReturn) - ((50 / 70) * 100)) < 1e-6); // Total return = 10 + 50 + 10 = 70
  });

  test('calculateDealerConcentration calculates correctly for top N positive demand', () => {
    const dealers = aggregateByDealer(mockSales, mockReturns, mockSkuMaster, { category: 'Seed' });
    // Positive demands: Dealer B (150), Dealer A (140). Total positive = 290
    // Top 1: 150 / 290
    const top1 = calculateDealerConcentration(dealers, 1);
    assert.ok(Math.abs((top1) - ((150 / 290) * 100)) < 1e-6);

    // Top 2: (150 + 140) / 290 = 100%
    const top2 = calculateDealerConcentration(dealers, 2);
    assert.strictEqual(top2, 100);
  });
