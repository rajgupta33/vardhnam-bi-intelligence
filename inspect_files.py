import pandas as pd
import os

files_to_inspect = [
    "DayBook_1_converted.xlsx",
    "Purcase_UP_1_converted.xlsx",
    "purchase_2_converted.xlsx",
    "Credit_Note.xlsx",
    "Godown_Stock_Excel.xlsx",
    "SKU_Master_Proper.xlsx",
    "Voucher_Header.csv",
    "SKU_Master.csv",
    "SKU_Mapping.csv",
    "Sales_Return_Items.csv"
]

report = ""

for f in files_to_inspect:
    if not os.path.exists(f):
        report += f"FILE MISSING: {f}\n\n"
        continue
        
    report += f"=== FILE: {f} ===\n"
    try:
        if f.endswith('.xlsx'):
            xls = pd.ExcelFile(f)
            report += f"Sheets: {xls.sheet_names}\n"
            for sheet in xls.sheet_names:
                df = pd.read_excel(xls, sheet_name=sheet, nrows=5)
                report += f"  Sheet: {sheet}\n"
                report += f"  Columns: {list(df.columns)}\n"
                for i in range(min(2, len(df))):
                    report += f"  Row {i}: {df.iloc[i].to_dict()}\n"
        else:
            df = pd.read_csv(f, nrows=5)
            report += f"Columns: {list(df.columns)}\n"
            for i in range(min(2, len(df))):
                report += f"Row {i}: {df.iloc[i].to_dict()}\n"
    except Exception as e:
        report += f"ERROR reading {f}: {e}\n"
    report += "\n"

with open("source_schema.txt", "w", encoding="utf-8") as out:
    out.write(report)
