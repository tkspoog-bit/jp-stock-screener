import requests
import json
import os
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from arelle import ModelManager, FileSource
from arelle.CntlrCmdLine import CntlrCmdLine

BASE_URL = "https://disclosure.edinet-fsa.go.jp/api/v2/documents.json"
DOC_BASE_URL = "https://disclosure.edinet-fsa.go.jp/api/v2/documents"

API_KEY = os.environ.get("EDINET_API_KEY")

# 候補タグ辞書（Arelle版・タグ名ベース）
TAG_CANDIDATES = {
    "sales": {
        "tags": [
            "NetSales",
            "SalesRevenuesIFRS",
            "RevenueIFRS",
            "OperatingRevenues",
            "SalesAndFinancialServicesRevenueIFRS",
            "OperatingRevenuesIFRS",
        ],
        "contexts": [
            "CurrentYearDuration",
            "CurrentFiscalYearDuration",
            "CurrentYearConsolidatedDuration",
        ]
    },
    "operating_profit": {
        "tags": [
            "OperatingIncome",
            "OperatingProfitLoss",
            "OperatingProfitLossIFRS",
        ],
        "contexts": [
            "CurrentYearDuration",
            "CurrentFiscalYearDuration",
            "CurrentYearConsolidatedDuration",
        ]
    },
    "net_income": {
        "tags": [
            "ProfitLoss",
            "NetIncome",
            "ProfitLossIFRS",
            "ProfitLossAttributableToOwnersOfParentIFRS",
        ],
        "contexts": [
            "CurrentYearDuration",
            "CurrentFiscalYearDuration",
            "CurrentYearConsolidatedDuration",
        ]
    },
    "total_assets": {
        "tags": [
            "Assets",
            "AssetsIFRS",
            "TotalAssets",
        ],
        "contexts": [
            "CurrentYearInstant",
            "CurrentFiscalYearInstant",
        ]
    },
    "equity": {
        "tags": [
            "NetAssets",
            "Equity",
            "EquityIFRS",
            "EquityAttributableToOwnersOfParentIFRS",
        ],
        "contexts": [
            "CurrentYearInstant",
            "CurrentFiscalYearInstant",
        ]
    },
    "operating_cf": {
        "tags": [
            "NetCashProvidedByUsedInOperatingActivities",
            "CashFlowsFromOperatingActivities",
            "NetCashProvidedByUsedInOperatingActivitiesIFRS",
        ],
        "contexts": [
            "CurrentYearDuration",
            "CurrentFiscalYearDuration",
            "CurrentYearConsolidatedDuration",
        ]
    },
    "shares_issued": {
        "tags": [
            "NumberOfSharesIssuedSharesVotingRights",
            "NumberOfIssuedAndOutstandingSharesAtTheEndOfFiscalYearIncludingTreasuryStock",
            "TotalNumberOfIssuedSharesSummaryOfBusinessResults",
        ],
        "contexts": [
            "CurrentYearInstant",
            "CurrentFiscalYearInstant",
        ]
    },
}


TARGET_COMPANIES = [
    {"code": "7203", "name": "トヨタ自動車",    "edinet_code": "E02144"},
    {"code": "6758", "name": "ソニーグループ",   "edinet_code": "E01777"},
    {"code": "4063", "name": "信越化学工業",     "edinet_code": "E00776"},
    {"code": "9432", "name": "NTT",             "edinet_code": "E04430"},
]



def fetch_doc_id(edinet_code):
    today = datetime.today()

    for i in range(365):
        target_date = (today - timedelta(days=i)).strftime("%Y-%m-%d")

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
                submit_datetime = doc.get("submitDateTime", "")
                submit_date = submit_datetime[:10] if submit_datetime else None
                period_end = doc.get("periodEnd")

                print(f"  ✅ docID発見: {doc_id}（{submit_date} / {period_end}）")

                return {
                    "doc_id": doc_id,
                    "submit_date": submit_date,
                    "period_end": period_end
                }

    return None


def download_xbrl(doc_id):
    params = {"type": 1, "Subscription-Key": API_KEY}
    url = f"{DOC_BASE_URL}/{doc_id}"
    response = requests.get(url, params=params)
    response.raise_for_status()

    zip_path = Path(f"/tmp/edinet_{doc_id}.zip")
    with open(zip_path, "wb") as f:
        f.write(response.content)

    print(f"  ✅ ZIPダウンロード完了（{len(response.content)}bytes）")
    return zip_path


def extract_xbrl_from_zip(zip_path, doc_id):
    """ZIPからXBRLファイルを取り出す"""
    extract_dir = Path(f"/tmp/edinet_{doc_id}")
    extract_dir.mkdir(exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(extract_dir)

    # XBRL/PublicDoc内の.xbrlファイルを探す
    for xbrl_file in extract_dir.rglob("*.xbrl"):
        if "PublicDoc" in str(xbrl_file):
            return xbrl_file

    return None


def extract_financials_arelle(xbrl_path):
    """Arelleを使って財務データを抽出"""
    print(f"  🔍 Arelle解析中...")

    cntlr = CntlrCmdLine()
    cntlr.startLogging(logFileName="logToBuffer")
    model_manager = ModelManager.initialize(cntlr)
    model_xbrl = model_manager.load(
        FileSource.FileSource(str(xbrl_path))
    )

    if model_xbrl is None:
        print("  ❌ Arelle読み込み失敗")
        return {}

    # factを辞書化（タグ名 + context → 値）
    fact_map = {}
    for fact in model_xbrl.facts:
        if fact.value is None:
            continue
        tag_name = fact.qname.localName
        context_ref = fact.contextID
        try:
            value = int(float(fact.value))
            fact_map[(tag_name, context_ref)] = value
        except:
            continue

    financials = {}

    for field_name, config in TAG_CANDIDATES.items():
        tags = config["tags"]
        contexts = config["contexts"]
        found = False

        for tag in tags:
            for ctx in contexts:
                key = (tag, ctx)
                if key in fact_map:
                    value = fact_map[key]
                    financials[field_name] = value
                    print(f"  ✅ {field_name}（{tag} / {ctx}）: {value:,}")
                    found = True
                    break
            if found:
                break

        if not found:
            # 候補タグのログ表示
            related = [
                f"{t}（{c}）"
                for (t, c), v in fact_map.items()
                if any(kw in t.lower() for kw in
                    ["sale", "revenue", "income", "profit",
                     "asset", "equity", "cash", "share"])
            ][:10]
            print(f"  ⚠️  {field_name}: 見つかりません")
            if related:
                print(f"    🔍 関連タグ候補:")
                for r in sorted(set(related))[:10]:
                    print(f"      - {r}")

    return financials


def main():
    print("=== EDINET財務データ取得開始（Arelle版）===\n")

    results = []

    for company in TARGET_COMPANIES:
        name = company["name"]
        edinet_code = company["edinet_code"]

        print(f"--- {name} ---")

        filing = fetch_doc_id(edinet_code)
        if not filing:
            print(f"  ❌ docIDが見つかりません")
            continue

        doc_id = filing["doc_id"]
        zip_path = download_xbrl(doc_id)
        xbrl_path = extract_xbrl_from_zip(zip_path, doc_id)

        if xbrl_path is None:
            print("  ❌ XBRLファイルが見つかりません")
            continue

        financials = extract_financials_arelle(xbrl_path)

        if not financials:
            print("  ❌ 財務データ取得失敗")
            continue

        results.append({
            "code": company["code"],
            "name": name,
            "edinet_code": edinet_code,
            "doc_id": doc_id,
            "latest_filing": {
                "submit_date": filing["submit_date"],
                "period_end": filing["period_end"]
            },
            "financials": financials
        })

        print()

    output = {
        "updated_at": datetime.today().strftime("%Y-%m-%d %H:%M:%S"),
        "companies": results
    }

    output_path = Path("data/fundamentals.json")
    output_path.parent.mkdir(exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"=== 完了：{len(results)}社取得 ===")
    print(f"保存先: {output_path}")


if __name__ == "__main__":
    main()