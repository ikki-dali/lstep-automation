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
    
    // ページにアカウント情報オーバーレイを表示
    await new Promise(r => setTimeout(r, 2000));
    
    await browser.page.evaluate((clientName, email, password) => {
      // オーバーレイを作成
      const overlay = document.createElement('div');
      overlay.id = 'lstep-setup-overlay';
      overlay.innerHTML = `
        <div style="
          position: fixed;
          top: 10px;
          right: 10px;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          color: white;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          z-index: 999999;
          font-family: -apple-system, sans-serif;
          max-width: 350px;
          border: 1px solid rgba(78, 205, 196, 0.3);
        ">
          <div style="font-size: 14px; color: #4ecdc4; margin-bottom: 12px; font-weight: bold;">
            📋 ${clientName} のセットアップ
          </div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.7); margin-bottom: 8px;">
            以下のアカウントでログインしてください：
          </div>
          <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
            <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-bottom: 4px;">ID</div>
            <div style="font-size: 14px; color: #fff; font-family: monospace; word-break: break-all;">${email}</div>
          </div>
          <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
            <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-bottom: 4px;">パスワード</div>
            <div style="font-size: 14px; color: #fff; font-family: monospace;">${password}</div>
          </div>
          <div style="font-size: 11px; color: #4ecdc4; text-align: center;">
            ✓ reCAPTCHAを完了 → ログインボタン
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }, client.name, client.email || '(未設定)', client.password || '(未設定)');

    // 自動入力も試みる
    if (client.email && client.password) {
      console.log('ログイン情報を自動入力中...');

      try {
        // ユーザーIDの入力欄を探す（Lステップは "ユーザーID" というラベル）
        const idSelectors = [
          'input[name="email"]',
          'input[type="email"]',
          'input[name="user_id"]',
          'input[name="login_id"]',
          'input:not([type="password"]):not([type="hidden"]):not([type="submit"])'
        ];
        
        for (const sel of idSelectors) {
          try {
            const el = await browser.page.$(sel);
            if (el) {
              await el.click();
              await browser.page.keyboard.type(client.email, { delay: 30 });
              console.log('ID入力完了');
              break;
            }
          } catch (e) {}
        }

        // パスワード入力
        const passSel = 'input[type="password"]';
        try {
          await browser.page.waitForSelector(passSel, { timeout: 3000 });
          await browser.page.click(passSel);
          await browser.page.keyboard.type(client.password, { delay: 30 });
          console.log('パスワード入力完了');
        } catch (e) {}
      } catch (e) {
        console.log(`自動入力スキップ: ${e.message}`);
      }
    }

    console.log('ブラウザでreCAPTCHAを完了してログインしてください');
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
