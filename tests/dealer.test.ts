import { describe, expect, test } from 'vitest';
import { aggregateByDealer, calculateDealerConcentration } from '../src/lib/analytics/dealer';
import { ProcessedSalesRecord, ProcessedSalesReturnRecord, SkuMasterRecord } from '../src/types';

describe('Dealer Intelligence Engine', () => {
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
    { party: 'Dealer A', skuId: 'SKU1', returnQuantityKg: 10, returnValue: 100, date: new Date('2025-05-20'), validationStatus: 'VALID' } as ProcessedSalesReturnRecord,
    { party: 'Dealer B', skuId: 'SKU1', returnQuantityKg: 50, returnValue: 500, date: new Date('2025-05-20'), validationStatus: 'VALID' } as ProcessedSalesReturnRecord,
    { party: 'Dealer C', skuId: 'SKU2', returnQuantityKg: 10, returnValue: 100, date: new Date('2025-07-20'), validationStatus: 'VALID' } as ProcessedSalesReturnRecord, // Return without previous sales
  ];

  test('aggregateByDealer calculates basic metrics', () => {
    const dealers = aggregateByDealer(mockSales, mockReturns, mockSkuMaster);
    expect(dealers.length).toBe(3); // Dealer A, Dealer B, Dealer C

    const dealerA = dealers.find(d => d.partyName === 'Dealer A')!;
    expect(dealerA.grossSalesQuantity).toBe(150); // 100 + 50 (SKU3 ignored)
    expect(dealerA.grossSalesValue).toBe(1500);
    expect(dealerA.salesReturnQuantity).toBe(10);
    expect(dealerA.netDemand).toBe(140);
    expect(dealerA.returnRate).toBeCloseTo((10 / 150) * 100);

    const dealerB = dealers.find(d => d.partyName === 'Dealer B')!;
    expect(dealerB.grossSalesQuantity).toBe(200);
    expect(dealerB.salesReturnQuantity).toBe(50);
    expect(dealerB.netDemand).toBe(150);

    const dealerC = dealers.find(d => d.partyName === 'Dealer C')!;
    expect(dealerC.grossSalesQuantity).toBe(0);
    expect(dealerC.salesReturnQuantity).toBe(10);
    expect(dealerC.netDemand).toBe(-10); // Negative demand is correct mathematically
    expect(dealerC.returnRate).toBe(0); // Zero denominator should yield 0
  });

  test('aggregateByDealer calculates shares', () => {
    const dealers = aggregateByDealer(mockSales, mockReturns, mockSkuMaster);
    const totalPositiveNetDemand = 140 + 150; // Dealer C is negative, wait - aggregateByDealer totals all net demands
    // totalNetDemand = 140 + 150 - 10 = 280
    // shareOfTotalNetDemand: A = 140/280 = 50%, B = 150/280 = 53.57%
    
    const dealerB = dealers.find(d => d.partyName === 'Dealer B')!;
    expect(dealerB.shareOfTotalNetDemand).toBeCloseTo((150 / 280) * 100);
    expect(dealerB.shareOfTotalPhysicalReturn).toBeCloseTo((50 / 70) * 100); // Total return = 10 + 50 + 10 = 70
  });

  test('calculateDealerConcentration calculates correctly for top N positive demand', () => {
    const dealers = aggregateByDealer(mockSales, mockReturns, mockSkuMaster);
    // Positive demands: Dealer B (150), Dealer A (140). Total positive = 290
    // Top 1: 150 / 290
    const top1 = calculateDealerConcentration(dealers, 1);
    expect(top1).toBeCloseTo((150 / 290) * 100);

    // Top 2: (150 + 140) / 290 = 100%
    const top2 = calculateDealerConcentration(dealers, 2);
    expect(top2).toBe(100);
  });
});
