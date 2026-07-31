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
import { saveProcessedData } from '@/lib/db/sqlite';

export async function POST() {
  try {
    return NextResponse.json({ error: "Local data fetching is disabled. Please use Tally Sync." }, { status: 400 });
  } catch (error: unknown) {
    console.error('Error processing data:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
