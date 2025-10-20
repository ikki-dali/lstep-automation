# LステップCSV自動エクスポートツール

LステップからCSVを自動でエクスポートし、Google Sheetsにアップロードするツールです。

## 必要な環境

- Node.js (v14以上)
- Google Chrome ブラウザ
- Google Cloud プロジェクト（Sheets API有効化済み）

## セットアップ手順

### 1. リポジトリをクローン

```bash
git clone https://github.com/ikki-dali/lstep-automation.git
cd lstep-automation
```

### 2. 依存パッケージをインストール

```bash
npm install
```

### 3. 環境変数を設定

`.env`ファイルを作成してLステップの認証情報を設定:

```bash
LSTEP_EMAIL=your-email@example.com
LSTEP_PASSWORD=your-password
```

### 4. Google Sheets APIの認証設定

Google Cloud Console でサービスアカウントを作成し、`credentials.json` をプロジェクトルートに配置してください。

詳細: https://developers.google.com/sheets/api/quickstart/nodejs

### 5. クライアント設定

`config/settings.json` で以下を設定:

- `exporterUrl`: LステップのエクスポートページURL
- `presetName`: 使用するプリセット名
- `sheetId`: アップロード先のGoogle Sheets ID
- `sheetName`: アップロード先のシート名

### 6. 初回ログイン

初回実行時はブラウザが表示されるので、手動でログイン（reCAPTCHA含む）してください:

```bash
npm start
```

ログイン後、ブラウザセッションが保存され、次回からは自動実行されます。

## 自動実行設定（cron）

2時間ごとに自動実行する場合:

```bash
crontab mycron.txt
```

設定内容（`mycron.txt`）:
```
0 */2 * * * cd /path/to/lstep-automation && /usr/local/bin/node src/index.js >> logs/cron.log 2>&1
```

**重要**: パスは各自の環境に合わせて修正してください。

## トラブルシューティング

### エクスポートが失敗する

- `logs/` ディレクトリ内のスクリーンショットを確認
- ログイン状態が切れている場合は、手動で再実行してログイン

### プリセットが見つからない

- `config/settings.json` の `presetName` がLステップ上の名前と完全一致しているか確認
- プリセット名に余分なスペースや特殊文字がないか確認

### ダウンロードがタイムアウトする

- `config/settings.json` の `timeout` 値を増やす（デフォルト: 60000ms）
- ネットワーク接続を確認

## ファイル構成

```
.
├── src/
│   ├── index.js              # メインエントリーポイント
│   ├── lstep-automation.js   # Lステップ自動化ロジック
│   ├── csv-parser.js         # CSV パーサー
│   └── sheets.js             # Google Sheets連携
├── config/
│   └── settings.json         # クライアント設定
├── logs/                     # ログとスクリーンショット
├── downloads/                # CSVダウンロード先
├── .browser-data/            # ブラウザセッション保存先
└── mycron.txt                # cron設定例

```

## 開発者向け情報

詳細な技術ドキュメント: `CLAUDE.md`

## ライセンス

MIT
