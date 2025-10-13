/**
 * Google Sheets API 動作確認スクリプト
 * 
 * 使い方:
 *   node src/test-sheets.js
 * 
 * 確認内容:
 * 1. 認証が成功するか
 * 2. スプレッドシート情報が取得できるか
 * 3. データの書き込みができるか
 */

import { initializeSheetsClient, uploadToSheet, getSheetInfo } from './sheets.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// テスト用のダミーデータ
const testData = [
  ['テスト項目', '値', 'ステータス', 'タイムスタンプ'],
  ['API接続テスト', 'OK', '成功', new Date().toISOString()],
  ['データ書き込みテスト', 'OK', '成功', new Date().toISOString()],
  ['日本語テスト', 'こんにちは', '成功', new Date().toISOString()],
];

async function testSheetsAPI() {
  console.log('========================================');
  console.log('Google Sheets API 動作確認テスト');
  console.log('========================================\n');

  try {
    // settings.jsonを読み込み
    const settingsPath = path.join(__dirname, '../config/settings.json');
    const settingsContent = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent);

    if (!settings.clients || settings.clients.length === 0) {
      throw new Error('settings.jsonにクライアント設定がありません');
    }

    const client = settings.clients[0]; // 最初のクライアント設定を使用

    console.log('📋 テスト設定:');
    console.log(`  - クライアント名: ${client.name}`);
    console.log(`  - Sheet ID: ${client.sheetId}`);
    console.log(`  - シート名: ${client.sheetName}\n`);

    // ステップ1: API初期化
    console.log('🔧 ステップ1: API初期化');
    await initializeSheetsClient();
    console.log('');

    // ステップ2: スプレッドシート情報取得
    console.log('📊 ステップ2: スプレッドシート情報取得');
    const info = await getSheetInfo(client.sheetId);
    console.log(`  - スプレッドシート名: ${info.title}`);
    console.log('  - シート一覧:');
    info.sheets.forEach(sheet => {
      console.log(`    - ${sheet.title} (${sheet.rowCount}行 × ${sheet.columnCount}列)`);
    });
    console.log('');

    // ステップ3: テストデータ書き込み
    console.log('✍️  ステップ3: テストデータ書き込み');
    const result = await uploadToSheet(testData, client.sheetId, client.sheetName);
    console.log(`  - ${result.message}`);
    console.log(`  - 更新セル数: ${result.updatedCells}`);
    console.log(`  - 更新行数: ${result.updatedRows}`);
    console.log('');

    // 成功メッセージ
    console.log('========================================');
    console.log('✅ すべてのテストが成功しました！');
    console.log('========================================');
    console.log('\n💡 スプレッドシートを開いて、データが書き込まれているか確認してください。');
    console.log(`   https://docs.google.com/spreadsheets/d/${client.sheetId}/edit\n`);

  } catch (error) {
    console.error('\n========================================');
    console.error('❌ テスト失敗');
    console.error('========================================');
    console.error(`エラー: ${error.message}\n`);

    // よくあるエラーと解決方法
    console.error('💡 トラブルシューティング:');
    
    if (error.message.includes('credentials.json')) {
      console.error('  1. config/credentials.json が存在するか確認');
      console.error('  2. Google Cloud ConsoleでService Accountを作成');
      console.error('  3. JSONキーをダウンロードして配置');
    } else if (error.message.includes('権限')) {
      console.error('  1. スプレッドシートの共有設定を確認');
      console.error('  2. Service Account のメールアドレスに「編集者」権限を付与');
      console.error(`     (${error.message.includes('client_email') ? 'credentials.jsonのclient_email' : 'サービスアカウントのメール'})`);
    } else if (error.message.includes('見つかりません')) {
      console.error('  1. Sheet IDが正しいか確認');
      console.error('  2. シート名が正確に一致しているか確認（大文字小文字、スペース）');
    } else {
      console.error('  詳細エラーログを確認してください');
    }

    console.error('');
    process.exit(1);
  }
}

// スクリプト実行
testSheetsAPI();