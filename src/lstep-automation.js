/**
 * Lステップ自動操作モジュール
 * 
 * 役割:
 * - Lステップのエクスポートページを操作
 * - プリセット選択 → CSV生成 → ダウンロード
 * - エラーハンドリング
 */

import BrowserAutomation from './browser.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LステップからCSVをエクスポート
 * 
 * @param {Object} config - 設定
 * @param {string} config.exporterUrl - エクスポートページURL
 * @param {string} config.presetName - プリセット名
 * @param {Object} options - オプション
 * @returns {Promise<string>} ダウンロードしたCSVファイルのパス
 */
export async function exportCSVFromLStep(config, options = {}) {
  const userDataDir = path.join(__dirname, '../.browser-data');
  
  const browser = new BrowserAutomation({
    ...options,
    userDataDir: userDataDir,
  });
  let downloadedFilePath = null;

  try {
    console.log('========================================');
    console.log('📋 Lステップ CSV エクスポート開始');
    console.log('========================================');
    console.log(`プリセット: ${config.presetName}`);
    console.log(`URL: ${config.exporterUrl}\n`);

    await browser.launch();
    await step1_AccessExporterPage(browser, config.exporterUrl);
    await step2_SelectPresetAndClickGreenButton(browser, config.presetName);
    await step3_ClickBlueButtonToGenerateCSV(browser);
    await step4_ReloadPage(browser, config.exporterUrl);
    downloadedFilePath = await step5_DownloadCSV(browser, config.presetName);

    console.log('\n========================================');
    console.log('✅ CSV エクスポート成功');
    console.log('========================================');
    console.log(`ファイル: ${downloadedFilePath}\n`);

    return downloadedFilePath;

  } catch (error) {
    console.error('\n========================================');
    console.error('❌ CSV エクスポート失敗');
    console.error('========================================');
    console.error(`エラー: ${error.message}\n`);

    if (browser.page) {
      await browser.saveScreenshot('export-error');
      await browser.savePageHTML('export-error');
    }

    throw error;

  } finally {
    await browser.close();
  }
}

async function step1_AccessExporterPage(browser, exporterUrl) {
  console.log('📍 ステップ1: エクスポートページにアクセス');
  
  await browser.goto(exporterUrl, {
    waitUntil: 'networkidle2',
  });

  const title = await browser.page.title();
  console.log(`   ページタイトル: ${title}`);

  const loginForm = await browser.page.$('input[type="password"]');
  if (loginForm) {
    console.log('⚠️  ログインページが表示されています');
    console.log('👉 npm run setup を実行してログインしてください\n');
    throw new Error('ログインが必要です。npm run setup を実行してください。');
  }

  console.log('✅ ステップ1完了\n');
}

async function step2_SelectPresetAndClickGreenButton(browser, presetName) {
  console.log('📍 ステップ2: プリセット選択');
  console.log(`   プリセット名: ${presetName}`);

  const rowXPath = `//tbody/tr[td[contains(text(), "${presetName}")]]`;
  const rows = await browser.page.$x(rowXPath);
  
  if (rows.length === 0) {
    await logAvailablePresets(browser);
    throw new Error(`プリセットが見つかりません: "${presetName}"`);
  }

  console.log(`   ✅ プリセット行を発見 (${rows.length}件)`);

  const targetRow = rows[0];
  const greenButtons = await targetRow.$x('.//a[contains(@class, "btn-success") and contains(text(), "検索条件をコピーして利用")]');

  if (greenButtons.length === 0) {
    await browser.saveScreenshot('green-button-not-found');
    throw new Error('緑ボタンが見つかりません');
  }

  console.log('   🟢 緑ボタンを発見');
  await browser.safeClick(greenButtons[0]);
  
  console.log('   ⏳ ページ遷移を待機中...');
  await browser.page.waitForNavigation({ 
    waitUntil: 'networkidle2',
    timeout: 30000 
  });
  
  console.log('   ✅ ページ遷移完了');
  console.log('✅ ステップ2完了\n');
}

async function step3_ClickBlueButtonToGenerateCSV(browser) {
  console.log('📍 ステップ3: CSV生成リクエスト');

  await browser.page.evaluate(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  });

  await browser.page.waitForTimeout(800);

  const blueButton = await browser.waitForElement('#submit_button', {
    timeout: 30000,
  });

  await browser.page.waitForFunction(
    () => {
      const btn = document.getElementById('submit_button');
      return btn && !btn.disabled && btn.offsetParent !== null;
    },
    { timeout: 30000 }
  );

  console.log('   🔵 青ボタンを発見');
  await browser.safeClick(blueButton);
  await browser.page.waitForTimeout(2000);

  console.log('✅ ステップ3完了\n');
}

async function step4_ReloadPage(browser, exporterUrl) {
  console.log('📍 ステップ4: ページリロード');
  console.log('   ⏳ CSV生成完了を待機中（5秒）...');
  await browser.page.waitForTimeout(5000);
  await browser.goto(exporterUrl, {
    waitUntil: 'networkidle2',
  });
  console.log('✅ ステップ4完了\n');
}

async function step5_DownloadCSV(browser, presetName) {
    console.log('📍 ステップ5: CSV ダウンロード');
    console.log('   📊 エクスポート履歴を検索中...');
  
    const allTables = await browser.page.$$('table');
    console.log(`   🔍 ページ内に ${allTables.length} 個のテーブルがあります`);
    
    // テーブル2（エクスポート履歴）を使用
    if (allTables.length < 2) {
      throw new Error('エクスポート履歴テーブルが見つかりません');
    }
    
    const historyTable = allTables[1]; // テーブル2 = インデックス1
    console.log('   ✅ エクスポート履歴テーブルを発見（テーブル2）');
    console.log(`   🔍 "${presetName}のコピー" を含む最新の履歴を検索中...`);
  
    let downloadButton = null;
    const maxAttempts = 60;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const rows = await historyTable.$$('tbody tr');
      
      if (rows.length === 0) {
        console.log(`   ⚠️ エクスポート履歴が空です (${attempt}/${maxAttempts})`);
        await browser.page.waitForTimeout(1000);
        continue;
      }
      
      console.log(`   🔄 試行 ${attempt}/${maxAttempts}: ${rows.length}行を確認中...`);
      
      // 最新の行（一番上）をチェック
      const row = rows[0];
      const cells = await row.$$('td');
      
      if (cells.length < 6) {
        console.log(`   ⚠️ 行の列数が不足しています: ${cells.length}列`);
        await browser.page.waitForTimeout(1000);
        continue;
      }
      
      // 列2（インデックス1）に名前が入っている
      const nameCell = cells[1];
      const cellText = await nameCell.evaluate(el => el.textContent.trim());
      
      if (attempt === 1 || attempt % 10 === 0) {
        console.log(`      最新行の名前: "${cellText}"`);
      }
      
      // プリセット名 + "のコピー" を含むかチェック
      const expectedPattern = `${presetName}のコピー`;
      if (cellText.includes(expectedPattern)) {
        console.log(`   ✅ 一致する行を発見: "${cellText}"`);
        
        // 列6（インデックス5）にダウンロードボタンがある
        const downloadCell = cells[5];
        const downloadText = await downloadCell.evaluate(el => el.textContent.trim());
        
        console.log(`   📥 ダウンロード列の内容: "${downloadText}"`);
        
        if (downloadText.includes('処理中')) {
          console.log(`   ⏳ CSV生成中... (${attempt}/${maxAttempts})`);
          await browser.page.waitForTimeout(1000);
          continue;
        }
        
        if (downloadText.includes('期限切れ')) {
          console.log(`   ❌ ダウンロード期限切れ`);
          await browser.page.waitForTimeout(1000);
          continue;
        }
        
        if (downloadText.includes('ダウンロード')) {
          console.log(`   ✅ ダウンロード可能を確認`);
          
          // ダウンロードリンクを探す
          const downloadLink = await downloadCell.$('a');
          
          if (downloadLink) {
            downloadButton = downloadLink;
            console.log(`   💙 ダウンロードボタン発見 (${attempt}秒後)`);
            break;
          }
        }
      } else {
        console.log(`   ⏳ 新しいCSVを待機中... (現在の最新: "${cellText}")`);
      }
  
      await browser.page.waitForTimeout(1000);
    }
  
    if (!downloadButton) {
      await browser.saveScreenshot('download-button-timeout');
      await browser.savePageHTML('download-button-timeout');
      throw new Error(`ダウンロードボタンが見つかりませんでした。`);
    }
  
    const downloadPath = path.join(__dirname, '../downloads');
    
    const downloadedFile = await browser.waitForDownload(
      async () => {
        await browser.safeClick(downloadButton);
      },
      downloadPath
    );
  
    console.log('✅ ステップ5完了\n');
    return downloadedFile;
  }

async function logAvailablePresets(browser) {
  try {
    const rows = await browser.page.$$('tbody tr');
    console.log('\n📋 利用可能なプリセット一覧:');
    
    for (const row of rows) {
      const nameCell = await row.$('td:nth-child(2)');
      if (nameCell) {
        const text = await nameCell.evaluate(el => el.textContent.trim());
        console.log(`   - ${text}`);
      }
    }
    console.log('');
  } catch (error) {
    console.log('   (プリセット一覧の取得に失敗)');
  }
}

export default exportCSVFromLStep;