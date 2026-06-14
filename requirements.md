# MSライセンス概算ナビ 要件定義

## 1. 目的

MSライセンス概算ナビは、提案前の初期検討段階で、Microsoftサービスを使ったシステム構成案とライセンス概算を素早く作成するための支援ツールである。

正式見積ではなく、以下を短時間で整理することを目的とする。

- 業務要件に基づくMicrosoftサービスの簡易アーキテクチャ
- 必要になりそうなMicrosoftライセンス、Azure従量課金、数量の概算
- 既存ライセンスで充足できる範囲と追加購入が必要な範囲
- USD公式価格ベースの概算費用と日本円換算
- なぜそのライセンスが必要か、なぜその数量になるかの根拠
- 価格取得時点、為替取得時点、公式ソースに基づく注記

## 2. 想定利用者

- 提案担当者
- DX推進担当者
- Power Platform / Azure / Microsoft 365 のプリセールス担当者
- PoC企画担当者
- 顧客ヒアリング後に概算構成と費用感をまとめたい担当者

## 3. 前提

- 対象は提案前の概算であり、正式見積ではない。
- 対象サービスはMicrosoftサービス全般とする。
  - Microsoft 365
  - Power Platform
  - Copilot Studio
  - Dynamics 365
  - Azure
  - Microsoft Entra
  - Microsoft Defender / Purview / Sentinel など
- 価格はUSD公式価格を基準とする。
- 日本円換算も出力する。
- 為替レートは取得時点を記録する。
- 既存ライセンスを入力できる。
- 出力形式はExcelとMarkdownを主対象とする。
- SKU価格はSKUマスタとして管理し、更新時に価格スナップショットを保存する。
- SKUマスタを活用して価格履歴・改定影響分析を行う。

## 4. スコープ

### 4.1 MVPでやること

- 要件壁打ち
- 簡易MSアーキテクチャ生成
- 必要ライセンス候補の抽出
- 数量推定
- 既存ライセンスとの差分算出
- USDベース概算
- 日本円換算
- 価格ソース、価格取得日時、為替取得日時の記録
- Excel出力
- Markdown出力
- SKUマスタ管理
- 価格スナップショット保存
- SKU別価格推移チャート
- 前回価格との差分検知

### 4.2 MVPではやらないこと

- 正式見積書の発行
- EA / CSP / 個別契約割引の自動反映
- 税計算
- 契約条項の法務判断
- 顧客テナントからの自動ライセンス棚卸し
- Microsoft契約条件の最終判断
- 複雑なライセンス例外の完全自動判定

## 5. 機能要件

### 5.1 要件壁打ち機能

ユーザーから自然文またはフォーム入力で要件を受け取り、ライセンス概算に必要な情報を整理する。

#### 入力項目

- 案件名
- 業務目的
- 対象部門
- 利用者数
- 管理者数
- 外部ユーザー数
- 利用地域
- 想定利用開始時期
- 必要機能
  - ファイル共有
  - メール / 会議
  - 業務アプリ
  - ワークフロー
  - BI
  - AIチャット
  - エージェント
  - データベース
  - 認証 / SSO
  - 監査 / セキュリティ
  - ログ監視
  - 外部連携
- 想定月間利用量
  - AIリクエスト数
  - API呼び出し数
  - フロー実行数
  - ストレージ容量
  - データ転送量
- 既存ライセンス
- 既存Azure契約の有無
- 通貨換算条件
- 不明項目の扱い

#### 壁打ちルール

- 不足情報がある場合は追加質問する。
- ユーザーが回答できない場合は合理的な仮定を置く。
- 仮定は必ず出力に明記する。
- 「概算に大きく影響する未確定事項」はリスクとして出力する。

### 5.2 簡易MSアーキテクチャ生成機能

入力要件に基づき、Microsoftサービスを組み合わせた簡易アーキテクチャを生成する。

#### 出力項目

- コンポーネント名
- Microsoftサービス名
- 役割
- 利用者
- ライセンス影響
- 課金単位
- 代替候補

#### 例

| コンポーネント | サービス | 役割 | ライセンス影響 |
|---|---|---|---|
| 認証基盤 | Microsoft Entra ID | SSO、ID管理 | M365 / Entraプラン確認 |
| ファイル共有 | SharePoint Online | 文書管理、ナレッジ格納 | M365ライセンス確認 |
| 業務アプリ | Power Apps | 入力画面、業務UI | Power Appsライセンス確認 |
| 自動化 | Power Automate | 承認、通知、連携 | Power Automateライセンス確認 |
| 会話AI | Copilot Studio | エージェント作成 | Copilot Studio容量確認 |
| AI処理 | Azure OpenAI | 生成AI処理 | Azure従量課金 |

### 5.3 ライセンス候補抽出機能

アーキテクチャ内のサービスから、必要なライセンス候補を抽出する。

#### 判定観点

- サービス利用に必要な基本ライセンス
- ユーザー単位ライセンス
- 管理者単位ライセンス
- テナント単位ライセンス
- 容量 / クレジット単位
- Azure従量課金
- 既存ライセンスで充足できる可能性
- 追加購入が必要な可能性

### 5.4 既存ライセンス入力・差分算出機能

ユーザーが既存保有ライセンスを入力し、追加で必要なライセンス数量を算出する。

#### 入力例

| ライセンス | 保有数量 | 対象ユーザー | 備考 |
|---|---:|---|---|
| Microsoft 365 E3 | 120 | 全社員 | 既存契約 |
| Power Automate Premium | 10 | 業務担当 | 一部部門のみ |
| Power BI Pro | 30 | 分析担当 | 既存契約 |

#### 出力例

| 必要SKU | 必要数量 | 既存充足数量 | 追加必要数量 | 判定 |
|---|---:|---:|---:|---|
| Power Automate Premium | 25 | 10 | 15 | 追加購入候補 |
| Copilot Studio | 1 | 0 | 1 | 新規購入候補 |

### 5.5 価格取得・試算機能

ライセンス単価、数量、月数をもとに概算費用を算出する。

#### 価格取得方式

| 分類 | 取得方式 | 備考 |
|---|---|---|
| Azure | Azure価格API | リージョン、SKU、メーター単位で取得 |
| Microsoft 365 | SKUマスタ | 公式価格ページ確認後にマスタ保存 |
| Power Platform | SKUマスタ | 公式価格ページ確認後にマスタ保存 |
| Copilot Studio | SKUマスタ | クレジット / 容量単位を管理 |
| Dynamics 365 | SKUマスタ | プランごとのユーザー単価を管理 |
| Defender / Purview / Sentinel | SKUマスタ + Azure従量課金 | 製品により課金単位が異なる |

#### 算出項目

- USD単価
- USD月額
- USD年額
- 為替レート
- JPY換算単価
- JPY月額
- JPY年額
- 価格取得日時
- 為替取得日時
- 公式ソースURL
- 概算注記

#### 計算式

```text
usd_monthly = unit_price_usd * quantity
usd_annual = usd_monthly * 12
jpy_unit_price = unit_price_usd * fx_rate
jpy_monthly = usd_monthly * fx_rate
jpy_annual = usd_annual * fx_rate
```

### 5.6 根拠・補足生成機能

試算結果だけでなく、数量とライセンス判断の理由を出力する。

#### 出力する根拠

- なぜこのMicrosoftサービスを使うか
- なぜこのSKUが必要か
- なぜこの数量になるか
- 既存ライセンスで充足できるか
- 追加購入が必要な理由
- 代替構成
- 注意事項

#### 根拠文例

```text
Power Automate Premiumは、標準コネクタだけでなくプレミアムコネクタを利用する前提のため追加候補とした。
対象業務担当者25名がフローを作成・実行する想定であるため、必要数量を25とした。
既存で10ライセンスが入力されているため、追加必要数量は15と試算した。
```

### 5.7 Excel出力機能

試算結果をExcelブックとして出力する。

詳細は `output-format-definition.md` を参照する。

### 5.8 Markdown出力機能

提案前メモとして利用できるMarkdownを出力する。

詳細は `output-format-definition.md` を参照する。

### 5.9 SKUマスタ管理機能

MicrosoftサービスのSKU、価格、課金単位、公式ソースを管理する。

#### 管理対象

- SKU基本情報
- サービスカテゴリ
- 製品名
- SKU名
- 課金単位
- 価格取得方式
- 公式ソースURL
- 有効 / 無効
- 備考

### 5.10 価格スナップショット保存機能

価格取得または価格マスタ更新のたびに、時点情報として価格スナップショットを保存する。

#### 保存目的

- 過去価格との比較
- 価格改定検知
- 見積時点の再現
- 価格推移チャート生成
- USD価格変動と為替影響の分離

### 5.11 価格履歴・改定影響分析機能

SKUマスタと価格スナップショットを利用し、MSライセンス価格推移チャートを生成する。

#### MVPで出すチャート

- SKU別USD単価推移
- SKU別JPY換算単価推移
- 前回スナップショットとの差分
- 見積時点価格と最新価格の差分

#### 将来拡張

- サービスカテゴリ別価格推移
- 為替影響分解
- 価格改定アラート
- 月額 / 年額インパクトの自動算出
- 複数SKUをまとめた提案総額の推移

## 6. 非機能要件

### 6.1 正確性

- 価格は必ずソースURLと取得日時を保持する。
- 為替レートは必ず取得日時とソースを保持する。
- 試算結果には「概算」であることを明記する。
- 既存ライセンス充足判定は推定として扱う。

### 6.2 透明性

- ライセンス選定理由を表示する。
- 数量算定根拠を表示する。
- 既存ライセンスとの差分を表示する。
- 仮定と未確定事項を分けて表示する。

### 6.3 監査性

- 入力条件を保存できる。
- 試算結果を保存できる。
- 使用した価格スナップショットを追跡できる。
- 同じ入力と同じ価格時点で再計算できる。

### 6.4 保守性

- ライセンスルール、SKUマスタ、価格取得、為替取得を分離する。
- Microsoftサービス追加時にSKUマスタを追加できる。
- 価格ソース変更に備えて手動更新を可能にする。

### 6.5 セキュリティ

- 顧客名、案件名、要件詳細の保存可否を選べる。
- 価格マスタ編集は管理者のみ可能にする。
- 試算履歴へのアクセス制御を行う。
- 機密情報を価格取得APIに送信しない。

### 6.6 可用性

- 価格取得に失敗した場合も、直近スナップショットで概算可能にする。
- 公式価格ソースにアクセスできない場合は警告を表示する。
- 為替取得に失敗した場合は、前回レートを使うか手動入力を促す。

### 6.7 UX

- ユーザーがライセンス名を知らなくても使える。
- 「わからない」を選択できる。
- 最小構成、標準構成、拡張構成を比較できる。
- ExcelとMarkdownをワンクリックで出力できる。

## 7. データモデル

### 7.1 project_estimate

| 項目 | 型 | 説明 |
|---|---|---|
| estimate_id | string | 試算ID |
| project_name | string | 案件名 |
| customer_name | string | 顧客名、任意 |
| purpose | string | 業務目的 |
| created_at | datetime | 作成日時 |
| pricing_as_of | datetime | 価格基準日時 |
| fx_as_of | datetime | 為替基準日時 |
| currency_base | string | 基準通貨、USD |
| currency_converted | string | 換算通貨、JPY |
| status | string | draft / finalized |

### 7.2 requirement_input

| 項目 | 型 | 説明 |
|---|---|---|
| estimate_id | string | 試算ID |
| user_count | number | 一般利用者数 |
| admin_count | number | 管理者数 |
| external_user_count | number | 外部ユーザー数 |
| region | string | 利用地域 |
| required_capabilities | array | 必要機能 |
| monthly_usage_assumptions | object | 月間利用量仮定 |
| unknown_items | array | 未確定項目 |

### 7.3 architecture_component

| 項目 | 型 | 説明 |
|---|---|---|
| component_id | string | コンポーネントID |
| estimate_id | string | 試算ID |
| component_name | string | コンポーネント名 |
| microsoft_service | string | Microsoftサービス |
| role | string | 役割 |
| license_impact | string | ライセンス影響 |
| billing_driver | string | 数量算定ドライバー |

### 7.4 sku_master

| 項目 | 型 | 説明 |
|---|---|---|
| sku_id | string | SKU ID |
| service_category | string | M365 / Power Platform / Azure など |
| product_name | string | 製品名 |
| sku_name | string | SKU名 |
| billing_unit | string | user/month, tenant/month, credit/month, hour など |
| price_source_type | string | api / official_page / manual |
| official_source_url | string | 公式ソースURL |
| default_currency | string | USD |
| is_active | boolean | 有効フラグ |
| notes | string | 備考 |

### 7.5 sku_price_snapshot

| 項目 | 型 | 説明 |
|---|---|---|
| snapshot_id | string | スナップショットID |
| sku_id | string | SKU ID |
| captured_at | datetime | 取得日時 |
| price_usd | number | USD単価 |
| fx_rate_usd_jpy | number | USD/JPY為替 |
| price_jpy | number | JPY換算単価 |
| source_type | string | api / official_page / manual |
| source_url | string | ソースURL |
| confidence | string | high / medium / low |
| effective_start_date | datetime | 価格適用開始日、取得可能な場合 |
| notes | string | 備考 |

### 7.6 license_estimate_line

| 項目 | 型 | 説明 |
|---|---|---|
| line_id | string | 明細ID |
| estimate_id | string | 試算ID |
| sku_id | string | SKU ID |
| required_quantity | number | 必要数量 |
| existing_quantity | number | 既存数量 |
| additional_quantity | number | 追加必要数量 |
| unit_price_usd | number | USD単価 |
| monthly_usd | number | USD月額 |
| annual_usd | number | USD年額 |
| unit_price_jpy | number | JPY単価 |
| monthly_jpy | number | JPY月額 |
| annual_jpy | number | JPY年額 |
| quantity_reason | string | 数量根拠 |
| license_reason | string | ライセンス根拠 |
| assumptions | string | 仮定 |

## 8. 注記・免責

出力には必ず以下の注記を含める。

```text
本試算は、YYYY-MM-DD HH:mm時点で取得または管理されているMicrosoft公式価格情報、およびYYYY-MM-DD HH:mm時点のUSD/JPY為替レートに基づく概算です。
正式な見積金額、契約価格、税額、EA/CSP等の個別割引、Microsoftまたは販売代理店による最終ライセンス判断を示すものではありません。
実際の購入前には、Microsoft公式情報、販売代理店、または契約管理者に確認してください。
```

## 9. 未決事項

- 為替レート取得元
- M365 / Power Platform / Copilot StudioのSKUマスタ初期登録範囲
- Dynamics 365をMVPにどこまで含めるか
- Azure従量課金の利用量入力テンプレート
- Excel生成ライブラリ
- Markdown内のMermaid図を必須にするか
- 価格スナップショット取得頻度
- 価格改定アラート閾値

