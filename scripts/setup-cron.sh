#!/bin/bash
# macOS launchd スケジュール設定スクリプト

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.lstep.automation"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

# nodeのパスを検出
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
  # Homebrewでインストールされている場合
  if [ -f "/opt/homebrew/bin/node" ]; then
    NODE_PATH="/opt/homebrew/bin/node"
  elif [ -f "/usr/local/bin/node" ]; then
    NODE_PATH="/usr/local/bin/node"
  else
    echo "❌ nodeが見つかりません"
    exit 1
  fi
fi

echo "============================================"
echo "LSTEP 自動化 - cron設定"
echo "============================================"
echo ""

# 実行時間を引数から取得（デフォルト: 9:00）
HOUR="${1:-9}"
MINUTE="${2:-0}"

echo "📁 プロジェクトパス: $PROJECT_DIR"
echo "🔧 Node.js: $NODE_PATH"
echo "⏰ 実行時間: 毎日 ${HOUR}:${MINUTE}"
echo ""

# 既存のジョブがあれば停止
if launchctl list | grep -q "$PLIST_NAME"; then
  echo "🔄 既存のスケジュールを停止中..."
  launchctl unload "$PLIST_PATH" 2>/dev/null
fi

# plistファイルを作成
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${PROJECT_DIR}/src/run-local.js</string>
    </array>
    
    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>
    
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${HOUR}</integer>
        <key>Minute</key>
        <integer>${MINUTE}</integer>
    </dict>
    
    <key>StandardOutPath</key>
    <string>${PROJECT_DIR}/logs/cron.log</string>
    
    <key>StandardErrorPath</key>
    <string>${PROJECT_DIR}/logs/cron-error.log</string>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>HOME</key>
        <string>${HOME}</string>
        <key>DISPLAY</key>
        <string>:0</string>
    </dict>
    
    <key>ProcessType</key>
    <string>Interactive</string>
    
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

echo "✅ plistファイルを作成しました: $PLIST_PATH"

# logsディレクトリを作成
mkdir -p "$PROJECT_DIR/logs"

# plistを読み込む
launchctl load "$PLIST_PATH"

echo "✅ スケジュールを有効化しました"
echo ""
echo "============================================"
echo "設定完了"
echo "============================================"
echo ""
echo "📌 使い方:"
echo "  - 毎日 ${HOUR}:${MINUTE} に自動実行されます"
echo "  - ログイン必要時のみブラウザが表示されます"
echo ""
echo "📌 コマンド:"
echo "  手動実行: npm run local"
echo "  停止:     launchctl unload $PLIST_PATH"
echo "  再開:     launchctl load $PLIST_PATH"
echo "  確認:     launchctl list | grep lstep"
echo "  今すぐ実行: launchctl start $PLIST_NAME"
echo ""
echo "📌 ログ確認:"
echo "  tail -f $PROJECT_DIR/logs/cron.log"
echo ""

