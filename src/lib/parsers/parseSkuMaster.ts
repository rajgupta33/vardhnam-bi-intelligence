import Papa from 'papaparse';
import { SkuMasterRecord } from '@/types';
import { ValidationEngine } from '../validation/engine';

export async function parseSkuMaster(
  fileText: string,
  validationEngine: ValidationEngine
): Promise<SkuMasterRecord[]> {
  const parsed = Papa.parse<any>(fileText, {
    header: true,
    skipEmptyLines: true,
  });

  const records: SkuMasterRecord[] = [];

  parsed.data.forEach((row, index) => {
    const rowNum = index + 2;
    if (!row.SKU_ID) {
      validationEngine.logIssue('SKU Master', rowNum, 'Warning', 'MISSING_REQUIRED_COLUMN', 'SKU_ID missing');
      return;
    }

    records.push({
      skuId: String(row.SKU_ID).trim(),
      uniqueSkuName: String(row.Unique_SKU_Name || '').trim(),
      crop: String(row.Crop || '').trim(),
      variety: String(row.Variety || '').trim(),
      packSize: String(row.Pack_Size || '').trim(),
      category: String(row.Category || '').trim(),
      skuStatus: String(row.SKU_Status || '').trim(),
      mappingConfidence: String(row.Mapping_Confidence || '').trim(),
      reviewFlag: String(row.Review_Flag || '').trim(),
      reviewReason: row.Review_Reason || null,
    });
  });

  return records;
}
