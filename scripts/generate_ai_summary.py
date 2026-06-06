import json
import os
import time
from pathlib import Path
from google import genai

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

def format_amount(value):
    if value is None:
        return "不明"
    sign = "-" if value < 0 else ""
    abs_val = abs(value)
    if abs_val >= 1_000_000_000_000:
        return f"{sign}{abs_val / 1_000_000_000_000:.1f}兆円"
    elif abs_val >= 100_000_000:
        return f"{sign}{abs_val / 100_000_000:.0f}億円"
    elif abs_val >= 10_000:
        return f"{sign}{abs_val / 10_000:.0f}万円"
    return f"{sign}{abs_val:,}円"

def build_prompt(company, sector_companies):
    f = company.get("financials", {})
    name = company.get("name", "")
    industry = company.get("industry_name", "")
    market = company.get("market", "")

    # 基本指標
    sales = format_amount(f.get("sales"))
    op = format_amount(f.get("operating_profit"))
    net = format_amount(f.get("net_income"))
    assets = format_amount(f.get("total_assets"))
    equity = format_amount(f.get("equity"))
    ocf = format_amount(f.get("operating_cf"))
    icf = format_amount(f.get("investing_cf"))
    div = f.get("dividend_per_share")

    # 利益率
    op_margin = (f["operating_profit"] / f["sales"] * 100) if f.get("operating_profit") and f.get("sales") else None
    roe = (f["net_income"] / f["equity"] * 100) if f.get("net_income") and f.get("equity") else None
    roa = (f["net_income"] / f["total_assets"] * 100) if f.get("net_income") and f.get("total_assets") else None
    fcf = (f["operating_cf"] + f["investing_cf"]) if f.get("operating_cf") is not None and f.get("investing_cf") is not None else None

    # セクター平均
    sector_op_margins = [
        c["financials"]["operating_profit"] / c["financials"]["sales"] * 100
        for c in sector_companies
        if c["financials"].get("operating_profit") and c["financials"].get("sales")
    ]
    sector_avg = sum(sector_op_margins) / len(sector_op_margins) if sector_op_margins else None

    prompt = f"""
以下は{name}（{market}・{industry}）の財務データです。
投資助言に該当しない客観的な財務指標の説明のみを行ってください。
「おすすめ」「割安」「買い」「売り」などの価値判断ワードは使用禁止です。

【財務指標】
- 売上高：{sales}
- 営業利益：{op}
- 当期純利益：{net}
- 総資産：{assets}
- 純資産：{equity}
- 営業CF：{ocf}
- 投資CF：{icf if icf else '不明'}
- FCF：{format_amount(fcf) if fcf is not None else '不明'}
- 営業利益率：{f"{op_margin:.1f}%" if op_margin is not None else '不明'}
- ROE：{f"{roe:.1f}%" if roe is not None else '不明'}
- ROA：{f"{roa:.1f}%" if roa is not None else '不明'}
{"- 1株配当：" + str(div) + "円" if div else ""}

【セクター比較（{industry}）】
- 同業他社の営業利益率平均：{f"{sector_avg:.1f}%" if sector_avg is not None else '不明'}（{len(sector_op_margins)}社）
- 当社営業利益率：{f"{op_margin:.1f}%" if op_margin is not None else '不明'}

200文字以内で客観的な財務指標の特徴を説明してください。
"""
    return prompt

def main():
    data_path = Path("data/fundamentals.json")
    with open(data_path, encoding="utf-8") as f:
        data = json.load(f)

    companies = data["companies"]
    updated = 0

    for i, company in enumerate(companies):
        if company.get("ai_summary"):
            print(f"[{i+1}/{len(companies)}] {company['name']} スキップ（既存）")
            continue

        # 同業他社を取得
        industry = company.get("industry_name", "")
        sector_companies = [
            c for c in companies
            if c.get("industry_name") == industry and c["code"] != company["code"]
        ]

        prompt = build_prompt(company, sector_companies)

        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt
            )
            summary = response.text.strip()
            company["ai_summary"] = summary
            updated += 1
            print(f"[{i+1}/{len(companies)}] {company['name']} ✅")
        except Exception as e:
            print(f"[{i+1}/{len(companies)}] {company['name']} ⚠️ {e}")
            company["ai_summary"] = None

        time.sleep(1)  # API負荷軽減

    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n完了：{updated}社のAIサマリーを生成")

if __name__ == "__main__":
    main()