import xlrd
import json
import requests
from pathlib import Path

# 東証CSVをダウンロード
url = "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls"
xls_path = Path("/tmp/jpx_data.xls")

print("東証データをダウンロード中...")
r = requests.get(url, timeout=30)
with open(xls_path, "wb") as f:
    f.write(r.content)

# 証券コード→業種マッピングを作成
wb = xlrd.open_workbook(str(xls_path))
ws = wb.sheet_by_index(0)

industry_map = {}
for i in range(1, ws.nrows):
    row = ws.row_values(i)
    code = str(int(row[1])).zfill(4) if isinstance(row[1], float) else str(row[1])
    industry_code = str(int(row[4])) if isinstance(row[4], float) else str(row[4])
    industry_name = row[5] if row[5] != '-' else ''
    if industry_name:
        industry_map[code] = {
            "industry_code": industry_code,
            "industry_name": industry_name
        }

print(f"マッピング完了：{len(industry_map)}社")

# fundamentals.jsonに業種を追加
data_path = Path("data/fundamentals.json")
with open(data_path, encoding="utf-8") as f:
    data = json.load(f)

hit = 0
for company in data["companies"]:
    code = company["code"]
    if code in industry_map:
        company["industry_code"] = industry_map[code]["industry_code"]
        company["industry_name"] = industry_map[code]["industry_name"]
        hit += 1
    else:
        company.setdefault("industry_code", "")
        company.setdefault("industry_name", "")

with open(data_path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"業種追加完了：{hit}/{len(data['companies'])}社にマッチ")