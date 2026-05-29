import requests
import json
import os
import zipfile
import time
import xlrd
from datetime import datetime, timedelta
from pathlib import Path
from arelle import ModelManager, FileSource
from arelle.CntlrCmdLine import CntlrCmdLine

BASE_URL = "https://disclosure.edinet-fsa.go.jp/api/v2/documents.json"
DOC_BASE_URL = "https://disclosure.edinet-fsa.go.jp/api/v2/documents"

API_KEY = os.environ.get("EDINET_API_KEY")

# 候補タグ辞書
# 候補タグ辞書
def fetch_industry_map():
    """東証CSVから証券コード→業種マッピングを取得"""
    url = "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls"
    xls_path = Path("/tmp/jpx_data.xls")
    try:
        r = requests.get(url, timeout=30)
        with open(xls_path, "wb") as f:
            f.write(r.content)
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
        print(f"業種マッピング完了：{len(industry_map)}社")
        return industry_map
    except Exception as e:
        print(f"⚠️ 業種マッピング取得失敗: {e}")
        return {}
TAG_CANDIDATES = {
    "sales": {
        "tags": [
            "NetSales",
            "SalesRevenuesIFRS",
            "RevenueIFRS",
            "OperatingRevenues",
            "SalesAndFinancialServicesRevenueIFRS",
            "OperatingRevenuesIFRS",
            "NetSalesSummaryOfBusinessResults",
        ],
        "contexts": [
            "CurrentYearDuration",
            "CurrentFiscalYearDuration",
            "CurrentYearConsolidatedDuration",
            "CurrentYearDuration_NonConsolidatedMember",
        ]
    },
    "operating_profit": {
        "tags": [
            "OperatingIncome",
            "OperatingProfitLoss",
            "OperatingProfitLossIFRS",
            "OrdinaryIncomeLossSummaryOfBusinessResults",
        ],
        "contexts": [
            "CurrentYearDuration",
            "CurrentFiscalYearDuration",
            "CurrentYearConsolidatedDuration",
            "CurrentYearDuration_NonConsolidatedMember",
        ]
    },
    "net_income": {
        "tags": [
            "ProfitLoss",
            "NetIncome",
            "ProfitLossIFRS",
            "ProfitLossAttributableToOwnersOfParentIFRS",
            "ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults",
        ],
        "contexts": [
            "CurrentYearDuration",
            "CurrentFiscalYearDuration",
            "CurrentYearConsolidatedDuration",
            "CurrentYearDuration_NonConsolidatedMember",
        ]
    },
    "total_assets": {
        "tags": [
            "Assets",
            "AssetsIFRS",
            "TotalAssets",
            "TotalAssetsSummaryOfBusinessResults",
        ],
        "contexts": [
            "CurrentYearInstant",
            "CurrentFiscalYearInstant",
            "CurrentYearInstant_NonConsolidatedMember",
        ]
    },
    "equity": {
        "tags": [
            "NetAssets",
            "Equity",
            "EquityIFRS",
            "EquityAttributableToOwnersOfParentIFRS",
            "NetAssetsSummaryOfBusinessResults",
        ],
        "contexts": [
            "CurrentYearInstant",
            "CurrentFiscalYearInstant",
            "CurrentYearInstant_NonConsolidatedMember",
        ]
    },
    "operating_cf": {
        "tags": [
            "NetCashProvidedByUsedInOperatingActivities",
            "CashFlowsFromOperatingActivities",
            "NetCashProvidedByUsedInOperatingActivitiesIFRS",
            "NetCashProvidedByUsedInOperatingActivitiesSummaryOfBusinessResults",
        ],
        "contexts": [
            "CurrentYearDuration",
            "CurrentFiscalYearDuration",
            "CurrentYearConsolidatedDuration",
            "CurrentYearDuration_NonConsolidatedMember",
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
            "CurrentYearInstant_NonConsolidatedMember",
        ]
        
    },
    "investing_cf": {
        "tags": [
            "NetCashProvidedByUsedInInvestingActivitiesSummaryOfBusinessResults",
            "NetCashProvidedByUsedInInvestingActivities",
            "CashFlowsFromInvestingActivities",
            "NetCashProvidedByUsedInInvestingActivitiesIFRS",
        ],
        "contexts": [
            "CurrentYearDuration",
            "CurrentFiscalYearDuration",
            "CurrentYearConsolidatedDuration",
            "CurrentYearDuration_NonConsolidatedMember",
        ]
    },
    "dividend_per_share": {
        "tags": [
            "DividendPaidPerShareSummaryOfBusinessResults",
            "DividendsPerShareIFRS",
            "DividendPerShare",
            "AnnualDividendPerShare",
        ],
        "contexts": [
            "CurrentYearDuration",
            "CurrentFiscalYearDuration",
            "CurrentYearInstant",
            "CurrentYearConsolidatedDuration",
            "CurrentYearDuration_NonConsolidatedMember",
        ]
    },
}


def fetch_all_filings(days=30):
    """過去N日分の有価証券報告書を収集"""
    print(f"=== 過去{days}日分の提出書類を収集 ===\n")

    filings = {}
    today = datetime.today()

    for i in range(days):
        target_date = (today - timedelta(days=i)).strftime("%Y-%m-%d")

        params = {
            "date": target_date,
            "type": 2,
            "Subscription-Key": API_KEY
        }

        try:
            response = requests.get(BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            print(f"  ⚠️ {target_date} 取得失敗: {e}")
            continue

        count = 0
        for doc in data.get("results", []):
            if (
                doc.get("ordinanceCode") == "010"
                and doc.get("formCode") == "030000"
                and doc.get("xbrlFlag") == "1"
            ):
                edinet_code = doc.get("edinetCode")
                sec_code = doc.get("secCode", "")

                # 証券コードがある会社のみ（上場企業）
                if not sec_code:
                    continue

                # 証券コードを4桁に（末尾の0を除去）
                code = sec_code[:4]

                # 同じ会社の古い書類は上書きしない
                if edinet_code not in filings:
                    submit_datetime = doc.get("submitDateTime", "")
                    submit_date = submit_datetime[:10] if submit_datetime else None

                    filings[edinet_code] = {
                        "code": code,
                        "name": doc.get("filerName", ""),
                        "edinet_code": edinet_code,
                        "doc_id": doc.get("docID"),
                        "submit_date": submit_date,
                        "period_end": doc.get("periodEnd"),
                        "industry_code": doc.get("industryCode", ""),
                        "industry_name": doc.get("industryCodeDescription", ""),
                    }
                    count += 1

        if count > 0:
            print(f"  {target_date}: {count}社発見")

        time.sleep(0.3)  # API負荷軽減

    print(f"\n合計: {len(filings)}社\n")
    return filings


def download_xbrl(doc_id):
    """XBRL ZIPをダウンロード"""
    zip_path = Path(f"/tmp/edinet_{doc_id}.zip")

    # キャッシュがあれば再利用
    if zip_path.exists():
        return zip_path

    params = {"type": 1, "Subscription-Key": API_KEY}
    url = f"{DOC_BASE_URL}/{doc_id}"

    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        with open(zip_path, "wb") as f:
            f.write(response.content)
    except Exception as e:
        print(f"    ⚠️ ダウンロード失敗: {e}")
        return None

    return zip_path


def extract_xbrl_from_zip(zip_path, doc_id):
    """ZIPからXBRLファイルを取り出す"""
    extract_dir = Path(f"/tmp/edinet_{doc_id}")
    extract_dir.mkdir(exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(extract_dir)

    for xbrl_file in extract_dir.rglob("*.xbrl"):
        if "PublicDoc" in str(xbrl_file):
            return xbrl_file

    return None


def extract_financials_arelle(xbrl_path):
    """Arelleで財務データ抽出"""
    try:
        cntlr = CntlrCmdLine()
        cntlr.startLogging(logFileName="logToBuffer")
        model_manager = ModelManager.initialize(cntlr)
        model_xbrl = model_manager.load(
            FileSource.FileSource(str(xbrl_path))
        )
    except Exception as e:
        print(f"    ⚠️ Arelle読み込み失敗: {e}")
        return {}

    if model_xbrl is None:
        return {}

    fact_map = {}
    for fact in model_xbrl.facts:
        if fact.value is None:
            continue
        tag_name = fact.qname.localName
        context_ref = fact.contextID
        try:
            float_val = float(fact.value)
            value = float_val if '.' in str(fact.value) else int(float_val)
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
                    financials[field_name] = fact_map[key]
                    found = True
                    break
            if found:
                break

    return financials


def main():
    # 業種マッピング取得
    industry_map = fetch_industry_map()

    # 過去30日分の有価証券報告書を収集
    filings = fetch_all_filings(days=30)

    if not filings:
        print("書類が見つかりませんでした")
        return

    print(f"=== 財務データ取得開始（{len(filings)}社）===\n")

    results = []
    success = 0
    fail = 0

    for i, (edinet_code, filing) in enumerate(filings.items(), 1):
        name = filing["name"]
        doc_id = filing["doc_id"]

        print(f"[{i}/{len(filings)}] {name}（{filing['code']}）")

        zip_path = download_xbrl(doc_id)
        if not zip_path:
            fail += 1
            continue

        xbrl_path = extract_xbrl_from_zip(zip_path, doc_id)
        if not xbrl_path:
            print(f"    ⚠️ XBRLなし")
            fail += 1
            continue

        financials = extract_financials_arelle(xbrl_path)

        if not financials:
            print(f"    ⚠️ 財務データなし")
            fail += 1
            continue

        industry = industry_map.get(filing["code"], {})
        results.append({
            "code": filing["code"],
            "name": name,
            "edinet_code": edinet_code,
            "doc_id": doc_id,
            "industry_code": industry.get("industry_code", ""),
            "industry_name": industry.get("industry_name", ""),
            "latest_filing": {
                "submit_date": filing["submit_date"],
                "period_end": filing["period_end"],
            },
            "financials": financials
        })

        success += 1
        print(f"    ✅ 取得成功（{len(financials)}指標）")

        time.sleep(0.5)  # API負荷軽減

    # JSON保存
    output = {
        "updated_at": datetime.today().strftime("%Y-%m-%d %H:%M:%S"),
        "companies": results
    }

    output_path = Path("data/fundamentals.json")
    output_path.parent.mkdir(exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n=== 完了：{success}社成功 / {fail}社失敗 ===")
    print(f"保存先: {output_path}")


if __name__ == "__main__":
    main()