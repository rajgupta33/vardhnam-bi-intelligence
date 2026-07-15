# Source Data Schema

## 1. Sales Register (DayBook_1_converted.xlsx)
**Format:** Excel Workbook
**Sheets:** Verification, Voucher_Header, Item_Lines, Raw_Extracted_Lines
**Target Sheet:** `Item_Lines`
**Headers:** `voucher_id`, `page`, `date`, `party`, `vch_type`, `vch_no`, `ledger`, `item_name`, `quantity`, `unit`, `rate`, `rate_unit`, `item_amount`, `raw_item_line`
**Data Types:** 
- `date`: Timestamp
- `quantity`: Numeric (e.g. 12, 320)
- `unit`: String (e.g., 'KGS')
- `item_amount`: Numeric
**Join Keys:** `voucher_id` links to `Voucher_Header` sheet.

## 2. Purchase UP (Purcase_UP_1_converted.xlsx)
**Format:** Excel Workbook
**Sheets:** Verification, Voucher_Header, Item_Lines, Raw_Extracted_Lines
**Target Sheet:** `Item_Lines`
**Headers:** `voucher_id`, `page`, `date`, `party`, `vch_type`, `vch_no`, `ledger`, `item_name`, `quantity`, `unit`, `rate`, `rate_unit`, `item_amount`, `raw_item_line`
**Data Types:**
- `date`: Timestamp
- `quantity`: Numeric
- `unit`: String (e.g., 'KGS')
- `item_amount`: Numeric

## 3. Purchase Source 2 (purchase_2_converted.xlsx)
**Format:** Excel Workbook
**Sheets:** Verification, Voucher_Header, Item_Lines, Raw_Extracted_Lines
**Target Sheet:** `Item_Lines`
**Headers:** `voucher_id`, `page`, `date`, `party`, `vch_type`, `vch_no`, `ledger`, `item_name`, `quantity`, `unit`, `rate`, `rate_unit`, `item_amount`, `raw_item_line`
**Data Types:** Same as Purchase UP.

## 4. Credit Note (Credit_Note.xlsx)
**Format:** Excel Workbook
**Target Sheet:** `Credit_Note`
**Headers:** `voucher_id`, `page`, `date`, `party`, `vch_no`, `ledger`, `item_name`, `quantity`, `unit`, `rate`, `rate_unit`, `item_amount`, `raw_item_line`, `SKU_ID`, `Unique_SKU_Name`, `Mapping_Confidence`, `Review_Flag`
**Notes:** `quantity`, `unit`, `rate` may be NaN. Used primarily for validation.

## 5. Godown Stock (Godown_Stock_Excel.xlsx)
**Format:** Excel Workbook (Tally Export)
**Target Sheet:** `Godown_Stock`
**Structure:**
- Row 13-14: Headers
- Column 0: Particulars (Item Name)
- Column 1-3: Opening Balance (Quantity, Rate, Value)
- Column 4-6: Inwards (Quantity, Rate, Value)
- Column 7-9: Outwards (Quantity, Rate, Value)
- Column 10-12: Closing Balance (Quantity, Rate, Value)
- Data begins at Row 15

## 6. SKU Master Proper (SKU_Master_Proper.xlsx) / SKU Master (SKU_Master.csv)
**Format:** Excel / CSV
**Headers:** `SKU_ID`, `Unique_SKU_Name`, `Crop`, `Variety`, `Pack_Size`, `Category`, `SKU_Status`, `Mapping_Confidence`, `Review_Flag`, `Review_Reason`

## 7. SKU Mapping (SKU_Mapping.csv)
**Format:** CSV
**Headers:** `Original_Item_Name`, `Normalised_Item_Name`, `Source_Type`, `Source_File`, `SKU_ID`, `Unique_SKU_Name`, `Mapping_Confidence`, `Review_Flag`, `Mapping_Reason`

## 8. Sales Return Items (Sales_Return_Items.csv)
**Format:** CSV
**Headers:** `voucher_id`, `page`, `date`, `party`, `vch_no`, `ledger`, `item_name`, `quantity`, `unit`, `rate`, `rate_unit`, `item_amount`, `raw_item_line`, `SKU_ID`, `Unique_SKU_Name`, `Mapping_Confidence`, `Review_Flag`
**Notes:** Preferred source for item-level return quantities.

## 9. Voucher Header (Voucher_Header.csv)
**Format:** CSV
**Headers:** `voucher_id`, `page`, `date`, `date_original`, `party`, `vch_type`, `vch_no`, `primary_ledger`, `credit_amount`, `agst_refs`, `narration`
