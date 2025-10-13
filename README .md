# 🚀 LSTEP CSV自動エクスポートツール

LステップからCSVデータを自動取得し、Googleスプレッドシートにアップロードするツールです。

## 📋 目次

- [クイックスタート](#クイックスタート)
- [必要な環境](#必要な環境)
- [セットアップ](#セットアップ)
- [使い方](#使い方)
- [定期実行の設定](#定期実行の設定)
- [複数アカウント対応](#複数アカウント対応)
- [トラブルシューティング](#トラブルシューティング)

---

## 🎯 クイックスタート

### たった2ステップで完了

```bash
# 1. リポジトリをクローン
git clone <このリポジトリのURL>
cd lstep-automation

# 2. 対話型セットアップを実行
./interactive-setup.sh
```

**これだけ！** スクリプトが全て質問してくれるので、答えるだけで完了します。

---

## 💻 必要な環境

- **macOS** (M1/M2/Intel対応)
- **Node.js** 18以上
- **Google Cloud アカウント**（Google Sheets API用）

---

## 📝 セットアップ

### 1. Google Sheets API の設定

**一度だけ設定すればOK。チーム内で1つのサービスアカウントを共有できます。**

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを作成（例: `lstep-automation`）
3. **Google Sheets API** を有効化
   - 「APIとサービス」→「ライブラリ」→「Google Sheets API」を検索して有効化
4. **サービスアカウント**を作成
   - 「APIとサービス」→「認証情報」→「認証情報を作成」→「サービスアカウント」
   - 名前: `lstep-automation`
   - 役割: なし（スキップ）
5. **JSONキー**をダウンロード
   - 作成したサービスアカウント → 「キー」→「鍵を追加」→「JSON」
   - ダウンロードしたファイルを `config/credentials.json` として保存

6. **スプレッドシートに権限付与**
   - スプレッドシートを開く
   - 共有ボタンをクリック
   - サービスアカウントのメールアドレス（`xxx@xxx.iam.gserviceaccount.com`）を追加
   - 権限: **編集者**

### 2. クライアント設定

`config/settings.json` を編集：

```json
{
  "clients": [
    {
      "name": "クライアント名",
      "exporterUrl": "https://manager.linestep.net/line/exporter/xxxxx/list",
      "presetName": "プリセット名",
      "sheetId": "スプレッドシートID",
      "sheetName": "Raw_Lステップ"
    }
  ],
  "options": {
    "headless": true,
    "timeout": 60000,
    "retryCount": 3
  }
}
```

**取得方法：**
- `exporterUrl`: Lステップのエクスポートページ URL
- `presetName`: エクスポートプリセット名（**完全一致**）
- `sheetId`: スプレッドシートのURL `https://docs.google.com/spreadsheets/d/{ここ}/edit`
- `sheetName`: 書き込み先のシート名

### 3. 初回ログイン

```bash
npm run setup
```

- ブラウザが開くので、Lステップにログイン
- ログイン完了後、ターミナルで `Enter` を押す
- Cookie が保存され、次回から自動ログインされます

---

## 🎮 使い方

### 手動実行

```bash
npm start
```

### ログ確認

```bash
# 最新のログを表示
npm run logs

# リアルタイムでログを見る
npm run logs:watch
```

---

## ⏰ 定期実行の設定

```bash
./setup-cron.sh
```

対話形式で選択：
- 1時間ごと
- 2時間ごと
- 4時間ごと
- 毎日1回（9時）
- カスタム

**確認：**
```bash
crontab -l
```

**注意：** Mac がスリープ中は動作しません。システム設定でスリープを無効化するか、ディスプレイのみスリープにしてください。

---

## 🔄 複数アカウント対応

### 同じアカウント内の複数プリセット

`config/settings.json` の `clients` 配列に追加：

```json
{
  "clients": [
    {
      "name": "クライアントA",
      "exporterUrl": "...",
      "presetName": "プリセット1",
      "sheetId": "...",
      "sheetName": "シート1"
    },
    {
      "name": "クライアントB",
      "exporterUrl": "...",
      "presetName": "プリセット2",
      "sheetId": "...",
      "sheetName": "シート2"
    }
  ]
}
```

### 完全に別のアカウント

プロジェクトをコピーして別々に管理：

```bash
cp -r lstep-automation lstep-automation-account2
cd lstep-automation-account2
./quick-setup.sh
```

---

## 🔍 トラブルシューティング

### ❌ ログインセッションが切れた

```bash
npm run setup
```

### ❌ プリセットが見つからない

- `config/settings.json` の `presetName` が**完全一致**しているか確認
- 大文字小文字、スペース、記号も含めて一致させる

### ❌ Google Sheets APIエラー

1. `config/credentials.json` が正しいか確認
2. スプレッドシートにサービスアカウントの編集権限があるか確認
3. `sheetId` が正しいか確認

### ❌ cronで動かない

```bash
# ログ確認
tail -f logs/cron.log

# 手動実行で動くか確認
npm start
```

---

## 🔐 セキュリティ

### 社内利用の場合

- ✅ GitHubリポジトリは**プライベート**に設定
- ✅ `config/credentials.json` は`.gitignore`で除外済み
- ✅ チーム内で同じサービスアカウントを共有OK
- ❌ `config/credentials.json` を絶対に公開しない

### ファイルの扱い

| ファイル | Git管理 | 共有 |
|---------|---------|------|
| `config/credentials.json` | ❌ | 🔒 社内のみ安全に共有 |
| `config/settings.json` | ❌ | ✅ 各自が設定 |
| `.browser-data/` | ❌ | ❌ 個人用 |
| その他のコード | ✅ | ✅ チーム全員 |

---

## 📊 プロジェクト構成

```
lstep-automation/
├── src/
│   ├── index.js              # メイン処理
│   ├── browser.js            # ブラウザ操作
│   ├── lstep-automation.js   # Lステップ自動化
│   ├── csv-parser.js         # CSV解析
│   ├── sheets.js             # Google Sheets連携
│   └── setup.js              # 初回ログイン
├── config/
│   ├── credentials.json      # Google API認証（.gitignore）
│   ├── settings.json         # クライアント設定（.gitignore）
│   └── *.example.json        # サンプル
├── logs/                     # ログ・スクリーンショット
├── quick-setup.sh            # クイックセットアップ
├── setup-cron.sh             # cron設定
└── README.md
```

---

## 🆘 サポート

問題が発生した場合：

1. `logs/` フォルダのスクリーンショットを確認
2. `logs/cron.log` でエラーログを確認
3. Issue を作成（エラーメッセージ、実行環境を記載）

---

## 📝 更新履歴

### v1.0.0 (2025-01-XX)
- 初回リリース
- Puppeteerベースの自動化
- 複数クライアント対応
- Google Sheets API連携
- 完全自動化（cron対応）

---

## 👥 チームメンバー向け：セットアップ手順

### 超簡単3ステップ

1. **リポジトリをクローン**
   ```bash
   git clone <リポジトリURL>
   cd lstep-automation
   ```

2. **credentials.json を配置**
   - チームから共有された `credentials.json` を `config/` フォルダに配置

3. **セットアップ実行**
   ```bash
   ./quick-setup.sh
   ```

これだけで完了です！

---

**質問・要望があればIssueで！**