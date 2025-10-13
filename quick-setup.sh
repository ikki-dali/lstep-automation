#!/bin/bash

echo "=========================================="
echo "   LSTEP自動化ツール - クイックセットアップ"
echo "=========================================="
echo ""

# Step 1: npm install
echo "📦 Step 1/4: パッケージインストール中..."
npm install
echo "✅ 完了"
echo ""

# Step 2: 設定ファイルの作成
echo "⚙️  Step 2/4: 設定ファイル作成中..."

if [ ! -f "config/settings.json" ]; then
  cp config/settings.example.json config/settings.json
  echo "✅ config/settings.json を作成しました"
  echo "   → このファイルを編集して、クライアント情報を設定してください"
else
  echo "⚠️  config/settings.json は既に存在します（スキップ）"
fi
echo ""

# Step 3: Google Sheets認証情報
echo "🔑 Step 3/4: Google Sheets API認証設定"
echo ""

if [ ! -f "config/credentials.json" ]; then
  echo "❌ config/credentials.json が見つかりません"
  echo ""
  echo "📋 次の手順で取得してください："
  echo "  1. Google Cloud Console: https://console.cloud.google.com/"
  echo "  2. プロジェクトを作成"
  echo "  3. Google Sheets APIを有効化"
  echo "  4. サービスアカウントを作成"
  echo "  5. JSONキーをダウンロード"
  echo "  6. config/credentials.json として保存"
  echo ""
  echo "  詳細: README.md の「Google Sheets API設定」セクション参照"
  echo ""
  read -p "credentials.json を配置したら Enter を押してください..."
  
  if [ ! -f "config/credentials.json" ]; then
    echo "❌ まだ config/credentials.json がありません"
    echo "   設定後、再度このスクリプトを実行してください"
    exit 1
  fi
fi

echo "✅ credentials.json 確認完了"
echo ""

# Step 4: 初回ログイン
echo "🔐 Step 4/4: Lステップ初回ログイン"
echo ""
echo "ブラウザが開くので、Lステップにログインしてください"
echo "ログイン完了後、ターミナルで Enter を押してください"
echo ""
read -p "準備ができたら Enter を押してください..."

npm run setup

echo ""
echo "=========================================="
echo "   ✅ セットアップ完了！"
echo "=========================================="
echo ""
echo "📋 次のステップ："
echo "  1. config/settings.json を編集（クライアント情報を設定）"
echo "  2. npm start でテスト実行"
echo "  3. ./setup-cron.sh で定期実行を設定"
echo ""
echo "💡 ヘルプ: README.md を参照"
echo ""
