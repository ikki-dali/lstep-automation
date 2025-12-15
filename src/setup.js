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
  console.log('  1. セットアップするクライアントを選択');
  console.log('  2. ブラウザを起動します（表示されます）');
  console.log('  3. Lステップのログインページを開きます');
  console.log('  4. 手動でログインしてください');
  console.log('  5. ログイン完了後、Enterキーを押してください');
  console.log('  6. ログイン情報（Cookie）が保存されます');
  console.log('\n次回から自動ログインされるようになります。\n');

  // 設定ファイルを読み込み
  const configPath = path.join(__dirname, '../config/settings.json');
  let clients = [];
  let loginUrl = 'https://manager.linestep.net/account/login';

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);

    if (config.clients && config.clients.length > 0) {
      clients = config.clients;
      console.log(`📋 設定ファイルから ${clients.length} 件のクライアントを検出しました\n`);

      // クライアント一覧を表示
      clients.forEach((client, index) => {
        console.log(`  ${index + 1}. ${client.name}`);
      });
      console.log();
    }
  } catch (error) {
    console.log('⚠️  設定ファイルが見つかりません。デフォルトのURLを使用します。\n');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let selectedClient = null;

  if (clients.length > 0) {
    // クライアントを選択
    const answer = await new Promise((resolve) => {
      rl.question(`セットアップするクライアント番号を入力 (1-${clients.length}): `, (answer) => {
        resolve(answer);
      });
    });

    const clientIndex = parseInt(answer) - 1;
    if (clientIndex >= 0 && clientIndex < clients.length) {
      selectedClient = clients[clientIndex];
      const exporterUrl = selectedClient.exporterUrl;
      loginUrl = exporterUrl.split('/line/')[0] + '/account/login';
      console.log(`\n✅ 選択: ${selectedClient.name}`);
      console.log(`🔗 ログインURL: ${loginUrl}\n`);
    } else {
      console.log('⚠️  無効な番号です。デフォルトのURLを使用します。\n');
    }
  }

  // クライアント名からプロファイル名を生成
  const sanitizeClientName = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const profileName = selectedClient ? sanitizeClientName(selectedClient.name) : 'default';
  const userDataDir = path.join(__dirname, '../.browser-data', profileName);

  console.log(`💾 プロファイル: ${profileName}\n`);

  const browser = new BrowserAutomation({
    headless: false, // ブラウザを表示
    slowMo: 50,
    userDataDir: userDataDir,
  });

  try {
    // ブラウザ起動
    console.log('🚀 ブラウザを起動しています...\n');
    await browser.launch();

    // ログインページにアクセス
    console.log(`🌐 ログインページにアクセス: ${loginUrl}\n`);
    await browser.goto(loginUrl);

    // メール/パスワード自動入力
    if (selectedClient && selectedClient.email && selectedClient.password) {
      console.log('🔐 ログイン情報を自動入力します...\n');

      try {
        // ページが完全に読み込まれるまで待機
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 複数のセレクターパターンを試す
        const emailSelectors = [
          'input[name="email"]',
          'input[type="email"]',
          'input[id="email"]',
          'input[placeholder*="メール"]',
          'input[placeholder*="mail"]'
        ];

        const passwordSelectors = [
          'input[name="password"]',
          'input[type="password"]',
          'input[id="password"]',
          'input[placeholder*="パスワード"]'
        ];

        // メールアドレス入力欄を探す
        let emailInput = null;
        for (const selector of emailSelectors) {
          try {
            await browser.page.waitForSelector(selector, { timeout: 2000 });
            emailInput = selector;
            break;
          } catch (e) {
            // 次のセレクターを試す
          }
        }

        if (!emailInput) {
          throw new Error('メールアドレス入力欄が見つかりませんでした');
        }

        // メールアドレスを入力
        await browser.page.click(emailInput);
        await new Promise(resolve => setTimeout(resolve, 300));
        await browser.page.type(emailInput, selectedClient.email, { delay: 50 });
        console.log('   ✅ メールアドレスを入力しました');

        // パスワード入力欄を探す
        let passwordInput = null;
        for (const selector of passwordSelectors) {
          try {
            await browser.page.waitForSelector(selector, { timeout: 2000 });
            passwordInput = selector;
            break;
          } catch (e) {
            // 次のセレクターを試す
          }
        }

        if (!passwordInput) {
          throw new Error('パスワード入力欄が見つかりませんでした');
        }

        // パスワードを入力
        await browser.page.click(passwordInput);
        await new Promise(resolve => setTimeout(resolve, 300));
        await browser.page.type(passwordInput, selectedClient.password, { delay: 50 });
        console.log('   ✅ パスワードを入力しました\n');

        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║                                                            ║');
        console.log('║      👆 reCAPTCHA のチェックをお願いします                  ║');
        console.log('║                                                            ║');
        console.log('║      完了後、このターミナルで Enter を押してください          ║');
        console.log('║                                                            ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('\n');

      } catch (error) {
        console.log(`⚠️  自動入力に失敗しました: ${error.message}`);
        console.log('手動でログインしてください。\n');
      }
    } else {
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║                                                            ║');
      console.log('║           👆 ブラウザで手動ログインしてください               ║');
      console.log('║                                                            ║');
      console.log('║      ログイン完了後、このターミナルで Enter を押してください    ║');
      console.log('║                                                            ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('\n');
    }

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

    if (selectedClient) {
      console.log(`✅ ${selectedClient.name} のログイン情報を保存しました`);
    }

    console.log('\n💡 次のステップ:');
    if (clients.length > 1) {
      console.log('  1. 他のクライアントがあれば、もう一度 npm run setup を実行');
      console.log('  2. npm start で実行テスト');
      console.log('  3. 成功したらcronで定期実行を設定\n');
    } else {
      console.log('  1. npm start で実行テスト');
      console.log('  2. 成功したらcronで定期実行を設定\n');
    }

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