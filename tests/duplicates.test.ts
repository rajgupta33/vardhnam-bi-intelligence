import test from 'node:test';
import assert from 'node:assert';
import { detectDuplicateRows } from '../src/lib/validation/duplicates';
import { ValidationEngine } from '../src/lib/validation/engine';
import { financialYearOf } from '../src/lib/tally/financialYear';

test('detectDuplicateRows finds a voucher present in two company files', () => {
  const engine = new ValidationEngine();
  // The same line extracted from two overlapping Tally company files produces
  // an identical composite rowKey — that is the overlap signal.
  const shared = 'U.P|Sales|2024-04-01|VAS/24/25/01|Some Party|1|Maize';
  const report = detectDuplicateRows(
    {
      sales: [{ rowKey: shared }, { rowKey: shared }, { rowKey: 'U.P|Sales|2024-04-02|V2|P|1|Paddy' }],
    },
    engine
  );

  assert.strictEqual(report.total, 1, 'counts extra copies, not the original');
  assert.strictEqual(report.byDataset.sales, 1);
  assert.strictEqual(report.samples[0].occurrences, 2);
  assert.strictEqual(engine.getIssues().filter((i) => i.severity === 'Critical').length, 1);
});

test('detectDuplicateRows stays silent on clean data', () => {
  const engine = new ValidationEngine();
  const report = detectDuplicateRows(
    {
      sales: [{ rowKey: 'U.P|Sales|2024-04-01|V1|P|1|Maize' }, { rowKey: 'U.P|Sales|2024-04-02|V2|P|1|Paddy' }],
      purchase: [{ rowKey: 'U.P|Purchase|2024-04-01|P1|S|1|Seed' }],
    },
    engine
  );

  assert.strictEqual(report.total, 0);
  assert.deepStrictEqual(report.byDataset, {});
  assert.strictEqual(engine.getIssues().length, 0);
});

test('financialYearOf splits on the April boundary', () => {
  // 31-Mar belongs to the year that started the previous April.
  assert.strictEqual(financialYearOf(new Date(Date.UTC(2025, 2, 31))), 'FY2024-25');
  // 1-Apr starts the new financial year.
  assert.strictEqual(financialYearOf(new Date(Date.UTC(2025, 3, 1))), 'FY2025-26');
  assert.strictEqual(financialYearOf(new Date(Date.UTC(2023, 3, 1))), 'FY2023-24');
  assert.strictEqual(financialYearOf(new Date(Date.UTC(2024, 0, 15))), 'FY2023-24');
  assert.strictEqual(financialYearOf(null), null);
});
