# Azure Retail Prices API 連携メモ

## 1. 目的

Azure系SKUについて、SKUマスタの手動単価ではなく、Azure Retail Prices APIから候補価格を取得できるようにする。

MVPでは、API結果を直接 `sku_price_snapshot.csv` に自動反映せず、まず候補CSVとして出力し、人間がSKU・メーター・リージョンを確認してからスナップショットへ登録する。

## 2. 追加したCLI

```powershell
node .\scripts\fetch-azure-retail-prices.mjs `
  --service-name "Azure OpenAI" `
  --arm-region-name "eastus" `
  --currency-code USD `
  --out .\outputs\azure-openai-prices.csv
```

ドライラン:

```powershell
node .\scripts\fetch-azure-retail-prices.mjs `
  --service-name "Azure OpenAI" `
  --arm-region-name "eastus" `
  --dry-run
```

## 3. 出力CSV

`outputs/azure-retail-prices.csv` または `--out` で指定したCSVに、以下の列を出す。

| 列 | 説明 |
|---|---|
| currencyCode | 通貨 |
| retailPrice | 小売価格 |
| unitPrice | 単価 |
| serviceName | サービス名 |
| productName | 製品名 |
| skuName | SKU名 |
| meterName | メーター名 |
| unitOfMeasure | 課金単位 |
| armRegionName | Azureリージョン |
| location | 表示リージョン |
| effectiveStartDate | 適用開始日 |
| isPrimaryMeterRegion | プライマリメーターリージョン |

## 4. スナップショット反映ルール案

API候補CSVを確認し、対象SKUを決めたら `sku_price_snapshot.csv` に以下の形で追加する。

```csv
snapshot_id,sku_id,captured_at,price_usd,fx_rate_usd_jpy,price_jpy,source_type,source_url,confidence,effective_start_date,change_note
AZURE-SNAP-001,SKU-AZURE-OPENAI-TOKENS,2026-06-12T09:00:00+09:00,123.45,155.2,19162.44,azure_retail_api,https://prices.azure.com/api/retail/prices,High,2026-01-01T00:00:00Z,API候補から対象meterを確認して反映
```

追記CLI:

```powershell
node .\scripts\append-azure-price-snapshot.mjs `
  --azure-csv .\outputs\azure-openai-prices.csv `
  --sku-id SKU-AZURE-OPENAI-TOKENS `
  --row 1 `
  --fx-rate 155.2 `
  --captured-at 2026-06-12T09:00:00+09:00 `
  --dry-run
```

`--row` は候補CSVのデータ行番号を1始まりで指定する。まず `--dry-run` で追記予定行を確認し、問題なければ `--dry-run` を外して `sku_price_snapshot.csv` に追記する。

Input Tokens / Output Tokens のように同一SKUで複数メーターがある場合、デフォルトの `snapshot_id` にはメーター名を含める。

## 5. 今後の実装候補

- `sku_master.csv` にAzure API検索条件を追加する
  - `azure_service_name`
  - `azure_sku_name`
  - `azure_meter_name`
  - `azure_arm_region_name`
- API候補CSVの複数行をまとめて `sku_price_snapshot.csv` に追記するバッチモードを追加する
- Azure OpenAIのモデル別・トークン種別別に数量計算を分ける
- Azure Monitor、Functions、Storageなども同じ仕組みで取得する
