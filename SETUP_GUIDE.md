# 🚀 LSTEP CSV自動エクスポートツール

LステップからCSVデータを自動取得し、Googleスプレッドシートにアップロードするツールです。

## 📋 目次

- [概要](#概要)
- [必要な環境](#必要な環境)
- [初回セットアップ](#初回セットアップ)
- [使い方](#使い方)
- [定期実行の設定](#定期実行の設定)
- [トラブルシューティング](#トラブルシューティング)

---

## 🎯 概要

このツールは以下を自動で行います：

1. Lステップのエクスポートページにアクセス
2. 指定したプリセットを選択
3. CSVをダウンロード
4. Googleスプレッドシートの指定シートにアップロード

### 動作の流れ

```
Lステップにログイン
    ↓
プリセット選択
    ↓
CSV生成・ダウンロード
    ↓
Googleスプレッドシートにアップロード
    ↓
完了通知
```

---

## 💻 必要な環境

### 必須

- **macOS** (M1/M2/Intel対応)
- **Node.js** 18以上
  - インストール方法: [公式サイト](https://nodejs.org/)からダウンロード
  - 確認: `node -v` でバージョン確認

### 確認コマンド

ターミナルで以下を実行：

```bash
node -v
# v18.0.0 以上が表示されればOK

npm -v
# 9.0.0 以上が表示されればOK
```

## 🚀 クイックスタート

初めての方は、[SETUP_GUIDE.md](./SETUP_GUIDE.md) を参照してください。

### 3ステップで開始

```bash
# 1. パッケージインストール
npm install

# 2. 初回ログイン（1回だけ）
npm run setup

# 3. 実行！
npm start
```

詳細な手順は [SETUP_GUIDE.md](./SETUP_GUIDE.md) をご覧ください。

---

### 1. リポジトリをクローン

```bash
# リポジトリをダウンロード
git clone [リポジトリURL]

# フォルダに移動
cd lstep-automation
```

### 2. 必要なパッケージをインストール

```bash
npm install
```

これで以下がインストールされます：
- Puppeteer (ブラウザ自動操作)
- googleapis (Google Sheets連携)
- その他必要なライブラリ

### 3. 初回ログイン（1回だけ）

```bash
npm run setup
```

ブラウザが自動で開くので：

1. **Lステップにログイン**
2. ログイン完了後、ターミナルで `Enter` を押す
3. ログイン情報が自動保存されます

**これ以降、ログイン不要で自動実行できます！**

### 4. 設定ファイルの確認

`config/settings.json` を開いて、以下を確認：

```json
{
  "clients": [
    {
      "name": "クライアント名",
      "exporterUrl": "https://manager.linestep.net/line/exporter/...",
      "presetName": "プリセット名",
      "sheetId": "スプレッドシートID",
      "sheetName": "Raw_Lステップ"
    }
  ]
}
```

**複数クライアント対応**：`clients`配列に追加するだけ！

---

## 🎮 使い方

### 手動実行（今すぐ実行）

```bash
npm start
```

実行すると：
1. ブラウザが自動で開く（バックグラウンド）
2. CSVダウンロード
3. スプレッドシートにアップロード
4. 完了メッセージ表示

**所要時間**: 約30秒〜1分

### ログの確認

```bash
# 最新のログを表示
npm run logs

# リアルタイムでログを見る
npm run logs:watch
```

ログファイルは `logs/` フォルダに保存されます：
- `YYYY-MM-DD.log` - 日付ごとのログ
- `error-YYYY-MM-DD-HH-mm-ss.png` - エラー時のスクリーンショット

---

## ⏰ 定期実行の設定

### macOSのcronで定期実行

**例: 毎時0分に実行**

1. crontabを編集：
   ```bash
   crontab -e
   ```

2. 以下を追加：
   ```bash
   0 * * * * cd /path/to/lstep-automation && /usr/local/bin/node src/index.js >> logs/cron.log 2>&1
   ```

3. 保存して終了（`:wq`）

### よく使うスケジュール例

```bash
# 毎時0分
0 * * * * cd /path/to/lstep-automation && npm start

# 毎日9時
0 9 * * * cd /path/to/lstep-automation && npm start

# 平日の9時、12時、18時
0 9,12,18 * * 1-5 cd /path/to/lstep-automation && npm start

# 30分ごと
*/30 * * * * cd /path/to/lstep-automation && npm start
```

**パスの確認方法**：
```bash
pwd  # 現在のフォルダのパスを表示
which node  # nodeのパスを表示
```

### cronの動作確認

```bash
# cronが動いているか確認
crontab -l

# ログで実行結果を確認
tail -f logs/cron.log
```

---

## 🔍 トラブルシューティング

### よくある問題と解決方法

#### ❌ 「ログインセッションが切れました」

**原因**: Cookieの有効期限切れ

**解決方法**:
```bash
npm run setup
```
再度ログインし直してください。

---

#### ❌ 「プリセットが見つかりません」

**原因**: `settings.json`のプリセット名が間違っている

**解決方法**:
1. Lステップで正確なプリセット名を確認
2. `config/settings.json`の`presetName`を修正
3. **完全一致**する必要があります（スペースや記号も含めて）

---

#### ❌ 「Google Sheets APIエラー」

**原因**: APIキーまたはSheet IDが間違っている

**解決方法**:
1. `config/credentials.json`のAPIキーを確認
2. `settings.json`の`sheetId`を確認
   - Sheet IDはスプレッドシートのURLから取得：
   - `https://docs.google.com/spreadsheets/d/{ここがsheetId}/edit`

---

#### ❌ cronで動かない

**よくある原因**:

1. **パスが間違っている**
   ```bash
   # 絶対パスを使う
   0 * * * * cd /Users/yourname/lstep-automation && npm start
   ```

2. **nodeのパスが違う**
   ```bash
   which node  # パスを確認
   # /usr/local/bin/node を使う
   ```

3. **権限エラー**
   ```bash
   chmod +x src/index.js
   ```

**デバッグ方法**:
```bash
# cronのログを確認
tail -f logs/cron.log

# 手動実行で動くか確認
npm start
```

---

#### 🐛 その他のエラー

エラーが出たら以下を確認：

1. **スクリーンショットを確認**
   ```bash
   open logs/  # logsフォルダを開く
   ```
   エラー時のスクリーンショットが保存されています

2. **詳細ログを確認**
   ```bash
   npm run logs
   ```

3. **ブラウザを表示して確認**
   `src/browser.js`の`headless`を`false`に変更：
   ```javascript
   headless: false  // ブラウザが表示される
   ```

---

## 📊 設定ファイルの詳細

### settings.json

```json
{
  "clients": [
    {
      "name": "クライアント名",
      "exporterUrl": "https://manager.linestep.net/line/exporter/123",
      "presetName": "毎日エクスポート",
      "sheetId": "1abc...xyz",
      "sheetName": "Raw_Lステップ"
    }
  ],
  "options": {
    "timeout": 60000,
    "retryCount": 3,
    "headless": true
  }
}
```

#### 各項目の説明

| 項目 | 説明 | 例 |
|------|------|-----|
| `name` | 管理用の名前（任意） | "クライアントA" |
| `exporterUrl` | LステップのエクスポートページURL | "https://..." |
| `presetName` | プリセット名（完全一致） | "毎日エクスポート" |
| `sheetId` | スプレッドシートID | "1abc...xyz" |
| `sheetName` | シート名 | "Raw_Lステップ" |

#### オプション設定

| 項目 | 説明 | デフォルト |
|------|------|-----------|
| `timeout` | タイムアウト時間（ミリ秒） | 60000 (60秒) |
| `retryCount` | リトライ回数 | 3 |
| `headless` | ブラウザを非表示 | true |

---

## 🔐 セキュリティについて

### 社内利用の場合

- **GitHubリポジトリは必ずプライベートに設定**
- 認証情報は`config/`フォルダに保存
- 社員退職時はGitHubアクセス権を削除

### ローカル環境

- `logs/`フォルダには個人情報が含まれる可能性があります
- 定期的に古いログを削除することを推奨：
  ```bash
  npm run clean-logs
  ```

---

## 🆘 サポート

### エラーが解決しない場合

1. **Issue を作成** (GitHub)
2. 以下を記載：
   - エラーメッセージ
   - `logs/`フォルダの最新ログ
   - エラー時のスクリーンショット
   - 実行環境（macOSバージョン、Node.jsバージョン）

### 機能追加のリクエスト

Issueで「Enhancement」ラベルをつけて投稿してください。

---

## 📝 更新履歴

### v1.0.0 (2025-01-XX)
- 初回リリース
- Puppeteerベースの自動化
- 複数クライアント対応
- Google Sheets API連携

---

## 👥 開発者向け

### プロジェクト構成

```
lstep-automation/
├── src/
│   ├── index.js        # エントリーポイント
│   ├── browser.js      # ブラウザ操作ロジック
│   ├── sheets.js       # Google Sheets連携
│   └── utils.js        # ユーティリティ関数
├── config/
│   ├── credentials.json
│   └── settings.json
├── logs/               # ログとスクリーンショット
├── package.json
└── README.md
```

### 開発コマンド

```bash
# 開発モード（ブラウザ表示）
npm run dev

# テスト
npm test

# コードフォーマット
npm run format
```

---

## 📄 ライセンス

社内利用限定

---

**質問・要望があればIssueで！**