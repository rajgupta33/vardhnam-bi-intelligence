import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parseSales } from '@/lib/parsers/parseSales';
import { parsePurchase } from '@/lib/parsers/parsePurchase';
import { parseGodown } from '@/lib/parsers/parseGodown';
import { parseCreditNote } from '@/lib/parsers/parseCreditNote';
import { parseSalesReturnItems } from '@/lib/parsers/parseSalesReturnItems';
import { parseVoucherHeader } from '@/lib/parsers/parseVoucherHeader';
import { parseSkuMaster } from '@/lib/parsers/parseSkuMaster';
import { parseSkuMapping } from '@/lib/parsers/parseSkuMapping';
import { ValidationEngine } from '@/lib/validation/engine';
import { SkuMapper } from '@/lib/sku/mapper';
import { detectPurchaseOverlap, validateSalesReturnSemantics, validateDealerCoverage } from '@/lib/validation/advanced';

export async function POST() {
  try {
    const dataDir = path.join(process.cwd(), 'data', 'approval');
    const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    
    // Read files
    const salesFile = toArrayBuffer(fs.readFileSync(path.join(dataDir, 'DayBook_1_converted.xlsx')));
    const purchaseUpFile = toArrayBuffer(fs.readFileSync(path.join(dataDir, 'Purcase_UP_1_converted.xlsx')));
    const purchase2File = toArrayBuffer(fs.readFileSync(path.join(dataDir, 'purchase_2_converted.xlsx')));
    const godownFile = toArrayBuffer(fs.readFileSync(path.join(dataDir, 'Godown_Stock_Excel.xlsx')));
    const creditNoteFile = toArrayBuffer(fs.readFileSync(path.join(dataDir, 'Credit_Note.xlsx')));
    const returnsFile = fs.readFileSync(path.join(dataDir, 'Sales_Return_Items.csv'), 'utf-8');
    const voucherHeaderFile = fs.readFileSync(path.join(dataDir, 'Voucher_Header.csv'), 'utf-8');
    const skuMasterFile = fs.readFileSync(path.join(dataDir, 'SKU_Master.csv'), 'utf-8');
    const skuMappingFile = fs.readFileSync(path.join(dataDir, 'SKU_Mapping.csv'), 'utf-8');

    const validationEngine = new ValidationEngine();

    // Parse
    const sales = await parseSales(salesFile, validationEngine);
    const purchaseUp = await parsePurchase(purchaseUpFile, 'Purchase UP', validationEngine);
    const purchase2 = await parsePurchase(purchase2File, 'Purchase Source 2', validationEngine);
    const stock = await parseGodown(godownFile, validationEngine);
    const creditNotes = await parseCreditNote(creditNoteFile, validationEngine); // Mostly for reference or additional validation
    const returns = await parseSalesReturnItems(returnsFile, validationEngine);
    const voucherHeaders = await parseVoucherHeader(voucherHeaderFile, validationEngine);
    const skuMaster = await parseSkuMaster(skuMasterFile, validationEngine);
    const skuMapping = await parseSkuMapping(skuMappingFile, validationEngine);

    const purchase = [...purchaseUp, ...purchase2];

    // SKU Mapping
    const mapper = new SkuMapper(skuMaster, skuMapping, validationEngine);
    mapper.applyToSales(sales);
    mapper.applyToPurchase(purchase);
    mapper.applyToReturns(returns);
    mapper.applyToStock(stock);

    // Advanced Validation
    detectPurchaseOverlap(purchase, validationEngine);
    validateSalesReturnSemantics(returns, voucherHeaders, validationEngine);
    validateDealerCoverage(sales, returns, voucherHeaders, validationEngine);

    return NextResponse.json({
      sales,
      purchase,
      returns,
      stock,
      skuMaster,
      issues: validationEngine.getIssues(),
    });
  } catch (error: any) {
    console.error('Error processing data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
