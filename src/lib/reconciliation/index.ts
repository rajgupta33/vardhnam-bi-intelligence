import {
  ProcessedSalesRecord,
  ProcessedPurchaseRecord,
  ProcessedSalesReturnRecord,
  ProcessedPurchaseReturnRecord,
  ProcessedStockRecord,
  ProcessedAdjustmentRecord,
  SkuMasterRecord,
  QuantityMeasure,
} from '@/types';
import { expectedTotalsByCompany, ExpectedTotals } from '../tally/companies';

/**
 * Proves that what the dashboard displays still adds up to what Tally holds.
 *
 * Every stage that removes rows is measured, so a divergence points at the stage
 * that caused it instead of prompting a fresh investigation. The two identities
 * this must preserve, verified against FY24-25:
 *
 *   Sales Accounts    = gross sales − all credit notes − sales journals
 *   Purchase Accounts = purchase vouchers + purchase journals
 */

export interface WaterfallStage {
  label: string;
  /** Rows still included at this stage. */
  rows: number;
  value: number;
  /** Value removed relative to the previous stage; negative means added back. */
  delta: number;
  note?: string;
}

export interface DatasetReconciliation {
  dataset: 'sales' | 'purchase' | 'returns' | 'purchaseReturns' | 'stock';
  stages: WaterfallStage[];
  /** Value that reaches the dashboard after every filter. */
  displayed: number;
  /** Value present in the source extract. */
  extracted: number;
  leakageValue: number;
  leakagePercent: number;
}

export interface LedgerCheck {
  label: string;
  /** Which company this check covers. Each must tie to its own Tally figures. */
  company: string;
  /** Which financial year this check covers; null means every year combined. */
  financialYear: string | null;
  computed: number;
  /** Figure from Tally's own dashboard, when supplied. */
  expected: number | null;
  variance: number | null;
  components: { label: string; value: number }[];
}

/**
 * Trade with related group entities. Combined figures still include these rows
 * per the agreed treatment — this exists so the double-counting is measurable
 * rather than hidden.
 */
export interface InterCompanySummary {
  salesValue: number;
  salesRows: number;
  purchaseValue: number;
  purchaseRows: number;
  adjustmentValue: number;
  parties: { party: string; dataset: string; rows: number; value: number }[];
}

export interface UnmappedItem {
  originalItemName: string;
  dataset: string;
  rows: number;
  quantity: number;
  unit: string | null;
  value: number;
}

export interface ReconciliationReport {
  generatedAt: string;
  companies: string[];
  financialYears: string[];
  datasets: DatasetReconciliation[];
  ledgerChecks: LedgerCheck[];
  unmapped: UnmappedItem[];
  mappingCoverage: { dataset: string; total: number; mapped: number; percent: number }[];
  quantities: { dataset: string; measure: QuantityMeasure }[];
  interCompany: InterCompanySummary;
}

const sum = <T>(rows: T[], pick: (r: T) => number | null | undefined) =>
  rows.reduce((s, r) => s + (pick(r) || 0), 0);

/** Groups quantities by unit so figures in kilograms are never added to pieces. */
export function measureQuantity<T>(
  rows: T[],
  qty: (r: T) => number | null | undefined,
  unit: (r: T) => string | null | undefined
): QuantityMeasure {
  const byUnit: Record<string, number> = {};
  for (const row of rows) {
    const key = unit(row) || 'UNSPECIFIED';
    byUnit[key] = (byUnit[key] || 0) + (qty(row) || 0);
  }
  const entries = Object.entries(byUnit).sort((a, b) => b[1] - a[1]);
  return {
    byUnit,
    primaryUnit: entries.length ? entries[0][0] : null,
    primary: entries.length ? entries[0][1] : 0,
  };
}

function buildStages<
  T extends { validationStatus: string; skuId: string | null; isCancelled?: boolean; isOptional?: boolean },
>(
  dataset: DatasetReconciliation['dataset'],
  rows: T[],
  value: (r: T) => number | null | undefined
): DatasetReconciliation {
  const stages: WaterfallStage[] = [];
  const push = (label: string, kept: T[], note?: string) => {
    const v = sum(kept, value);
    const prev = stages.length ? stages[stages.length - 1].value : v;
    stages.push({ label, rows: kept.length, value: v, delta: prev - v, note });
    return kept;
  };

  let current = push('Extracted from Tally', rows);
  current = push(
    'After removing cancelled/optional',
    current.filter((r) => !r.isCancelled && !r.isOptional),
    'Cancelled and optional vouchers are excluded from reporting'
  );
  current = push(
    'After validation exclusions',
    current.filter((r) => r.validationStatus !== 'EXCLUDED')
  );
  current = push(
    'After SKU mapping',
    current.filter((r) => r.skuId),
    'Rows with no SKU mapping cannot be attributed to a crop or category'
  );

  const extracted = stages[0].value;
  const displayed = stages[stages.length - 1].value;
  return {
    dataset,
    stages,
    extracted,
    displayed,
    leakageValue: extracted - displayed,
    leakagePercent: extracted === 0 ? 0 : ((extracted - displayed) / extracted) * 100,
  };
}

function collectUnmapped<T extends { skuId: string | null; originalItemName: string; unit?: string | null }>(
  dataset: string,
  rows: T[],
  qty: (r: T) => number | null | undefined,
  value: (r: T) => number | null | undefined
): UnmappedItem[] {
  const map = new Map<string, UnmappedItem>();
  for (const row of rows) {
    if (row.skuId) continue;
    const key = row.originalItemName;
    const existing = map.get(key);
    if (existing) {
      existing.rows += 1;
      existing.quantity += qty(row) || 0;
      existing.value += value(row) || 0;
    } else {
      map.set(key, {
        originalItemName: key,
        dataset,
        rows: 1,
        quantity: qty(row) || 0,
        unit: row.unit ?? null,
        value: value(row) || 0,
      });
    }
  }
  return Array.from(map.values());
}

export interface ReconciliationInput {
  sales: ProcessedSalesRecord[];
  purchase: ProcessedPurchaseRecord[];
  returns: ProcessedSalesReturnRecord[];
  purchaseReturns: ProcessedPurchaseReturnRecord[];
  stock: ProcessedStockRecord[];
  adjustments: ProcessedAdjustmentRecord[];
  skuMaster: SkuMasterRecord[];
  companies?: string[];
  /** Financial years to check, e.g. ["FY2024-25"]. Auto-discovered from the data if omitted. */
  financialYears?: string[];
}

const live = <T extends { isCancelled?: boolean; isOptional?: boolean }>(rows: T[]) =>
  rows.filter((r) => !r.isCancelled && !r.isOptional);

function lookupExpected(expected: ExpectedTotals, company: string | null, fy: string | null): number | null {
  if (company !== null && fy !== null) {
    const exact = expected.byCompanyAndYear[`${company}|${fy}`];
    if (exact !== undefined) return exact;
  }
  if (company !== null) {
    const companyOnly = expected.byCompanyOnly[company];
    if (companyOnly !== undefined) return companyOnly;
  }
  if (company === null && fy === null && expected.byCompanyOnly.__single !== undefined) {
    return expected.byCompanyOnly.__single;
  }
  return null;
}

/**
 * Builds the two ledger identities for one (company, financial year) slice —
 * `null` for either dimension means "every value combined" — each of which
 * must tie to Tally's own group totals for that same slice:
 *
 *   Sales Accounts    = gross sales − all credit notes − sales journals
 *                       + debit notes that credit a sales ledger
 *   Purchase Accounts = purchase vouchers + purchase journals
 *                       − debit notes that debit a purchase ledger
 */
function ledgerChecksFor(
  company: string | null,
  financialYear: string | null,
  input: ReconciliationInput,
  salesExpected: ExpectedTotals,
  purchaseExpected: ExpectedTotals
): LedgerCheck[] {
  const scope = <T extends { company?: string; financialYear?: string | null }>(rows: T[]) =>
    rows.filter(
      (r) => (company === null || r.company === company) && (financialYear === null || r.financialYear === financialYear)
    );

  const grossSales = sum(live(scope(input.sales)), (r) => r.value);
  const creditNotes = sum(live(scope(input.returns)), (r) => r.returnValue);
  const purchaseValue = sum(live(scope(input.purchase)), (r) => r.value);
  // A Debit Note reduces Purchase only when it actually posts to a Purchase
  // ledger. Ones raised on a customer credit Sales instead — a rate-difference
  // correction that raises revenue and never touches Purchase — so they are
  // split by the ledger they hit, not by voucher type. Booking both as purchase
  // returns put U.P FY23-24 out by ₹97,732 on each side simultaneously.
  // Unclassified rows stay on the purchase side, preserving prior behaviour.
  const debitNoteRows = live(scope(input.purchaseReturns ?? []));
  const debitNotes = sum(
    debitNoteRows.filter((r) => r.ledgerKind !== 'SALES'),
    (r) => r.returnValue
  );
  const salesDebitNotes = sum(
    debitNoteRows.filter((r) => r.ledgerKind === 'SALES'),
    (r) => r.returnValue
  );

  const adj = live(scope(input.adjustments));
  const salesAdjValue = Math.abs(sum(adj.filter((a) => a.kind === 'SALES'), (a) => a.amount));
  const purchaseAdjValue = Math.abs(sum(adj.filter((a) => a.kind === 'PURCHASE'), (a) => a.amount));

  const salesComputed = grossSales - creditNotes - salesAdjValue + salesDebitNotes;
  const purchaseComputed = purchaseValue + purchaseAdjValue - debitNotes;

  const sExp = lookupExpected(salesExpected, company, financialYear);
  const pExp = lookupExpected(purchaseExpected, company, financialYear);
  const label = company ?? 'All companies';

  return [
    {
      label: 'Sales Accounts',
      company: label,
      financialYear,
      computed: salesComputed,
      expected: sExp,
      variance: sExp === null ? null : salesComputed - sExp,
      components: [
        { label: 'Gross sales (inventory lines)', value: grossSales },
        { label: 'Less: all credit notes', value: -creditNotes },
        { label: 'Less: journal postings to sales ledgers', value: -salesAdjValue },
        { label: 'Plus: debit notes crediting sales ledgers', value: salesDebitNotes },
      ],
    },
    {
      label: 'Purchase Accounts',
      company: label,
      financialYear,
      computed: purchaseComputed,
      expected: pExp,
      variance: pExp === null ? null : purchaseComputed - pExp,
      components: [
        { label: 'Purchase vouchers (inventory lines)', value: purchaseValue },
        { label: 'Plus: journal postings to purchase ledgers', value: purchaseAdjValue },
        { label: 'Less: debit notes posting to purchase ledgers', value: -debitNotes },
      ],
    },
  ];
}

/** Measures related-party trade so its effect on combined figures is visible. */
function summariseInterCompany(input: ReconciliationInput): InterCompanySummary {
  const salesRows = live(input.sales).filter((r) => r.isInterCompany);
  const purchaseRows = live(input.purchase).filter((r) => r.isInterCompany);
  const adjRows = live(input.adjustments).filter((a) => a.isInterCompany);

  const parties = new Map<string, { party: string; dataset: string; rows: number; value: number }>();
  const add = (party: string, dataset: string, value: number) => {
    const key = `${dataset}|${party}`;
    const existing = parties.get(key);
    if (existing) {
      existing.rows += 1;
      existing.value += value;
    } else {
      parties.set(key, { party, dataset, rows: 1, value });
    }
  };
  salesRows.forEach((r) => add(r.party, 'sales', r.value || 0));
  purchaseRows.forEach((r) => add(r.supplier, 'purchase', r.value || 0));
  adjRows.forEach((a) => add(a.party, 'adjustment', Math.abs(a.amount)));

  return {
    salesValue: sum(salesRows, (r) => r.value),
    salesRows: salesRows.length,
    purchaseValue: sum(purchaseRows, (r) => r.value),
    purchaseRows: purchaseRows.length,
    adjustmentValue: Math.abs(sum(adjRows, (a) => a.amount)),
    parties: Array.from(parties.values()).sort((a, b) => b.value - a.value),
  };
}

export function buildReconciliationReport(input: ReconciliationInput): ReconciliationReport {
  const { sales, purchase, returns, purchaseReturns, stock } = input;

  const companies =
    input.companies ??
    Array.from(new Set(sales.map((r) => r.company).filter((c): c is string => Boolean(c))));

  const financialYears = (
    input.financialYears ??
    Array.from(
      new Set(
        [...sales, ...purchase, ...returns, ...purchaseReturns]
          .map((r) => r.financialYear)
          .filter((fy): fy is string => Boolean(fy))
      )
    )
  ).sort();

  const salesExpected = expectedTotalsByCompany('TALLY_EXPECTED_SALES_ACCOUNTS');
  const purchaseExpected = expectedTotalsByCompany('TALLY_EXPECTED_PURCHASE_ACCOUNTS');

  // One check per (company, year) slice — every slice must independently tie
  // to Tally, since a company's own dashboard reports one year at a time.
  // Then roll-ups: per company across all years, per year across all
  // companies, and a grand total — each only added when there's more than one
  // value being combined, so a single-company single-year setup still shows
  // exactly the two checks it always has.
  const ledgerChecks: LedgerCheck[] = [
    ...companies.flatMap((c) => financialYears.flatMap((fy) => ledgerChecksFor(c, fy, input, salesExpected, purchaseExpected))),
    ...(financialYears.length > 1
      ? companies.flatMap((c) => ledgerChecksFor(c, null, input, salesExpected, purchaseExpected))
      : []),
    ...(companies.length > 1
      ? financialYears.flatMap((fy) => ledgerChecksFor(null, fy, input, salesExpected, purchaseExpected))
      : []),
    ...(companies.length > 1 || financialYears.length > 1
      ? ledgerChecksFor(null, null, input, salesExpected, purchaseExpected)
      : []),
  ];

  const datasets: DatasetReconciliation[] = [
    buildStages('sales', sales, (r) => r.value),
    buildStages('purchase', purchase, (r) => r.value),
    buildStages('returns', returns, (r) => r.returnValue),
    buildStages('purchaseReturns', purchaseReturns, (r) => r.returnValue),
    buildStages('stock', stock, (r) => r.closingValue),
  ];

  const unmapped = [
    ...collectUnmapped('sales', sales, (r) => r.quantity, (r) => r.value),
    ...collectUnmapped('purchase', purchase, (r) => r.quantity, (r) => r.value),
    ...collectUnmapped('returns', returns, (r) => r.returnQuantity, (r) => r.returnValue),
    ...collectUnmapped('purchaseReturns', purchaseReturns, (r) => r.returnQuantity, (r) => r.returnValue),
    ...collectUnmapped('stock', stock, (r) => r.closingQuantity, (r) => r.closingValue),
  ].sort((a, b) => b.value - a.value);

  const coverage = (name: string, rows: { skuId: string | null }[]) => {
    const mapped = rows.filter((r) => r.skuId).length;
    return { dataset: name, total: rows.length, mapped, percent: rows.length ? (mapped / rows.length) * 100 : 100 };
  };

  return {
    generatedAt: new Date().toISOString(),
    companies,
    financialYears,
    interCompany: summariseInterCompany(input),
    datasets,
    ledgerChecks,
    unmapped,
    mappingCoverage: [
      coverage('sales', sales),
      coverage('purchase', purchase),
      coverage('returns', returns),
      coverage('purchaseReturns', purchaseReturns),
      coverage('stock', stock),
    ],
    quantities: [
      { dataset: 'sales', measure: measureQuantity(live(sales), (r) => r.quantity, (r) => r.unit) },
      { dataset: 'purchase', measure: measureQuantity(live(purchase), (r) => r.quantity, (r) => r.unit) },
      {
        dataset: 'returns (physical only)',
        measure: measureQuantity(
          live(returns).filter((r) => r.returnKind === 'PHYSICAL'),
          (r) => r.returnQuantity,
          (r) => r.unit
        ),
      },
      {
        dataset: 'purchase returns (physical only)',
        measure: measureQuantity(
          live(purchaseReturns).filter((r) => r.returnKind === 'PHYSICAL'),
          (r) => r.returnQuantity,
          (r) => r.unit
        ),
      },
      { dataset: 'stock', measure: measureQuantity(stock, (r) => r.closingQuantity, (r) => r.unit) },
    ],
  };
}
