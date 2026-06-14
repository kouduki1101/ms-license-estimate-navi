# MSライセンス概算ナビ

ユーザーが「こんな業務システムを作りたい」とAIに壁打ちし、Microsoftサービス構成、アーキテクチャ図、必要ライセンス、概算コストを動的に確認する提案前ワークベンチです。

## できること

- 相談文からMicrosoftサービス構成案を作成
- アーキテクチャ図を画面上で表示
- 利用ユーザー数、Maker数、既存ライセンス、Azure利用量を変更して即時再計算
- USD公式価格ベース、JPY換算の概算を表示
- Markdown / Excel / PowerPoint / Azure明細 / 価格監査成果物をダウンロード
- GitHub Pages向けの静的SPAを生成

## ローカル実行

```powershell
npm run dev
```

表示されたURLをブラウザで開きます。Nodeサーバー版では、条件保存とMarkdown / Excel / PowerPoint生成APIが動きます。

## GitHub Pages用ビルド

```powershell
npm run build:pages
```

`docs/` に静的サイトが生成されます。GitHub Actionsを使う場合は、`.github/workflows/github-pages.yml` が `docs/` をPagesへデプロイします。

## GitHub Pages版の制約

GitHub Pagesは静的ホスティングのため、Node APIは動きません。Pages版では、壁打ち、アーキテクチャ図、動的コスト計算、Markdown/JSONのブラウザ生成、同梱済み成果物のダウンロードが動きます。Excel / PowerPointの新規生成はローカルNode版または別途APIホスティングが必要です。

## 主なファイル

| ファイル | 役割 |
|---|---|
| `app/public/` | ダッシュボード画面 |
| `app/server.mjs` | ローカルNode API |
| `scripts/build-pages.mjs` | GitHub Pages用の静的ビルド |
| `sample-input.json` | 初期案件条件 |
| `sku_master.csv` | SKUマスタ |
| `sku_price_snapshot.csv` | 価格スナップショット |
| `existing_licenses.csv` | 既存ライセンス入力 |
| `rules/sku-selection-rules.json` | SKU候補抽出ルール |
| `outputs/` | 生成済み成果物 |
