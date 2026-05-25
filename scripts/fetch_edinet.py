import requests
import json
import os
import zipfile
import re
from datetime import datetime, timedelta
from pathlib import Path

BASE_URL = "https://disclosure.edinet-fsa.go.jp/api/v2/documents.json"
DOC_BASE_URL = "https://disclosure.edinet-fsa.go.jp/api/v2/documents"

API_KEY = os.environ.get("EDINET_API_KEY")

# 会社ごとの設定
# タグは会社によって異なるためここで個別定義
TARGET_COMPANIES = [
    {
        "code": "7203",
        "name": "トヨタ自動車",
        "edinet_code": "E02144",
        "tags": {
            "sales":            ("SalesRevenuesIFRS",                               "CurrentYearDuration"),
            "operating_profit": ("OperatingProfitLossIFRS",                        "CurrentYearDuration"),
            "net_income":       ("jpigp_cor:ProfitLossIFRS",                       "CurrentYearDuration"),
            "total_assets":     ("LiabilitiesAndEquityIFRS",                       "CurrentYearInstant"),
            "equity":           ("jpigp_cor:EquityIFRS",                           "CurrentYearInstant"),
            "operating_cf":     ("NetCashProvidedByUsedInOperatingActivitiesIFRS", "CurrentYearDuration"),
            "shares_issued":    ("NumberOfSharesIssuedSharesVotingRights",         "CurrentYearInstant"),
        }
    },
    {
        "code": "6758",
        "name": "ソニーグループ",
        "edinet_code": "E01777",
        "tags": {
            "sales":            ("SalesAndFinancialServicesRevenueIFRS",            "CurrentYearDuration"),
            "operating_profit": ("OperatingProfitLossIFRS",                        "CurrentYearDuration"),
            "net_income":       ("jpigp_cor:ProfitLossIFRS",                       "CurrentYearDuration"),
            "total_assets":     ("LiabilitiesAndEquityIFRS",                       "CurrentYearInstant"),
            "equity":           ("jpigp_cor:EquityIFRS",                           "CurrentYearInstant"),
            "operating_cf":     ("NetCashProvidedByUsedInOperatingActivitiesIFRS", "CurrentYearDuration"),
            "shares_issued":    ("NumberOfSharesIssuedSharesVotingRights",         "CurrentYearInstant"),
        }
    },
]


def fetch_doc_id(edinet_code):
    """最新の有価証券報告書のdocIDを取得"""

    today = datetime.today()

    for i in range(365):
        target_date = (
            today - timedelta(days=i)
        ).strftime("%Y-%m-%d")

        params = {
            "date": target_date,
            "type": 2,
            "Subscription-Key": API_KEY
        }

        response = requests.get(BASE_URL, params=params)
        response.raise_for_status()
        data = response.json()

        for doc in data.get("results", []):
            if (
                doc.get("edinetCode") == edinet_code
                and doc.get("ordinanceCode") == "010"
                and doc.get("formCode") == "030000"
            ):
                doc_id = doc.get("docID")
                print(f"  ✅ docID発見: {doc_id}（{target_date}）")
                return doc_id

    return None


def download_xbrl(doc_id, company_name):
    """XBRL ZIPをダウンロード"""

    params = {
        "type": 1,
        "Subscription-Key": API_KEY
    }

    url = f"{DOC_BASE_URL}/{doc_id}"
    response = requests.get(url, params=params)
    response.raise_for_status()

    zip_path = Path(f"/tmp/edinet_{doc_id}.zip")
    with open(zip_path, "wb") as f:
        f.write(response.content)

    print(f"  ✅ ZIPダウンロード完了（{len(response.content)}bytes）")
    return zip_path


def extract_financials(zip_path, tags):
    """XBRLから財務データを抽出"""

    with zipfile.ZipFile(zip_path, "r") as z:
        xbrl_file = None
        for name in z.namelist():
            if name.endswith(".xbrl") and "PublicDoc" in name:
                xbrl_file = name
                break

        if not xbrl_file:
            print("  ❌ .xbrlファイルが見つかりません")
            return None

        content = z.read(xbrl_file).decode("utf-8")

    lines = content.split("\n")
    financials = {}

    for key, (tag, context) in tags.items():
        for line in lines:
            if (
                tag in line
                and f'contextRef="{context}"' in line
                and "Member" not in line
                and "Segment" not in line
            ):
                match = re.search(r">(\d+)<", line)
                if match:
                    value = int(match.group(1))
                    financials[key] = value
                    print(f"  ✅ {key}: {value:,}")
                    break
        else:
            print(f"  ⚠️  {key}: 見つかりません")

    return financials


def main():

    print("=== EDINET財務データ取得開始 ===\n")

    results = []

    for company in TARGET_COMPANIES:
        name = company["name"]
        edinet_code = company["edinet_code"]

        print(f"--- {name} ---")

        # docID取得
        doc_id = fetch_doc_id(edinet_code)
        if not doc_id:
            print(f"  ❌ docIDが見つかりません")
            continue

        # XBRLダウンロード
        zip_path = download_xbrl(doc_id, name)

        # 財務データ抽出
        financials = extract_financials(zip_path, company["tags"])
        if not financials:
            continue

        results.append({
            "code": company["code"],
            "name": name,
            "edinet_code": edinet_code,
            "doc_id": doc_id,
            "financials": financials
        })

        print()

    # JSON保存
    output = {
        "updated_at": datetime.today().strftime("%Y-%m-%d %H:%M:%S"),
        "companies": results
    }

    output_path = Path("../data/fundamentals.json")
    output_path.parent.mkdir(exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"=== 完了：{len(results)}社取得 ===")
    print(f"保存先: {output_path}")


if __name__ == "__main__":
    main()