#!/bin/bash
# macOS launchd スケジュール停止スクリプト

PLIST_NAME="com.lstep.automation"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

echo "============================================"
echo "LSTEP 自動化 - cron停止"
echo "============================================"
echo ""

if launchctl list | grep -q "$PLIST_NAME"; then
  launchctl unload "$PLIST_PATH" 2>/dev/null
  echo "✅ スケジュールを停止しました"
else
  echo "⚠️ スケジュールは設定されていません"
fi

if [ -f "$PLIST_PATH" ]; then
  rm "$PLIST_PATH"
  echo "✅ plistファイルを削除しました"
fi

echo ""
echo "完了しました"

