# Azure従量課金メーター集約レポート

- 案件: 営業部向けAI業務支援PoC
- 価格基準日時: 2026-06-14T09:00:00+09:00
- ルール: C:\Users\kazuki.yoshioka\.codex\new-work-20260612\rules\azure-meter-aggregation-rules.json
- Azure従量課金 月額合計: $9.34

## SKU別サマリー

| SKU ID | 月額USD | 適用ルール |
|---|---:|---|
| SKU-AZURE-OPENAI-TOKENS | $6.00 | AZURE-OPENAI-GPT4O-MINI-JAPANEAST |
| SKU-AZURE-MONITOR | $3.34 | AZURE-MONITOR-LOG-INGESTION-JAPANEAST |
| SKU-AZURE-FUNCTIONS | $0.00 | AZURE-FUNCTIONS-STANDARD-EXECUTIONS-JAPANEAST |

## メーター別内訳

| SKU ID | Rule | Component | Meter | Usage | Unit price | Monthly USD |
|---|---|---|---|---:|---:|---:|
| SKU-AZURE-OPENAI-TOKENS | AZURE-OPENAI-GPT4O-MINI-JAPANEAST | Input tokens | gpt-4o-mini-0718-Inp-glbl Tokens | 20,000,000 tokens | $0.00015 / 1K tokens | $3.00 |
| SKU-AZURE-OPENAI-TOKENS | AZURE-OPENAI-GPT4O-MINI-JAPANEAST | Output tokens | gpt-4o-mini-0718-Outp-glbl Tokens | 5,000,000 tokens | $0.0006 / 1K tokens | $3.00 |
| SKU-AZURE-MONITOR | AZURE-MONITOR-LOG-INGESTION-JAPANEAST | Analytics Logs Data Ingestion | Analytics Logs Data Ingestion | 1 GB | $3.34 / GB | $3.34 |
| SKU-AZURE-FUNCTIONS | AZURE-FUNCTIONS-STANDARD-EXECUTIONS-JAPANEAST | Standard Total Executions | Standard Total Executions | 0 executions | $0.000002 / 10 executions | $0.00 |

## 集約式

- SKU-AZURE-OPENAI-TOKENS: (input_tokens / 1000 * input_unit_price) + (output_tokens / 1000 * output_unit_price)
- SKU-AZURE-MONITOR: log_ingestion_gb * unit_price
- SKU-AZURE-FUNCTIONS: (function_executions / 10) * unit_price
