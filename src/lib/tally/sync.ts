import fs from 'fs';
import path from 'path';
import { queryTally } from './client';
import {
  buildVoucherExportRequest,
  buildStockExportRequest,
  buildLedgerVoucherExportRequest,
} from './requests';
import { getTallyCompanies, TallyCompanyConfig } from './companies';
import { parseTallySales } from '../parsers/parseTallySales';
import { parseTallyPurchase } from '../parsers/parseTallyPurchase';
import { parseTallyReturns } from '../parsers/parseTallyReturns';
import { parseTallyDebitNotes } from '../parsers/parseTallyDebitNotes';
import { parseTallyStock } from '../parsers/parseTallyStock';
import { parseTallyAdjustments } from '../parsers/parseTallyAdjustments';
import { parseSkuMaster } from '../parsers/parseSkuMaster';
import { parseSkuMapping } from '../parsers/parseSkuMapping';
import { ValidationEngine } from '../validation/engine';
import { SkuMapper } from '../sku/mapper';
import { detectPurchaseOverlap } from '../validation/advanced';
import { detectDuplicateRows } from '../validation/duplicates';
import { saveProcessedData, saveSyncResult, SyncResultRecord } from '../db/sqlite';
import { buildReconciliationReport } from '../reconciliation';
import {
  ProcessedSalesRecord,
  ProcessedPurchaseRecord,
  ProcessedSalesReturnRecord,
  ProcessedPurchaseReturnRecord,
  ProcessedStockRecord,
  ProcessedAdjustmentRecord,
} from '@/types';

export type TallySyncResult = SyncResultRecord;

/**
 * Superseded design note: an earlier version of this file tried to scope each
 * sync to one financial year via SVFROMDATE/SVTODATE and warned loudly if they
 * weren't set. Live testing against Tally showed that doesn't work — the
 * Voucher Collection query (TYPE=Collection, ISINITIALIZE=Yes) ignores those
 * static variables for this TDL shape; requesting FY23-24 still returned
 * FY24-25's vouchers unchanged. It only looked correct because FY24-25 was
 * the only year with data.
 *
 * The sync now always fetches full company history — TALLY_FROM_DATE/
 * TALLY_TO_DATE are kept only as an optional outer sanity bound, not a
 * per-year filter — and every record is tagged with its own financial year
 * (`financialYearOf(date)`, computed client-side) so the dashboard and
 * reconciliation can filter and check per year. A newly-entered year is
 * picked up automatically on the next sync; no config change needed.
 */
function fromDateBound(): string {
  return process.env.TALLY_FROM_DATE || '19900101';
}

function toDateBound(): string {
  if (process.env.TALLY_TO_DATE) return process.env.TALLY_TO_DATE;
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Voucher types fetched for their ledger postings rather than inventory. Journals
 * carry sales and purchase value that never appears on an inventory entry, so
 * omitting them leaves the books short against Tally's group totals.
 */
function adjustmentVoucherTypes(): string[] {
  const raw = process.env.TALLY_ADJUSTMENT_VOUCHER_TYPES;
  if (!raw) return ['Journal'];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface CompanyExtract {
  company: TallyCompanyConfig;
  sales: ProcessedSalesRecord[];
  purchase: ProcessedPurchaseRecord[];
  returns: ProcessedSalesReturnRecord[];
  purchaseReturns: ProcessedPurchaseReturnRecord[];
  stock: ProcessedStockRecord[];
  adjustments: ProcessedAdjustmentRecord[];
  stats: Record<string, unknown>;
}

/**
 * Pulls one company's datasets.
 *
 * Requests within a company run in parallel, but companies are processed one at
 * a time — Tally's gateway is single-threaded per instance and saturating it
 * with concurrent requests across companies risks the stalls seen in testing.
 */
async function extractCompany(
  company: TallyCompanyConfig,
  validationEngine: ValidationEngine,
  fromDate: string,
  toDate: string
): Promise<CompanyExtract> {
  const adjustmentTypes = adjustmentVoucherTypes();

  const [salesXml, purchaseXml, returnsXml, debitNoteXml, stockXml, ...adjustmentXmls] = await Promise.all([
    queryTally(buildVoucherExportRequest(company.name, 'Sales', fromDate, toDate)),
    queryTally(buildVoucherExportRequest(company.name, 'Purchase', fromDate, toDate)),
    queryTally(buildVoucherExportRequest(company.name, 'Credit Note', fromDate, toDate)),
    queryTally(buildVoucherExportRequest(company.name, 'Debit Note', fromDate, toDate)),
    queryTally(buildStockExportRequest(company.name)),
    ...adjustmentTypes.map((type) =>
      queryTally(buildLedgerVoucherExportRequest(company.name, type, fromDate, toDate))
    ),
  ]);

  const salesResult = parseTallySales(salesXml, validationEngine, company.label);
  const purchaseResult = parseTallyPurchase(purchaseXml, validationEngine, company.label);
  const returnsResult = parseTallyReturns(returnsXml, validationEngine, company.label);
  const purchaseReturnsResult = parseTallyDebitNotes(debitNoteXml, validationEngine, company.label);
  const stock = parseTallyStock(stockXml, validationEngine, company.label, company.financialYear);
  const adjustments = adjustmentXmls.flatMap((xml) =>
    parseTallyAdjustments(xml, validationEngine, company.label)
  );

  // Tally returns an empty result rather than an error both when a company is
  // not loaded and when it is loaded but holds no data, so the two cases are
  // called out together — silently syncing nothing is the failure to avoid.
  if (salesResult.records.length === 0 && purchaseResult.records.length === 0) {
    validationEngine.logIssue(
      `Tally (${company.label})`,
      undefined,
      'Critical',
      'MISSING_REQUIRED_COLUMN',
      `Company "${company.name}" returned no sales or purchase vouchers. Either it is not loaded in Tally, or it is loaded but contains no transaction data yet.`
    );
  }

  return {
    company,
    sales: salesResult.records,
    purchase: purchaseResult.records,
    returns: returnsResult.records,
    purchaseReturns: purchaseReturnsResult.records,
    stock,
    adjustments,
    stats: {
      sales: salesResult.stats,
      purchase: purchaseResult.stats,
      returns: returnsResult.stats,
      purchaseReturns: purchaseReturnsResult.stats,
    },
  };
}

/**
 * Pulls every configured company from Tally without persisting anything.
 *
 * Split out from `runTallySync` so the combined ingest can merge these records
 * with other sources before SKU mapping and reconciliation run once over the
 * whole dataset — mapping and reconciling each source separately would report
 * per-source totals that never add up to what the dashboard displays.
 */
export async function extractAllCompanies(
  validationEngine: ValidationEngine
): Promise<{ extracts: CompanyExtract[]; fromDate: string; toDate: string }> {
  const companies = getTallyCompanies();
  const fromDate = fromDateBound();
  const toDate = toDateBound();

  const extracts: CompanyExtract[] = [];
  for (const company of companies) {
    extracts.push(await extractCompany(company, validationEngine, fromDate, toDate));
  }
  return { extracts, fromDate, toDate };
}

export async function runTallySync(): Promise<TallySyncResult> {
  const syncedAt = new Date().toISOString();

  try {
    const companies = getTallyCompanies();
    const validationEngine = new ValidationEngine();
    const { extracts, fromDate, toDate } = await extractAllCompanies(validationEngine);

    const sales = extracts.flatMap((e) => e.sales);
    const purchase = extracts.flatMap((e) => e.purchase);
    const returns = extracts.flatMap((e) => e.returns);
    const purchaseReturns = extracts.flatMap((e) => e.purchaseReturns);
    const stock = extracts.flatMap((e) => e.stock);
    const adjustments = extracts.flatMap((e) => e.adjustments);

    const duplicates = detectDuplicateRows(
      { sales, purchase, returns, purchaseReturns, adjustments },
      validationEngine
    );

    // SKU taxonomy is a business-defined mapping, not something Tally models natively,
    // so it still comes from the maintained CSVs rather than the live ERP data.
    const dataDir = path.join(process.cwd(), 'data', 'approval');
    const skuMasterFile = fs.readFileSync(path.join(dataDir, 'SKU_Master.csv'), 'utf-8');
    const skuMappingFile = fs.readFileSync(path.join(dataDir, 'SKU_Mapping.csv'), 'utf-8');
    const skuMaster = await parseSkuMaster(skuMasterFile, validationEngine);
    const skuMapping = await parseSkuMapping(skuMappingFile, validationEngine);

    const mapper = new SkuMapper(skuMaster, skuMapping, validationEngine);
    mapper.applyToSales(sales);
    mapper.applyToPurchase(purchase);
    mapper.applyToReturns(returns);
    mapper.applyToPurchaseReturns(purchaseReturns);
    mapper.applyToStock(stock);

    detectPurchaseOverlap(purchase, validationEngine);

    const issues = validationEngine.getIssues();

    const reconciliation = buildReconciliationReport({
      sales,
      purchase,
      returns,
      purchaseReturns,
      stock,
      adjustments,
      skuMaster,
      // Deduped: several Tally company files can share one logical label
      // (FY23-24 and FY24-25 are separate files that both report as "U.P"),
      // and each label should produce one set of ledger checks, not one per file.
      companies: Array.from(new Set(companies.map((c) => c.label))),
    });

    saveProcessedData({
      sales,
      purchase,
      returns,
      purchaseReturns,
      stock,
      adjustments,
      issues,
      skuMaster,
      reconciliation,
    });

    const financialYears = Array.from(
      new Set(
        [...sales, ...purchase, ...returns, ...purchaseReturns, ...adjustments]
          .map((r) => r.financialYear)
          .filter((fy): fy is string => Boolean(fy))
      )
    ).sort();

    const result: TallySyncResult = {
      success: true,
      syncedAt,
      fetchedRange: { fromDate, toDate },
      financialYears,
      counts: {
        sales: sales.length,
        purchase: purchase.length,
        returns: returns.length,
        purchaseReturns: purchaseReturns.length,
        stock: stock.length,
        adjustments: adjustments.length,
        issues: issues.length,
      },
      companies: extracts.map((e) => ({
        label: e.company.label,
        name: e.company.name,
        sales: e.sales.length,
        purchase: e.purchase.length,
        returns: e.returns.length,
        purchaseReturns: e.purchaseReturns.length,
        stock: e.stock.length,
        adjustments: e.adjustments.length,
      })),
      duplicates: duplicates.total > 0 ? duplicates : undefined,
      // Keyed by full Tally company name, not label — several files can share
      // one label and would otherwise overwrite each other's stats here.
      extraction: Object.fromEntries(extracts.map((e) => [e.company.name, e.stats])),
      ledgerChecks: reconciliation.ledgerChecks.map((c) => ({
        label: c.label,
        company: c.company,
        financialYear: c.financialYear,
        computed: c.computed,
        expected: c.expected,
        variance: c.variance,
      })),
    };
    saveSyncResult(result);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during Tally sync';
    console.error('[tally-sync] failed:', message);
    const result: TallySyncResult = { success: false, syncedAt, error: message };
    saveSyncResult(result);
    return result;
  }
}
