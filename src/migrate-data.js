#!/usr/bin/env node
/**
 * 既存のsettings.jsonからデータを移行するスクリプト
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate(userEmail) {
  console.log('データ移行を開始します...\n');
  
  // DB初期化
  db.initDB();
  
  // settings.json を読み込み
  const settingsPath = path.join(__dirname, '../config/settings.json');
  let settings;
  
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    settings = JSON.parse(content);
  } catch (e) {
    console.error('settings.json が見つかりません');
    process.exit(1);
  }
  
  // ユーザーを取得（メールアドレスで検索）
  const dbInstance = db.getDB();
  const user = dbInstance.prepare('SELECT * FROM users WHERE email = ?').get(userEmail);
  
  if (!user) {
    console.error(`ユーザー "${userEmail}" が見つかりません`);
    console.log('先にWebUIでアカウントを作成してください');
    process.exit(1);
  }
  
  console.log(`ユーザー: ${user.email} (${user.name || 'no name'})`);
  console.log(`移行するクライアント数: ${settings.clients.length}\n`);
  
  // クライアントを追加
  for (const client of settings.clients) {
    try {
      db.createClient(user.id, {
        name: client.name,
        exporterUrl: client.exporterUrl,
        presetName: client.presetName,
        sheetId: client.sheetId,
        sheetName: client.sheetName,
        email: client.email,
        password: client.password
      });
      console.log(`✅ ${client.name} を追加しました`);
    } catch (e) {
      console.error(`❌ ${client.name} の追加に失敗: ${e.message}`);
    }
  }
  
  // オプションを保存
  if (settings.options) {
    db.saveOptions(user.id, {
      timeout: settings.options.timeout,
      retryCount: settings.options.retryCount,
      retryDelay: settings.options.retryDelay,
      headless: settings.options.headless,
      screenshotOnError: settings.options.screenshotOnError,
      cleanupDownloads: settings.options.cleanupDownloads,
      schedule: settings.schedule
    });
    console.log('\n✅ オプションを移行しました');
  }
  
  console.log('\n🎉 移行完了！');
  console.log('WebUIをリロードしてください。');
}

const email = process.argv[2];

if (!email) {
  console.log('使用方法: node src/migrate-data.js <メールアドレス>');
  console.log('例: node src/migrate-data.js test@example.com');
  process.exit(1);
}

migrate(email).catch(e => {
  console.error('エラー:', e);
  process.exit(1);
});

