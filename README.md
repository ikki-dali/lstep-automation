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

### 3. Google Sheets APIの認証設定

Google Cloud Consoleでサービスアカウントを作成し、JSONキーをダウンロード:

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを作成または選択
3. Google Sheets APIを有効化
4. サービスアカウントを作成してJSONキーをダウンロード
5. ダウンロードしたJSONファイルを `config/credentials.json` として保存

```bash
cp config/credentials.example.json config/credentials.json
# エディタで編集してGoogle Cloud Consoleからダウンロードした内容をペースト
```

**重要**: サービスアカウントのメールアドレス（JSONの`client_email`）に、対象のGoogle Sheetsの**編集者権限**を付与してください。

### 4. クライアント設定

`config/settings.json` を作成:

```bash
cp config/settings.example.json config/settings.json
# エディタで以下を設定:
# - exporterUrl: LステップのエクスポートページURL
# - presetName: 使用するプリセット名
# - sheetId: アップロード先のGoogle Sheets ID
# - sheetName: アップロード先のシート名
```

### 5. 初回ログインセッションを保存

ブラウザが開くので、手動でログイン（reCAPTCHA含む）してください:

```bash
npm run setup
```

ログイン後、ブラウザセッションが保存され、次回からは自動実行されます。

**注意**: ログインセッションは約30日で期限切れになります。期限切れの場合、自動的にブラウザが表示モードで起動し、再ログインを促します。

### 6. 動作確認

```bash
npm start
```

## Docker で実行する（推奨）

Dockerを使用すると、環境構築が不要で、ブラウザベースのUIから簡単に設定・実行できます。

### 前提条件

- Docker と Docker Compose がインストール済み
  - [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
  - [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)

### 起動手順

1. **リポジトリをクローン**
   ```bash
   git clone https://github.com/ikki-dali/lstep-automation.git
   cd lstep-automation
   ```

2. **Dockerコンテナを起動**
   ```bash
   docker-compose up -d
   ```

   初回は数分かかります（Chromeのインストール含む）。

3. **Web UIにアクセス**

   ブラウザで `http://localhost:8080` を開く

4. **設定を行う**

   - **認証情報タブ**: Google Service Accountの認証情報（JSONの内容）を貼り付けて保存
   - **設定タブ**: クライアント情報を入力
     - クライアント名: 任意の名前
     - エクスポートURL: LステップのエクスポートページURL
     - プリセット名: 使用するプリセット名（完全一致）
     - Google Sheets ID: スプレッドシートID（URLの /d/ と /edit の間）
     - シート名: シート名（例: シート1）
   - **設定を保存**ボタンをクリック

5. **初回ログイン**

   初回実行時は、コンテナ内でブラウザを開く必要があるため、以下のコマンドで手動ログインを行います：
   ```bash
   docker-compose exec lstep-automation-web node src/setup.js
   ```

   ログインが完了したら、次回からは「実行」ボタンで自動実行できます。

6. **実行する**

   Web UI上部の「実行」ボタンをクリックして自動化を実行

7. **ログを確認**

   「ログ」タブでリアルタイムに実行状況を確認可能

### Docker コマンド

```bash
# コンテナを起動
docker-compose up -d

# ログを確認
docker-compose logs -f

# コンテナを停止
docker-compose down

# コンテナを再起動
docker-compose restart

# コンテナ内でコマンドを実行（デバッグ用）
docker-compose exec lstep-automation-web bash
```

### データの永続化

以下のデータはホスト側に保存され、コンテナを削除しても保持されます：

- `config/` - 設定ファイル（settings.json, credentials.json）
- `logs/` - 実行ログとスクリーンショット
- `downloads/` - ダウンロードしたCSV
- Dockerボリューム `browser-data` - ログインセッション

### トラブルシューティング（Docker）

**Web UIにアクセスできない**
```bash
docker-compose ps  # コンテナの状態を確認
docker-compose logs  # ログを確認
```

**ログインセッションが保存されない**
- Dockerボリュームが正しくマウントされているか確認
- `docker volume ls` でボリュームを確認

**ポート3000が使用中**
- `docker-compose.yml` のポート設定を変更（例: `"8080:3000"`）

---

## ローカル環境で実行する（従来の方法）

Dockerを使わずに、直接Node.jsで実行することもできます。

## 自動実行設定（Cron）

2時間おきに自動実行する場合:

```bash
npm run setup:cron
```

対話形式でcron設定が完了します。実行スケジュール: 0:00, 2:00, 4:00, 6:00...

**重要**: パスは各自の環境に合わせて修正してください。

## 便利なコマンド

```bash
# ログを確認
npm run logs

# ログをリアルタイム監視
npm run logs:watch

# エラーのみ表示
npm run logs:errors

# 古いログを削除（30日以上前）
npm run clean-logs

# デバッグモード（ブラウザ表示）
npm run dev
```

## 主な機能

### ✅ 自動ログイン復旧
ログインセッションが期限切れの場合、自動的にブラウザを表示モードで起動し、手動ログインを促します。ログイン完了後、自動的に処理を継続します。

### ✅ AppleシリコンMac対応
システムにインストールされているGoogle Chromeを使用することで、M1/M2/M3 Macでも問題なく動作します。

### ✅ リトライ機能
ネットワークエラーやタイムアウトの際、自動的に3回までリトライします。

### ✅ エラー時スクリーンショット
エラー発生時、自動的にスクリーンショットを保存し、問題の特定を容易にします。

## トラブルシューティング

### ブラウザ起動エラー (socket hang up)

**原因**: AppleシリコンMacでPuppeteerのバンドルChromiumが動作しない

**解決策**: システムのGoogle Chromeを使用するよう設定済み（自動対応）

### ログインセッション期限切れ

**症状**: ログインページが表示される

**解決策**: 自動的にブラウザが表示されるので、手動でログインしてください

### プリセットが見つからない

- `config/settings.json` の `presetName` がLステップ上の名前と完全一致しているか確認
- プリセット名に余分なスペースや特殊文字がないか確認
- `logs/` ディレクトリ内のスクリーンショットを確認

### ダウンロードがタイムアウトする

- `config/settings.json` の `timeout` 値を増やす（デフォルト: 60000ms）
- ネットワーク接続を確認

### Cron実行時にブラウザが表示されない

**原因**: Macがスリープ中、またはcronがバックグラウンドで実行中

**解決策**: 初回ログイン時は`npm run setup`を手動で実行してセッションを保存してください

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
