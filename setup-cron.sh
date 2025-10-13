#!/bin/bash

echo "=========================================="
echo "   LSTEP自動化 - cron設定スクリプト"
echo "=========================================="
echo ""

# 現在のディレクトリを取得
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
NODE_PATH=$(which node)

echo "📂 プロジェクトパス: $SCRIPT_DIR"
echo "🔧 Node.jsパス: $NODE_PATH"
echo ""

# スケジュール選択
echo "実行スケジュールを選択してください："
echo "1) 1時間ごと（毎時0分）"
echo "2) 2時間ごと"
echo "3) 4時間ごと"
echo "4) 毎日1回（9時）"
echo "5) カスタム"
echo ""

read -p "選択 (1-5): " choice

case $choice in
  1)
    CRON_SCHEDULE="0 * * * *"
    DESCRIPTION="1時間ごと（毎時0分）"
    ;;
  2)
    CRON_SCHEDULE="0 */2 * * *"
    DESCRIPTION="2時間ごと"
    ;;
  3)
    CRON_SCHEDULE="0 */4 * * *"
    DESCRIPTION="4時間ごと"
    ;;
  4)
    CRON_SCHEDULE="0 9 * * *"
    DESCRIPTION="毎日9時"
    ;;
  5)
    read -p "cron式を入力 (例: 0 */2 * * *): " CRON_SCHEDULE
    DESCRIPTION="カスタム: $CRON_SCHEDULE"
    ;;
  *)
    echo "❌ 無効な選択です"
    exit 1
    ;;
esac

echo ""
echo "設定内容："
echo "  スケジュール: $DESCRIPTION"
echo "  cron式: $CRON_SCHEDULE"
echo ""

read -p "この設定でよろしいですか？ (y/n): " confirm

if [[ $confirm != "y" && $confirm != "Y" ]]; then
  echo "キャンセルしました"
  exit 0
fi

# cron設定
CRON_COMMAND="$CRON_SCHEDULE cd $SCRIPT_DIR && $NODE_PATH src/index.js >> logs/cron.log 2>&1"

# 既存のcronを確認
EXISTING_CRON=$(crontab -l 2>/dev/null | grep "lstep-automation\|Lstep_Automation")

if [ ! -z "$EXISTING_CRON" ]; then
  echo ""
  echo "⚠️  既存のLSTEP自動化cronが見つかりました："
  echo "$EXISTING_CRON"
  echo ""
  read -p "上書きしますか？ (y/n): " overwrite
  
  if [[ $overwrite == "y" || $overwrite == "Y" ]]; then
    # 既存のcronを削除してから追加
    (crontab -l 2>/dev/null | grep -v "lstep-automation\|Lstep_Automation"; echo "$CRON_COMMAND") | crontab -
  else
    echo "キャンセルしました"
    exit 0
  fi
else
  # 新規追加
  (crontab -l 2>/dev/null; echo "$CRON_COMMAND") | crontab -
fi

echo ""
echo "✅ cron設定完了！"
echo ""
echo "現在のcron設定："
crontab -l
echo ""
echo "📋 次のステップ："
echo "  1. config/settings.json で headless: true に設定"
echo "  2. npm start でテスト実行"
echo "  3. logs/cron.log でログ確認: tail -f logs/cron.log"
echo ""
echo "🗑️  削除する場合: crontab -r"
