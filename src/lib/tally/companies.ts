/**
 * Multi-company configuration.
 *
 * Tally's HTTP gateway only serves companies that are currently loaded in the
 * running Tally instance. Querying an unloaded company returns an empty result
 * rather than an error, so a silently short sync is a real failure mode — the
 * sync reports per-company row counts to make that visible.
 */

export interface TallyCompanyConfig {
  /** Exact company name as Tally knows it, passed as SVCURRENTCOMPANY. */
  name: string;
  /** Short label for dashboard filters and grouping. */
  label: string;
  /**
   * Financial year this company file covers, derived from its name, e.g.
   * "FY2024-25". Vouchers get their year from their own date, but closing
   * stock has no date — it is a balance as at the file's year end — so it
   * needs the year from here to stop snapshots from different years being
   * summed together.
   */
  financialYear: string | null;
}

/**
 * Reads the financial year out of a company name such as
 * "…PVT.LTD (U.P) (24-25)" → "FY2024-25". Returns null when the name carries
 * no year, in which case stock from that file simply stays untagged.
 */
export function deriveCompanyFinancialYear(name: string): string | null {
  const matches = [...name.matchAll(/\((\d{2})\s*-\s*(\d{2})\)/g)];
  if (matches.length === 0) return null;
  const [, start, end] = matches[matches.length - 1];
  return `FY20${start}-${end}`;
}

/** Derives a compact display label from a Tally company name. */
function deriveLabel(name: string): string {
  const bracketed = name.match(/\(([^)]+)\)/g);
  if (bracketed) {
    // Prefer a non-period bracket such as "(U.P)" or "(Telangana)" over "(24-25)".
    const meaningful = bracketed
      .map((b) => b.slice(1, -1).trim())
      .filter((b) => !/^\d{2}-\d{2}$/.test(b));
    if (meaningful.length) return meaningful[meaningful.length - 1];
  }
  return name;
}

/**
 * Companies to sync, from TALLY_COMPANIES (comma-separated). Falls back to the
 * single-company TALLY_COMPANY so existing configs keep working.
 *
 * A `Name=Label` form is accepted when the derived label is not wanted.
 */
export function getTallyCompanies(): TallyCompanyConfig[] {
  const multi = process.env.TALLY_COMPANIES;
  const raw = multi || process.env.TALLY_COMPANY;

  if (!raw) {
    throw new Error('Neither TALLY_COMPANIES nor TALLY_COMPANY is set.');
  }

  const configs = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const eq = entry.indexOf('=');
      const name = eq > 0 ? entry.slice(0, eq).trim() : entry;
      const label = eq > 0 ? entry.slice(eq + 1).trim() : deriveLabel(entry);
      return { name, label, financialYear: deriveCompanyFinancialYear(name) };
    });

  if (configs.length === 0) {
    throw new Error('TALLY_COMPANIES is set but contains no company names.');
  }

  return configs;
}

/**
 * Parties that belong to the same group. Transactions with them are flagged so
 * that double-counting across companies is visible in combined figures.
 *
 * The optional `a` is deliberate: the group's own name is spelled inconsistently
 * across the two companies' ledgers — U.P records the counterparty as
 * "Vardhnam Agro Solutions Pvt.Ltd.(H.O)" while Telangana writes
 * "Vardhanam Agro Solutions Pvt.Ltd.(UP Branch)". Matching only one spelling
 * silently hides an entire side of the inter-company trade.
 */
const DEFAULT_INTERCOMPANY_PATTERN = /vardha?nam/i;

export function interCompanyPartyPattern(): RegExp {
  const raw = process.env.TALLY_INTERCOMPANY_PARTY_PATTERN;
  if (!raw) return DEFAULT_INTERCOMPANY_PATTERN;
  try {
    return new RegExp(raw, 'i');
  } catch {
    console.warn('[tally] TALLY_INTERCOMPANY_PARTY_PATTERN is not a valid regular expression; using default.');
    return DEFAULT_INTERCOMPANY_PATTERN;
  }
}

export interface ExpectedTotals {
  /** Keyed by "Company|FY2024-25" — a figure for one company in one financial year. */
  byCompanyAndYear: Record<string, number>;
  /** Keyed by company label only — used when no year-specific figure is configured. */
  byCompanyOnly: Record<string, number>;
}

/**
 * Expected Sales/Purchase Accounts totals, for the reconciliation variance
 * check, read from Tally's own dashboard per company per financial year.
 * Configured as comma-separated entries:
 *
 *   TALLY_EXPECTED_SALES_ACCOUNTS="U.P:FY2024-25:28223271.40,Telangana:FY2024-25:6610679.42"
 *
 * The FY segment is optional (`U.P:28223271.40` still works) for single-year
 * setups, and a bare number is accepted for single-company single-year setups.
 * As more years are entered into Tally, add one entry per (company, FY) pair —
 * there's no way to auto-derive these, they have to be read off Tally.
 */
export function expectedTotalsByCompany(envVar: string): ExpectedTotals {
  const raw = process.env[envVar];
  const byCompanyAndYear: Record<string, number> = {};
  const byCompanyOnly: Record<string, number> = {};
  if (!raw) return { byCompanyAndYear, byCompanyOnly };

  for (const part of raw.split(',')) {
    const entry = part.trim();
    if (!entry) continue;
    const segments = entry.split(':').map((s) => s.trim());

    if (segments.length >= 3) {
      const value = parseFloat(segments[segments.length - 1].replace(/,/g, ''));
      const fy = segments[segments.length - 2];
      const company = segments.slice(0, segments.length - 2).join(':');
      if (!isNaN(value)) byCompanyAndYear[`${company}|${fy}`] = value;
    } else if (segments.length === 2) {
      const value = parseFloat(segments[1].replace(/,/g, ''));
      if (!isNaN(value)) byCompanyOnly[segments[0]] = value;
    } else {
      const value = parseFloat(segments[0].replace(/,/g, ''));
      if (!isNaN(value)) byCompanyOnly.__single = value;
    }
  }
  return { byCompanyAndYear, byCompanyOnly };
}
