import { ValidationEngine } from './engine';

/**
 * Guards against the same voucher being counted twice.
 *
 * Multiple Tally company files can map to one logical company — FY23-24 and
 * FY24-25 live in separate files that both report as "U.P" — and the merged
 * dataset is written with a freshly generated `id` per row, so nothing
 * downstream would notice an overlap. If two source files both contained the
 * same voucher (say a year-end migration left FY23-24 vouchers inside the
 * FY24-25 file), its value would silently land in the totals twice.
 *
 * A genuine duplicate produces an identical composite `rowKey`, since that key
 * is built from company label, voucher type, date, voucher number, party, line
 * index and item name. Detecting a repeat is therefore a reliable overlap
 * signal rather than a heuristic.
 */
export interface DuplicateReport {
  /** Rows whose rowKey was seen more than once, by dataset. */
  byDataset: Record<string, number>;
  total: number;
  /** A few concrete examples, for diagnosing which files overlap. */
  samples: { dataset: string; rowKey: string; occurrences: number }[];
}

type Keyed = { rowKey?: string };

export function detectDuplicateRows(
  datasets: Record<string, Keyed[]>,
  validationEngine: ValidationEngine
): DuplicateReport {
  const byDataset: Record<string, number> = {};
  const samples: DuplicateReport['samples'] = [];
  let total = 0;

  for (const [dataset, rows] of Object.entries(datasets)) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.rowKey) continue;
      counts.set(row.rowKey, (counts.get(row.rowKey) ?? 0) + 1);
    }

    let datasetDupes = 0;
    for (const [rowKey, occurrences] of counts) {
      if (occurrences <= 1) continue;
      // Count the extra copies, not the original.
      datasetDupes += occurrences - 1;
      if (samples.length < 5) samples.push({ dataset, rowKey, occurrences });
    }

    if (datasetDupes > 0) {
      byDataset[dataset] = datasetDupes;
      total += datasetDupes;
      validationEngine.logIssue(
        `Tally ${dataset}`,
        undefined,
        'Critical',
        'POSSIBLE_DUPLICATE_ROW',
        `${datasetDupes} duplicate row(s) detected — the same voucher line appears in more than one Tally company file, so its value is counted twice. Check whether the configured companies overlap in date range.`
      );
    }
  }

  return { byDataset, total, samples };
}
