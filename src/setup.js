#!/usr/bin/env node
/**
 * 初回セットアップスクリプト
 * 
 * 役割:
 * - Lステップに手動ログイン
 * - Cookieを保存
 * - 次回から自動ログイン可能に
 */

import BrowserAutomation from './browser.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setup() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║              初回セットアップ - ログイン保存                 ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  console.log('このスクリプトは以下を行います:');
  console.log('  1. ブラウザを起動します（表示されます）');
  console.log('  2. Lステップのログインページを開きます');
  console.log('  3. 手動でログインしてください');
  console.log('  4. ログイン完了後、Enterキーを押してください');
  console.log('  5. ログイン情報（Cookie）が保存されます');
  console.log('\n次回から自動ログインされるようになります。\n');

  // 設定ファイルを読み込み
  const configPath = path.join(__dirname, '../config/settings.json');
  let loginUrl = 'https://manager.linestep.net/account/login';

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    
    if (config.clients && config.clients.length > 0) {
      // 最初のクライアントのURLを使用
      const exporterUrl = config.clients[0].exporterUrl;
      // ログインページのURLを推測
      loginUrl = exporterUrl.split('/line/')[0] + '/account/login';
      console.log(`📋 設定ファイルからログインURLを取得: ${loginUrl}\n`);
    }
  } catch (error) {
    console.log('⚠️  設定ファイルが見つかりません。デフォルトのURLを使用します。\n');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const browser = new BrowserAutomation({
    headless: false, // ブラウザを表示
    slowMo: 50,
  });

  try {
    // ブラウザ起動
    console.log('🚀 ブラウザを起動しています...\n');
    await browser.launch();

    // ログインページにアクセス
    console.log(`🌐 ログインページにアクセス: ${loginUrl}\n`);
    await browser.goto(loginUrl);

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                                                            ║');
    console.log('║           👆 ブラウザで手動ログインしてください               ║');
    console.log('║                                                            ║');
    console.log('║      ログイン完了後、このターミナルで Enter を押してください    ║');
    console.log('║                                                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n');

    // Enterキー待ち
    await new Promise((resolve) => {
      rl.question('✅ ログインが完了したら Enter キーを押してください... ', () => {
        resolve();
      });
    });

    console.log('\n✅ ログイン情報を保存しています...\n');

    // ログイン状態を確認
    const cookies = await browser.page.cookies();
    
    if (cookies.length === 0) {
      throw new Error('Cookieが保存されていません。ログインに失敗した可能性があります。');
    }

    console.log(`📝 ${cookies.length}個のCookieを保存しました`);

    // Cookie保存先を表示
    const userDataDir = browser.options.userDataDir;
    console.log(`💾 保存先: ${userDataDir}`);

    // 確認のためページタイトルを取得
    const title = await browser.page.title();
    console.log(`📄 現在のページ: ${title}`);

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                                                            ║');
    console.log('║                  ✅ セットアップ完了！                       ║');
    console.log('║                                                            ║');
    console.log('║       次回から npm start で自動ログインされます               ║');
    console.log('║                                                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n');

    console.log('💡 次のステップ:');
    console.log('  1. config/settings.json を確認・編集');
    console.log('  2. npm start で実行テスト');
    console.log('  3. 成功したらcronで定期実行を設定\n');

  } catch (error) {
    console.error('\n❌ セットアップに失敗しました');
    console.error(`エラー: ${error.message}\n`);
    
    console.error('💡 トラブルシューティング:');
    console.error('  1. ログインページが正しく開いたか確認');
    console.error('  2. ログインが完了してから Enter を押したか確認');
    console.error('  3. ネットワーク接続を確認');
    console.error('  4. もう一度 npm run setup を実行\n');
    
    process.exit(1);
    
  } finally {
    rl.close();
    
    // 5秒後にブラウザを閉じる
    console.log('ブラウザは5秒後に自動で閉じます...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    await browser.close();
  }
}

// スクリプト実行
setup().catch(error => {
  console.error('予期しないエラー:', error);
  process.exit(1);
});