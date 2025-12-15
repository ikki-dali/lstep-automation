#!/usr/bin/env node
/**
 * ユーザー別自動化実行スクリプト
 * 引数: ユーザーID
 */

import * as db from './db.js';
import { exportCSV } from './lstep-automation.js';
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

async function run(userId) {
  console.log('============================================================');
  console.log('LSTEP CSV 自動エクスポート & アップロード');
  console.log('============================================================');
  console.log(`開始時刻: ${new Date().toLocaleString('ja-JP')}`);
  
  // DB初期化
  db.initDB();
  
  // ユーザー確認
  const user = await db.getUserById(userId);
  if (!user) {
    console.error('ユーザーが見つかりません');
    process.exit(1);
  }
  
  console.log(`ユーザー: ${user.email}`);
  
  // Sheets API初期化（共通のcredentials.jsonを使用）
  await initializeSheetsClient();
  
  // クライアント取得
  console.log('クライアント取得中...');
  const clients = await db.getClientsByUser(userId);
  console.log(`クライアント数: ${clients.length}`);
  
  const options = await db.getOptions(userId);
  console.log('オプション取得完了');
  console.log('');
  
  const results = [];
  
  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    console.log(`[${i + 1}/${clients.length}] ${client.name}`);
    console.log('------------------------------------------------------------');
    
    // Cookieチェック
    const cookies = client.cookies ? JSON.parse(client.cookies) : null;
    
    if (!cookies || cookies.length === 0) {
      console.log('⚠️ Cookieが設定されていません。スキップします。');
      results.push({ name: client.name, success: false, error: 'Cookie未設定' });
      continue;
    }
    
    try {
      // プロファイルパス
      const profileName = `${userId}-${sanitizeClientName(client.name)}`;
      const userDataDir = path.join(__dirname, '../.browser-data', profileName);
      
      // CSV エクスポート
      console.log('【フェーズ1】CSV ダウンロード');
      const csvPath = await exportCSV(
        client.exporter_url,
        client.preset_name,
        client.name,
        {
          ...options,
          userDataDir,
          cookies
        }
      );
      
      // CSV 解析
      console.log('【フェーズ2】CSV データ解析');
      const csvData = await parseCSV(csvPath);
      
      // Google Sheets アップロード
      console.log('【フェーズ3】Google Sheets アップロード');
      const result = await uploadToSheet(csvData, client.sheet_id, client.sheet_name);
      
      // CSV削除
      if (options.cleanupDownloads) {
        await fs.unlink(csvPath);
        console.log('🧹 CSVファイルを削除しました');
      }
      
      console.log(`✅ ${client.name} 完了: ${result.message}`);
      results.push({ name: client.name, success: true });
      
    } catch (error) {
      console.error(`❌ ${client.name} 失敗: ${error.message}`);
      console.error(`   スタック: ${error.stack}`);
      results.push({ name: client.name, success: false, error: error.message });
    }
    
    console.log('');
  }
  
  
  // サマリー
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log('============================================================');
  console.log('実行結果サマリー');
  console.log('============================================================');
  console.log(`完了時刻: ${new Date().toLocaleString('ja-JP')}`);
  console.log(`成功: ${successCount}件`);
  console.log(`失敗: ${failCount}件`);
  
  if (failCount > 0) {
    process.exit(1);
  }
}

const userId = process.argv[2];

if (!userId) {
  console.error('使用方法: node run-user.js <userId>');
  process.exit(1);
}

run(userId).catch(e => {
  console.error('致命的エラー:', e);
  process.exit(1);
});

