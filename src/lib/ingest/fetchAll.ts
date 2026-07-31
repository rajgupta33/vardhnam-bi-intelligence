import fs from 'fs';
import path from 'path';
import {
  ProcessedSalesRecord,
  ProcessedPurchaseRecord,
  ProcessedSalesReturnRecord,
  ProcessedPurchaseReturnRecord,
  ProcessedStockRecord,
  ProcessedAdjustmentRecord,
} from '@/types';
import { ValidationEngine } from '../validation/engine';
import { SkuMapper } from '../sku/mapper';
import { detectPurchaseOverlap } from '../validation/advanced';
import { detectDuplicateRows } from '../validation/duplicates';
import { parseSkuMaster } from '../parsers/parseSkuMaster';
import { parseSkuMapping } from '../parsers/parseSkuMapping';
import { buildReconciliationReport } from '../reconciliation';
import { saveProcessedData, saveSyncResult, countStoredRows, SyncResultRecord } from '../db/sqlite';
import { extractAllCompanies, CompanyExtract } from '../tally/sync';
import { getTallyCompanies } from '../tally/companies';
import { runLocalFileSync, LocalFileSyncResult } from '../localfiles/sync';

/**
 * Loads every configured source into one dataset.
 *
 * Tally currently supplies FY2024-25; the converted registers in data/approval
 * supply FY2025-26 until that year is available from Tally directly. Both
 * produce identical record shapes, so they are merged before SKU mapping and
 * reconciliation run once over the combined result — the dashboard reads one
 * dataset, and the financial-year filter separates the periods.
 *
 * A failure in one source must not silently halve the dataset, so each source
 * is reported separately with its own row counts and error.
 */

export interface SourceOutcome {
  source: 'tally' | 'local-excel';
  ok: boolean;
  error?: string;
  counts: { sales: number; purchase: number; returns: number; purchaseReturns: number; stock: number; adjustments: number };
  detail?: unknown;
}

export interface FetchAllResult extends SyncResultRecord {
  sources?: SourceOutcome[];
}

function countsOf(d: {
  sales: unknown[];
  purchase: unknown[];
  returns: unknown[];
  purchaseReturns?: unknown[];
  stock: unknown[];
  adjustments?: unknown[];
}) {
  return {
    sales: d.sales.length,
    purchase: d.purchase.length,
    returns: d.returns.length,
    purchaseReturns: d.purchaseReturns?.length ?? 0,
    stock: d.stock.length,
    adjustments: d.adjustments?.length ?? 0,
  };
}

function sourceRowTotal(c: SourceOutcome['counts']): number {
  return c.sales + c.purchase + c.returns + c.purchaseReturns + c.stock + c.adjustments;
}

export async function runFullIngest(): Promise<FetchAllResult> {
  const syncedAt = new Date().toISOString();
  const validationEngine = new ValidationEngine();
  const sources: SourceOutcome[] = [];

  const sales: ProcessedSalesRecord[] = [];
  const purchase: ProcessedPurchaseRecord[] = [];
  const returns: ProcessedSalesReturnRecord[] = [];
  const purchaseReturns: ProcessedPurchaseReturnRecord[] = [];
  const stock: ProcessedStockRecord[] = [];
  const adjustments: ProcessedAdjustmentRecord[] = [];

  let tallyExtracts: CompanyExtract[] = [];
  let fetchedRange: { fromDate: string; toDate: string } | undefined;

  // --- Source 1: Tally ---------------------------------------------------
  try {
    const { extracts, fromDate, toDate } = await extractAllCompanies(validationEngine);
    tallyExtracts = extracts;
    fetchedRange = { fromDate, toDate };

    const t = {
      sales: extracts.flatMap((e) => e.sales),
      purchase: extracts.flatMap((e) => e.purchase),
      returns: extracts.flatMap((e) => e.returns),
      purchaseReturns: extracts.flatMap((e) => e.purchaseReturns),
      stock: extracts.flatMap((e) => e.stock),
      adjustments: extracts.flatMap((e) => e.adjustments),
    };
    sales.push(...t.sales);
    purchase.push(...t.purchase);
    returns.push(...t.returns);
    purchaseReturns.push(...t.purchaseReturns);
    stock.push(...t.stock);
    adjustments.push(...t.adjustments);

    sources.push({
      source: 'tally',
      ok: true,
      counts: countsOf(t),
      detail: extracts.map((e) => ({ company: e.company.label, name: e.company.name, ...countsOf(e) })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error reading Tally';
    // Recorded rather than thrown: the local files may still have loaded, and a
    // partial dataset with a visible failure beats no dataset and no explanation.
    validationEngine.logIssue(
      'Tally',
      undefined,
      'Critical',
      'MISSING_REQUIRED_COLUMN',
      `Tally could not be read: ${message}`
    );
    sources.push({
      source: 'tally',
      ok: false,
      error: message,
      counts: { sales: 0, purchase: 0, returns: 0, purchaseReturns: 0, stock: 0, adjustments: 0 },
    });
  }

  // --- Source 2: local converted registers -------------------------------
  let localResult: LocalFileSyncResult | null = null;
  try {
    localResult = runLocalFileSync(validationEngine);
    sales.push(...localResult.sales);
    purchase.push(...localResult.purchase);
    returns.push(...localResult.returns);
    stock.push(...localResult.stock);

    sources.push({
      source: 'local-excel',
      ok: true,
      counts: countsOf(localResult),
      detail: localResult.files,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error reading local files';
    validationEngine.logIssue(
      'Local files',
      undefined,
      'Critical',
      'MISSING_REQUIRED_COLUMN',
      `Local files could not be read: ${message}`
    );
    sources.push({
      source: 'local-excel',
      ok: false,
      error: message,
      counts: { sales: 0, purchase: 0, returns: 0, purchaseReturns: 0, stock: 0, adjustments: 0 },
    });
  }

  if (sources.every((s) => !s.ok)) {
    const result: FetchAllResult = {
      success: false,
      syncedAt,
      error: sources.map((s) => `${s.source}: ${s.error}`).join(' | '),
      sources,
    };
    saveSyncResult(result);
    return result;
  }

  // Persistence is a full-table replace, so a partial load must never overwrite
  // a complete one. Two different failures both end in silent data loss, and
  // both were observed: a source that is unreachable (Tally not running, which
  // is reported as an error) and one that answers with an empty payload (Tally
  // running but its company files not loaded, which is reported as success).
  // Whenever a good snapshot already exists, keep it and report the failure.
  const degraded = sources.filter((s) => !s.ok || sourceRowTotal(s.counts) === 0);
  if (degraded.length > 0 && countStoredRows() > 0) {
    const detail = degraded
      .map(
        (s) =>
          `${s.source}: ${s.error ?? 'connected but returned no rows — its company files are most likely not loaded'}`
      )
      .join(' | ');
    const result: FetchAllResult = {
      success: false,
      syncedAt,
      error: `Kept the existing data rather than overwriting it with a partial load. ${detail}`,
      sources,
    };
    saveSyncResult(result);
    return result;
  }

  // --- Merged processing --------------------------------------------------
  // Runs once over everything, so a voucher present in two sources is caught
  // and the reconciliation reflects what the dashboard will actually display.
  const duplicates = detectDuplicateRows(
    { sales, purchase, returns, purchaseReturns, adjustments },
    validationEngine
  );

  const dataDir = path.join(process.cwd(), 'data', 'approval');
  const skuMaster = await parseSkuMaster(
    fs.readFileSync(path.join(dataDir, 'SKU_Master.csv'), 'utf-8'),
    validationEngine
  );
  const skuMapping = await parseSkuMapping(
    fs.readFileSync(path.join(dataDir, 'SKU_Mapping.csv'), 'utf-8'),
    validationEngine
  );

  const mapper = new SkuMapper(skuMaster, skuMapping, validationEngine);
  mapper.applyToSales(sales);
  mapper.applyToPurchase(purchase);
  mapper.applyToReturns(returns);
  mapper.applyToPurchaseReturns(purchaseReturns);
  mapper.applyToStock(stock);

  detectPurchaseOverlap(purchase, validationEngine);

  const issues = validationEngine.getIssues();

  let companyLabels: string[] = [];
  try {
    companyLabels = Array.from(new Set(getTallyCompanies().map((c) => c.label)));
  } catch {
    companyLabels = [];
  }
  // Local files can introduce a company Tally did not supply, so labels are
  // unioned from both rather than taken from configuration alone.
  const allLabels = Array.from(
    new Set([
      ...companyLabels,
      ...sales.map((r) => r.company),
      ...purchase.map((r) => r.company),
    ].filter((c): c is string => Boolean(c)))
  ).sort();

  const reconciliation = buildReconciliationReport({
    sales,
    purchase,
    returns,
    purchaseReturns,
    stock,
    adjustments,
    skuMaster,
    companies: allLabels,
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

  const result: FetchAllResult = {
    success: true,
    syncedAt,
    fetchedRange,
    financialYears,
    duplicates: duplicates.total > 0 ? duplicates : undefined,
    sources,
    counts: {
      sales: sales.length,
      purchase: purchase.length,
      returns: returns.length,
      purchaseReturns: purchaseReturns.length,
      stock: stock.length,
      adjustments: adjustments.length,
      issues: issues.length,
    },
    companies: tallyExtracts.map((e) => ({
      label: e.company.label,
      name: e.company.name,
      sales: e.sales.length,
      purchase: e.purchase.length,
      returns: e.returns.length,
      purchaseReturns: e.purchaseReturns.length,
      stock: e.stock.length,
      adjustments: e.adjustments.length,
    })),
    extraction: Object.fromEntries(tallyExtracts.map((e) => [e.company.name, e.stats])),
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
}
