#!/usr/bin/env node
/**
 * ローカル実行スクリプト
 * 1つのブラウザで全クライアントを連続処理（ログインは1回だけ！）
 */

import 'dotenv/config';
import * as db from './db.js';
import { exportMultipleCSV } from './lstep-automation.js';
import { parseCSV } from './csv-parser.js';
import { uploadToSheet, initializeSheetsClient } from './sheets.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeClientName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'default';
}

async function run() {
  console.log('============================================================');
  console.log('LSTEP CSV 自動エクスポート & アップロード（ローカル実行）');
  console.log('============================================================');
  console.log(`開始時刻: ${new Date().toLocaleString('ja-JP')}`);
  
  // DB初期化
  db.initDB();
  
  // 少し待つ（DB接続確立のため）
  await new Promise(r => setTimeout(r, 1000));
  
  // メールアドレスを引数から取得、またはデフォルト
  const email = process.argv[2] || 'yamamotoikki@forestdali.biz';
  
  // ユーザーをメールで検索
  const pool = db.getDB();
  const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = userResult.rows[0];
  
  if (!user) {
    console.error(`❌ ユーザーが見つかりません: ${email}`);
    console.log('使用方法: node src/run-local.js [メールアドレス]');
    process.exit(1);
  }
  
  console.log(`ユーザー: ${user.email}`);
  
  // Sheets API初期化
  await initializeSheetsClient();
  
  // クライアント取得
  console.log('クライアント取得中...');
  const clients = await db.getClientsByUser(user.id);
  console.log(`クライアント数: ${clients.length}`);
  
  const options = await db.getOptions(user.id);
  console.log('オプション取得完了');
  console.log('');

  // 同じprofileのクライアントをグループ化
  const firstClient = clients[0];
  const profileName = firstClient?.profile 
    ? sanitizeClientName(firstClient.profile)
    : 'shared';
  const userDataDir = path.join(__dirname, '../.browser-data', profileName);

  // クライアント設定を整形
  const clientConfigs = clients.map(c => ({
    name: c.name,
    exporterUrl: c.exporter_url,
    presetName: c.preset_name,
    sheetId: c.sheet_id,
    sheetName: c.sheet_name,
  }));

  console.log('🚀 全クライアントを1つのブラウザで連続処理します');
  console.log(`   プロファイル: ${profileName}`);
  console.log(`   クライアント: ${clientConfigs.map(c => c.name).join(', ')}`);
  console.log('');

  // 1つのブラウザで全クライアントを処理
  const csvResults = await exportMultipleCSV(clientConfigs, {
    ...options,
    userDataDir,
    email: firstClient?.email || null,
    password: firstClient?.password || null,
    headless: true,
  });

  // 各CSVをGoogle Sheetsにアップロード
  console.log('');
  console.log('============================================================');
  console.log('Google Sheets アップロード');
  console.log('============================================================');

  const finalResults = [];

  for (const csvResult of csvResults) {
    const clientConfig = clientConfigs.find(c => c.name === csvResult.name);
    
    if (!csvResult.success) {
      finalResults.push({
        name: csvResult.name,
        success: false,
        error: csvResult.error
      });
      continue;
    }

    try {
      console.log(`📤 ${csvResult.name} をアップロード中...`);
      
      // CSV 解析
      const csvData = await parseCSV(csvResult.csvPath);
      
      // Google Sheets アップロード
      const result = await uploadToSheet(csvData, clientConfig.sheetId, clientConfig.sheetName);
      
      // CSV削除
      if (options.cleanupDownloads) {
        await fs.unlink(csvResult.csvPath);
      }
      
      console.log(`✅ ${csvResult.name} 完了: ${result.message}`);
      finalResults.push({ name: csvResult.name, success: true });
      
    } catch (error) {
      console.error(`❌ ${csvResult.name} アップロード失敗: ${error.message}`);
      finalResults.push({ name: csvResult.name, success: false, error: error.message });
    }
  }
  
  // サマリー
  const successCount = finalResults.filter(r => r.success).length;
  const failCount = finalResults.filter(r => !r.success).length;
  
  console.log('');
  console.log('============================================================');
  console.log('実行結果サマリー');
  console.log('============================================================');
  console.log(`完了時刻: ${new Date().toLocaleString('ja-JP')}`);
  console.log(`成功: ${successCount}件`);
  console.log(`失敗: ${failCount}件`);
  
  for (const r of finalResults) {
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}${r.error ? `: ${r.error}` : ''}`);
  }
  
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('致命的エラー:', e);
  process.exit(1);
});
