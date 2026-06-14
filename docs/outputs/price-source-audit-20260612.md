# 価格ソース監査レポート

- 監査日時: 2026-06-12 07:45 UTC
- stale判定: 最新スナップショットが90日超の場合に要再確認
- 対象SKU: 12
- 対応必要: 12

## ステータス集計

| Status | Count |
|---|---:|
| missing_snapshot | 3 |
| sample_price | 9 |

## SKU別監査

| Severity | Status | SKU ID | Product | SKU | Source Type | Captured At | USD | Confidence | Action |
|---|---|---|---|---|---|---|---:|---|---|
| High | sample_price | SKU-M365-E3 | Microsoft 365 | E3 | manual_sample | 2026-06-12 09:00 +09:00 | $33.00 | Low | Microsoft公式価格ページを確認し、official_pageスナップショットへ差し替える。 |
| High | missing_snapshot | SKU-M365-E5 | Microsoft 365 | E5 | TBD | TBD | TBD | TBD | sku_price_snapshot.csvに価格スナップショットを追加する。 |
| High | sample_price | SKU-POWERAPPS-PREMIUM | Power Apps | Premium | manual_sample | 2026-06-12 09:00 +09:00 | $20.00 | Low | Microsoft公式価格ページを確認し、official_pageスナップショットへ差し替える。 |
| High | sample_price | SKU-POWERAUTOMATE-PREMIUM | Power Automate | Premium | manual_sample | 2026-06-12 09:00 +09:00 | $15.00 | Low | Microsoft公式価格ページを確認し、official_pageスナップショットへ差し替える。 |
| High | sample_price | SKU-COPILOTSTUDIO-MESSAGES | Copilot Studio | Messages or capacity | manual_sample | 2026-06-12 09:00 +09:00 | $200.00 | Low | Microsoft公式価格ページを確認し、official_pageスナップショットへ差し替える。 |
| High | sample_price | SKU-POWERBI-PRO | Power BI | Pro | manual_sample | 2026-06-12 09:00 +09:00 | $14.00 | Low | Microsoft公式価格ページを確認し、official_pageスナップショットへ差し替える。 |
| High | missing_snapshot | SKU-DATAVERSE-CAPACITY | Dataverse | Database capacity | TBD | TBD | TBD | TBD | sku_price_snapshot.csvに価格スナップショットを追加する。 |
| High | sample_price | SKU-AZURE-OPENAI-TOKENS | Azure OpenAI | Token usage | manual_sample | 2026-06-12 09:00 +09:00 | $120.00 | Low | Azure Retail Prices APIから候補CSVを取得し、確認後にスナップショットへ追記する。 |
| High | missing_snapshot | SKU-AZURE-FUNCTIONS | Azure Functions | Consumption | TBD | TBD | TBD | TBD | sku_price_snapshot.csvに価格スナップショットを追加する。 |
| High | sample_price | SKU-AZURE-MONITOR | Azure Monitor | Log ingestion | manual_sample | 2026-06-12 09:00 +09:00 | $2.76 | Low | Azure Retail Prices APIから候補CSVを取得し、確認後にスナップショットへ追記する。 |
| High | sample_price | SKU-ENTRA-ID-P1 | Microsoft Entra ID | P1 | manual_sample | 2026-06-12 09:00 +09:00 | $6.00 | Low | Microsoft公式価格ページを確認し、official_pageスナップショットへ差し替える。 |
| High | sample_price | SKU-DEFENDER-BUSINESS | Microsoft Defender for Business | Defender for Business | manual_sample | 2026-06-12 09:00 +09:00 | $3.00 | Low | Microsoft公式価格ページを確認し、official_pageスナップショットへ差し替える。 |

## 次アクション

1. `sample_price` のSKUを公式価格で置き換える。
2. Azure系SKUは `fetch-azure-retail-prices.mjs` で候補CSVを作り、`append-azure-price-snapshot.mjs` で追記する。
3. Microsoft 365 / Power Platform / Security系SKUは公式価格ページ確認後、`official_page` として `sku_price_snapshot.csv` に追記する。
