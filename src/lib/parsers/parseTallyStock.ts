import { ProcessedStockRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';
import { parseTallyXml, ensureArray, parseTallyQuantity, parseTallyRate, tallyNumber } from '../tally/xml';

/**
 * The custom Report/Form/Part/Line TDL used for stock export emits flat parallel
 * arrays (FLDNAME[], FLDCLOSINGQTY[], ...) under <ENVELOPE> rather than nested
 * per-item objects, so rows are reconstructed by zipping the arrays by index.
 */
export function parseTallyStock(
  xml: string,
  validationEngine: ValidationEngine,
  company = 'default',
  financialYear: string | null = null
): ProcessedStockRecord[] {
  const obj = parseTallyXml(xml);
  const envelope = obj?.ENVELOPE;

  if (!envelope || envelope.FLDNAME === undefined) {
    validationEngine.logIssue(
      `Tally Stock (${company})`,
      undefined,
      'Critical',
      'MISSING_REQUIRED_COLUMN',
      'Tally stock export returned no data.'
    );
    return [];
  }

  const names = ensureArray(envelope.FLDNAME);
  const qtys = ensureArray(envelope.FLDCLOSINGQTY);
  const rates = ensureArray(envelope.FLDCLOSINGRATE);
  const values = ensureArray(envelope.FLDCLOSINGVALUE);

  if (qtys.length !== names.length || values.length !== names.length) {
    validationEngine.logIssue(
      'Tally Stock',
      undefined,
      'Critical',
      'MISSING_REQUIRED_COLUMN',
      `Stock export columns are ragged (names=${names.length}, qty=${qtys.length}, value=${values.length}); rows may be misaligned.`
    );
  }

  const records: ProcessedStockRecord[] = [];
  const snapshotDate = new Date();

  names.forEach((rawName, i) => {
    const originalItemName = String(rawName ?? '').trim();
    if (!originalItemName) return;

    const rowNum = i + 1;
    const { quantity, unit } = parseTallyQuantity(qtys[i]);
    const closingRate = parseTallyRate(rates[i]);
    const closingValue = tallyNumber(values[i]);

    records.push({
      id: crypto.randomUUID(),
      // Year is part of the key: the same item appears in each year's company
      // file as a different closing balance, and those are distinct records.
      rowKey: `${company}|${financialYear ?? 'noyear'}|stock|${originalItemName}`,
      financialYear,
      source: 'tally',
      company,
      sourceRowNumber: rowNum,
      validationStatus: 'VALID',
      snapshotDate,
      godown: 'Main Location',
      originalItemName,
      normalisedItemName: '',
      skuId: null,
      closingQuantity: quantity,
      unit,
      closingQuantityKg: unit === 'KGS' ? quantity : 0,
      originalClosingQuantity: quantity,
      originalUnit: unit,
      closingRate,
      closingValue,
    });
  });

  return records;
}
