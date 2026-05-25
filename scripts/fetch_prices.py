import requests
import json
from datetime import datetime, timedelta
from pathlib import Path

# =========================
# 設定
# =========================

BASE_URL = "https://disclosure.edinet-fsa.go.jp/api/v2/documents.json"

# テスト対象（仕様どおりサンプル数社）
TARGET_COMPANIES = {
    "7203": "トヨタ自動車",
    "6758": "ソニーグループ",
    "8306": "三菱UFJFG"
}


def fetch_document_list(target_date):
    """
    EDINET書類一覧取得
    """
    params = {
        "date": target_date,
        "type": 2
    }

    try:
        response = requests.get(BASE_URL, params=params)

        response.raise_for_status()

        return response.json()

    except Exception as e:
        print(f"❌ API取得エラー: {e}")
        return None


def main():
    print("=== EDINET接続確認開始 ===")

    # 土日を避けるため少し前を見る
    today = datetime.today()

    for i in range(7):
        target_date = (
            today - timedelta(days=i)
        ).strftime("%Y-%m-%d")

        print(f"\n確認日: {target_date}")

        data = fetch_document_list(target_date)

        if not data:
            continue

        results = []

        documents = data.get("results", [])

        print(f"書類数: {len(documents)}")

        # 有価証券報告書を探す
        for doc in documents:

            ordinance_code = doc.get("ordinanceCode")
            form_code = doc.get("formCode")
            filer_name = doc.get("filerName", "")

            # 有価証券報告書 / 四半期報告書
            if ordinance_code == "010" and form_code in [
                "030000",  # 有報
                "043000"   # 四半期
            ]:

                for code, name in TARGET_COMPANIES.items():

                    if name in filer_name:

                        result = {
                            "code": code,
                            "name": name,
                            "docID": doc.get("docID"),
                            "edinetCode": doc.get("edinetCode"),
                            "submitDateTime": doc.get(
                                "submitDateTime"
                            ),
                            "filerName": filer_name
                        }

                        results.append(result)

                        print(
                            f"✅ {name} "
                            f"{result['docID']}"
                        )

        if results:
            output_path = Path(
                "../data/fundamentals.json"
            )

            with open(
                output_path,
                "w",
                encoding="utf-8"
            ) as f:
                json.dump(
                    results,
                    f,
                    ensure_ascii=False,
                    indent=2
                )

            print("\n=== 完了 ===")
            print(
                f"{len(results)}社取得"
            )
            print(
                f"保存先: {output_path}"
            )

            return

    print("\n⚠️ 対象企業の書類が見つかりませんでした")


if __name__ == "__main__":
    main()
