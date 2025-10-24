#!/bin/bash

# Cron設定ヘルパースクリプト
# 2時間おきにLSTEP CSVエクスポートを実行

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$SCRIPT_DIR"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║           Cron設定 - 2時間おきに自動実行                    ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "プロジェクトディレクトリ: $PROJECT_DIR"
echo ""

# npmのパスを検出
NPM_PATH=$(which npm)
if [ -z "$NPM_PATH" ]; then
    NPM_PATH="/usr/local/bin/npm"
fi

# Cron設定を表示
CRON_ENTRY="0 */2 * * * cd $PROJECT_DIR && $NPM_PATH start >> $PROJECT_DIR/logs/cron.log 2>&1"

echo "以下のcron設定を追加します:"
echo ""
echo "$CRON_ENTRY"
echo ""
echo "説明: 2時間おきの00分に実行 (0:00, 2:00, 4:00, 6:00...)"
echo ""

# 確認
read -p "この設定でよろしいですか？ (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "キャンセルしました。"
    exit 1
fi

# 既存のcrontabを取得
TEMP_CRON=$(mktemp)
crontab -l > "$TEMP_CRON" 2>/dev/null || true

# 重複チェック
if grep -q "Lstep_Automation_local" "$TEMP_CRON"; then
    echo ""
    echo "⚠️  既存のLSTEP自動化エントリが見つかりました。"
    echo ""
    grep "Lstep_Automation_local" "$TEMP_CRON"
    echo ""
    read -p "既存のエントリを削除して新しいエントリを追加しますか？ (y/n): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 既存エントリを削除
        grep -v "Lstep_Automation_local" "$TEMP_CRON" > "${TEMP_CRON}.new"
        mv "${TEMP_CRON}.new" "$TEMP_CRON"
    else
        echo "キャンセルしました。"
        rm "$TEMP_CRON"
        exit 1
    fi
fi

# 新しいエントリを追加
echo "" >> "$TEMP_CRON"
echo "# LSTEP CSV自動エクスポート - 2時間おき" >> "$TEMP_CRON"
echo "$CRON_ENTRY" >> "$TEMP_CRON"

# Crontabをインストール
crontab "$TEMP_CRON"
rm "$TEMP_CRON"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║                  ✅ Cron設定完了！                          ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "📋 現在のcron設定:"
echo ""
crontab -l | grep -A 1 "LSTEP"
echo ""

echo "💡 便利なコマンド:"
echo "  - cron設定を確認: crontab -l"
echo "  - cron設定を編集: crontab -e"
echo "  - cron設定を削除: crontab -r"
echo "  - ログを確認: tail -f $PROJECT_DIR/logs/cron.log"
echo ""

echo "⚠️  重要な注意事項:"
echo "  1. Macがスリープ中は実行されません"
echo "  2. 初回実行時にログインが必要な場合、ブラウザが表示されます"
echo "  3. ログインセッションを保持するため、定期的にnpm run setupを実行してください"
echo ""
