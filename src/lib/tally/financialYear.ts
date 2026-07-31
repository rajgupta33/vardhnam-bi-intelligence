/**
 * Indian financial years run 1-April to 31-March. Every dated record is
 * tagged with its FY at parse time so the dashboard can filter and the
 * reconciliation can check each year independently.
 *
 * This is deliberately computed client-side from each voucher's own date,
 * not requested from Tally per year. Live testing showed Tally's Voucher
 * Collection query (TYPE=Collection, ISINITIALIZE=Yes) ignores
 * SVFROMDATE/SVTODATE for this TDL shape — asking for FY23-24 still returned
 * FY24-25's vouchers unchanged. Splitting locally after a full fetch sidesteps
 * that unreliability entirely and also means a newly-entered year is picked
 * up automatically on the next sync, with no config change required.
 */
export function financialYearOf(date: Date | null | undefined): string | null {
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-indexed; 3 = April
  const startYear = month >= 3 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  return `FY${startYear}-${endYearShort}`;
}

/** Sorts "FY2023-24" before "FY2024-25" — lexical order already works, this just documents it. */
export function compareFinancialYears(a: string, b: string): number {
  return a.localeCompare(b);
}
