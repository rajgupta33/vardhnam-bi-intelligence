import pandas as pd
import json

try:
    df = pd.read_excel("Godown_Stock_Excel.xlsx", sheet_name="Godown_Stock", nrows=20, header=None)
    for i in range(20):
        print(f"Row {i}: {df.iloc[i].to_dict()}")
except Exception as e:
    print(e)
