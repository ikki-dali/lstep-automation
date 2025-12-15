#!/usr/bin/env node
/**
 * 自動セットアップスクリプト（WebUI用）
 * 引数: クライアントID, ユーザーID
 */

import BrowserAutomation from './browser.js';
import * as db from './db.js';
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

async function setup(clientId, userId) {
  console.log(`セットアップ開始: ${clientId}`);
  
  // DB初期化
  db.initDB();
  
  // クライアント取得
  const client = db.getClientById(clientId, userId);
  if (!client) {
    console.error('クライアントが見つかりません');
    process.exit(1);
  }
  
  console.log(`クライアント: ${client.name}`);
  
  const loginUrl = client.exporter_url.split('/line/')[0] + '/account/login';
  const profileName = `${userId}-${sanitizeClientName(client.name)}`;
  const userDataDir = path.join(__dirname, '../.browser-data', profileName);
  
  console.log(`ログインURL: ${loginUrl}`);
  console.log(`プロファイル: ${profileName}`);
  
  const browser = new BrowserAutomation({
    headless: false,
    slowMo: 50,
    userDataDir: userDataDir,
  });
  
  try {
    await browser.launch();
    await browser.goto(loginUrl);
    
    // 自動入力
    if (client.email && client.password) {
      console.log('ログイン情報を自動入力中...');
      await new Promise(r => setTimeout(r, 2000));
      
      try {
        const emailSel = 'input[name="email"], input[type="email"]';
        await browser.page.waitForSelector(emailSel, { timeout: 5000 });
        await browser.page.type(emailSel, client.email, { delay: 50 });
        console.log('メールアドレス入力完了');
        
        const passSel = 'input[name="password"], input[type="password"]';
        await browser.page.waitForSelector(passSel, { timeout: 5000 });
        await browser.page.type(passSel, client.password, { delay: 50 });
        console.log('パスワード入力完了');
      } catch (e) {
        console.log(`自動入力エラー: ${e.message}`);
      }
    }
    
    console.log('ブラウザでログインを完了してください（reCAPTCHA対応）');
    console.log('ログイン待機中... (最大5分)');
    
    // ログイン完了待機
    const maxWait = 5 * 60 * 1000;
    const start = Date.now();
    let loggedIn = false;
    
    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 3000));
      const url = browser.page.url();
      
      if (!url.includes('/login') && !url.includes('/account/login')) {
        loggedIn = true;
        console.log(`ログイン成功: ${url}`);
        break;
      }
    }
    
    if (!loggedIn) {
      throw new Error('ログインタイムアウト（5分経過）');
    }
    
    const cookies = await browser.page.cookies();
    console.log(`${cookies.length}個のCookieを保存`);
    
    await new Promise(r => setTimeout(r, 2000));
    console.log(`✅ ${client.name} のセットアップ完了`);
    
  } catch (error) {
    console.error(`セットアップ失敗: ${error.message}`);
    process.exit(1);
  } finally {
    console.log('ブラウザを閉じています...');
    await new Promise(r => setTimeout(r, 2000));
    await browser.close();
  }
}

const clientId = process.argv[2];
const userId = process.argv[3];

if (!clientId || !userId) {
  console.error('使用方法: node setup-auto.js <clientId> <userId>');
  process.exit(1);
}

setup(clientId, userId).catch(e => {
  console.error('エラー:', e);
  process.exit(1);
});
