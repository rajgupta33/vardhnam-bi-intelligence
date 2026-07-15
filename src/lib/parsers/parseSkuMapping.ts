import Papa from 'papaparse';
import { SkuMappingRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';
import { normalizeItemName } from '../sku/normalisation';

export async function parseSkuMapping(
  fileText: string,
  validationEngine: ValidationEngine
): Promise<SkuMappingRecord[]> {
  const parsed = Papa.parse<any>(fileText, {
    header: true,
    skipEmptyLines: true,
  });

  const records: SkuMappingRecord[] = [];

  parsed.data.forEach((row, index) => {
    const rowNum = index + 2;
    if (!row.Original_Item_Name || !row.SKU_ID) {
      validationEngine.logIssue('SKU Mapping', rowNum, 'Warning', 'MISSING_REQUIRED_COLUMN', 'Original_Item_Name or SKU_ID missing');
      return;
    }

    records.push({
      originalItemName: String(row.Original_Item_Name).trim(),
      normalisedItemName: normalizeItemName(row.Original_Item_Name),
      sourceType: String(row.Source_Type || '').trim(),
      sourceFile: String(row.Source_File || '').trim(),
      skuId: String(row.SKU_ID).trim(),
      uniqueSkuName: String(row.Unique_SKU_Name || '').trim(),
      mappingConfidence: String(row.Mapping_Confidence || '').trim(),
      reviewFlag: String(row.Review_Flag || '').trim(),
      mappingReason: row.Mapping_Reason || null,
    });
  });

  return records;
}
