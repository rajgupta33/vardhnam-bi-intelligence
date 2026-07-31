/**
 * Replays captured Tally XML through the entire processing pipeline — parse, SKU
 * map, reconcile — and asserts the result still ties to Tally's own group totals.
 *
 * Runs without a live Tally connection, so it doubles as a regression check:
 *   npx tsx scripts/verify-extract.ts <dir-with-captured-xml>
 */
import fs from 'fs';
import path from 'path';
import { parseTallySales } from '../src/lib/parsers/parseTallySales';
import { parseTallyPurchase } from '../src/lib/parsers/parseTallyPurchase';
import { parseTallyReturns } from '../src/lib/parsers/parseTallyReturns';
import { parseTallyAdjustments } from '../src/lib/parsers/parseTallyAdjustments';
import { parseSkuMaster } from '../src/lib/parsers/parseSkuMaster';
import { parseSkuMapping } from '../src/lib/parsers/parseSkuMapping';
import { ValidationEngine } from '../src/lib/validation/engine';
import { SkuMapper } from '../src/lib/sku/mapper';
import { buildReconciliationReport } from '../src/lib/reconciliation';
import { calculateGlobalMetrics } from '../src/lib/analytics';

const DIR = process.argv[2];
if (!DIR) {
  console.error('usage: tsx scripts/verify-extract.ts <dir-with-captured-xml>');
  process.exit(1);
}

// Control totals read off Tally's own dashboard for FY24-25.
const TALLY_SALES_ACCOUNTS = 28223271.4;
const TALLY_PURCHASE_ACCOUNTS = 11352917.97;

const inr = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const read = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8');

async function main() {
  const engine = new ValidationEngine();

  const salesResult = parseTallySales(read('sales.xml'), engine);
  const purchaseResult = parseTallyPurchase(read('purchase.xml'), engine);

  // Credit notes and journals share one capture; split them by voucher type.
  const otherXml = read('other.xml');
  const returnsResult = parseTallyReturns(otherXml, engine);
  const returns = returnsResult.records.filter((r) => r.rowKey?.startsWith('Credit Note|'));
  const adjustments = parseTallyAdjustments(otherXml, engine).filter((a) => a.voucherType === 'Journal');

  const sales = salesResult.records;
  const purchase = purchaseResult.records;

  const dataDir = path.join(process.cwd(), 'data', 'approval');
  const skuMaster = await parseSkuMaster(fs.readFileSync(path.join(dataDir, 'SKU_Master.csv'), 'utf-8'), engine);
  const skuMapping = await parseSkuMapping(fs.readFileSync(path.join(dataDir, 'SKU_Mapping.csv'), 'utf-8'), engine);

  const mapper = new SkuMapper(skuMaster, skuMapping, engine);
  mapper.applyToSales(sales);
  mapper.applyToPurchase(purchase);
  mapper.applyToReturns(returns);

  const report = buildReconciliationReport({
    sales,
    purchase,
    returns,
    purchaseReturns: [],
    stock: [],
    adjustments,
    skuMaster,
  });

  console.log('════════ LEDGER CHECKS ════════');
  const expected: Record<string, number> = {
    'Sales Accounts': TALLY_SALES_ACCOUNTS,
    'Purchase Accounts': TALLY_PURCHASE_ACCOUNTS,
  };
  let failed = false;
  for (const check of report.ledgerChecks) {
    const target = expected[check.label];
    const variance = check.computed - target;
    if (Math.abs(variance) > 0.01) failed = true;
    console.log(`  ${check.label}`);
    for (const c of check.components) console.log(`      ${c.label.padEnd(46)} ${inr(c.value).padStart(20)}`);
    console.log(`      ${'computed'.padEnd(46)} ${inr(check.computed).padStart(20)}`);
    console.log(`      ${'Tally'.padEnd(46)} ${inr(target).padStart(20)}`);
    console.log(`      ${'VARIANCE'.padEnd(46)} ${inr(variance).padStart(20)}`);
  }

  console.log('\n════════ LEAKAGE WATERFALL ════════');
  for (const d of report.datasets) {
    if (d.stages[0].rows === 0) continue;
    console.log(`  ${d.dataset.toUpperCase()}`);
    for (const s of d.stages) {
      const delta = s.delta ? `  (−${inr(s.delta)})` : '';
      console.log(`      ${s.label.padEnd(36)} rows ${String(s.rows).padStart(5)}  ${inr(s.value).padStart(20)}${delta}`);
    }
    console.log(`      leakage ${d.leakagePercent.toFixed(1)}% of value\n`);
  }

  console.log('════════ MAPPING COVERAGE ════════');
  for (const c of report.mappingCoverage) {
    if (!c.total) continue;
    console.log(`  ${c.dataset.padEnd(10)} ${c.mapped}/${c.total}  ${c.percent.toFixed(1)}%`);
  }

  console.log('\n════════ QUANTITIES BY UNIT ════════');
  for (const q of report.quantities) {
    if (!q.measure.primaryUnit) continue;
    const parts = Object.entries(q.measure.byUnit)
      .map(([u, v]) => `${u}=${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`)
      .join('  ');
    console.log(`  ${q.dataset.padEnd(24)} ${parts}`);
  }

  console.log('\n════════ TOP UNMAPPED BY VALUE ════════');
  for (const u of report.unmapped.slice(0, 10)) {
    console.log(`  ${inr(u.value).padStart(18)}  ${String(u.rows).padStart(3)} rows  ${u.dataset.padEnd(9)} ${u.originalItemName}`);
  }

  const metrics = calculateGlobalMetrics(sales, purchase, returns, [], [], skuMaster);
  console.log('\n════════ DASHBOARD HEADLINES (all categories) ════════');
  console.log('  gross sales value      ', inr(metrics.grossSalesValue));
  console.log('  physical return value  ', inr(metrics.salesReturnValue));
  console.log('  value-only credit notes', inr(metrics.valueOnlyCreditNoteValue));
  console.log('  net sales value        ', inr(metrics.netSalesValue));
  console.log('  purchase value         ', inr(metrics.purchaseValue));

  if (failed) {
    console.error('\nFAIL: ledger variance exceeds ₹0.01');
    process.exit(1);
  }
  console.log('\nPASS: both ledger checks reconcile to zero.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
