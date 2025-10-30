import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BROWSER_DATA_DIR = path.join(process.cwd(), '.browser-data');
const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');
const LOGS_DIR = path.join(process.cwd(), 'logs');

const LSTEP_EMAIL = process.env.LSTEP_EMAIL;
const LSTEP_PASSWORD = process.env.LSTEP_PASSWORD;

// Chrome実行パス（環境変数で指定可能、未指定時はPuppeteerのbundled Chromiumを使用）
const CHROME_EXECUTABLE_PATH = process.env.CHROME_EXECUTABLE_PATH;

async function ensureDirectories() {
  await fs.mkdir(BROWSER_DATA_DIR, { recursive: true });
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });
}

async function waitForLogin(page) {
  console.log('⏸️  ログインが必要です');
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  🔐 人間の操作が必要です                                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('開いたブラウザで以下を行ってください:');
  console.log('  1. メールアドレスを入力');
  console.log('  2. パスワードを入力');
  console.log('  3. reCAPTCHAのチェックボックスをクリック');
  console.log('  4. ログインボタンをクリック');
  console.log('');
  console.log('⏳ ログイン完了を待機中...');
  
  let loginCompleted = false;
  const startTime = Date.now();
  const timeout = 180000;
  
  while (!loginCompleted && Date.now() - startTime < timeout) {
    try {
      const currentTitle = await page.title();
      const currentUrl = page.url();
      
      if (!currentTitle.includes('ログイン') && !currentUrl.includes('login')) {
        loginCompleted = true;
        console.log('');
        console.log('✅ ログイン完了を検出しました');
        break;
      }
      
      await page.waitForTimeout(1000);
    } catch (error) {
      await page.waitForTimeout(1000);
    }
  }
  
  if (!loginCompleted) {
    throw new Error('ログインがタイムアウトしました（3分）');
  }
  
  await page.waitForTimeout(2000);
  return true;
}

async function navigateToExportPage(page, browser) {
  console.log('�� 友達リストからエクスポートページへ移動中...');
  
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  
  console.log('   🔍 「CSV操作」ボタンを探しています...');
  await page.waitForSelector('text/CSV操作', { timeout: 10000 });
  await page.click('text/CSV操作');
  console.log('   ✅ 「CSV操作」ボタンをクリックしました');
  await page.waitForTimeout(2000);
  
  const pages = await browser.pages();
  const newPage = pages[pages.length - 1];
  
  console.log('   🔍 「CSVエクスポートリスト」ボタンを探しています...');
  await newPage.waitForSelector('text/CSVエクスポートリスト', { timeout: 10000 });
  await newPage.click('text/CSVエクスポートリスト');
  console.log('   ✅ 「CSVエクスポートリスト」ボタンをクリックしました');
  await newPage.waitForTimeout(5000);
  
  const allPages = await browser.pages();
  const exportPage = allPages[allPages.length - 1];
  
  console.log('✅ エクスポートページに到達しました');
  
  return exportPage;
}

export async function exportCSV(exporterUrl, presetName, options = {}) {
  const {
    timeout = 60000,
    screenshotOnError = true,
    headless = true,
  } = options;

  await ensureDirectories();

  console.log('========================================');
  console.log('📋 Lステップ CSV エクスポート開始');
  console.log('========================================');
  console.log(`プリセット: ${presetName}`);
  console.log(`URL: ${exporterUrl}`);

  let browser;
  let downloadedFile = null;

  try {
    // ブラウザを起動
    console.log('🚀 ブラウザ起動中...');

    const launchOptions = {
      headless: headless === true ? 'new' : headless,
      userDataDir: BROWSER_DATA_DIR,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ],
    };

    // 環境変数でChrome実行パスが指定されている場合のみ設定
    if (CHROME_EXECUTABLE_PATH) {
      launchOptions.executablePath = CHROME_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchOptions);

    let page = await browser.newPage();
    console.log('✅ ブラウザ起動完了');

    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOADS_DIR,
    });

    console.log('📍 ステップ1: エクスポートページにアクセス');

    await page.goto(exporterUrl, {
      waitUntil: 'networkidle0',
      timeout: timeout,
    });

    let currentPageTitle = await page.title();
    console.log(`   ページタイトル: ${currentPageTitle}`);

    if (currentPageTitle.includes('ログイン')) {
      // CI環境（GitHub Actions等）ではログインできないのでエラー
      if (process.env.CI) {
        throw new Error('ログインセッションが期限切れです。CI環境ではログインできません。ローカル環境で npm run setup を実行してセッションを更新してください。');
      }

      // ログインが必要な場合、ヘッドレスモードだったら再起動
      if (headless) {
        console.log('⚠️  ログインセッションが期限切れです');
        console.log('⚠️  ブラウザを表示モードで再起動します...');

        // 現在のブラウザを閉じる
        await browser.close();

        // 表示モードで再起動
        const visibleLaunchOptions = {
          headless: false,
          userDataDir: BROWSER_DATA_DIR,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
          ],
        };

        if (CHROME_EXECUTABLE_PATH) {
          visibleLaunchOptions.executablePath = CHROME_EXECUTABLE_PATH;
        }

        browser = await puppeteer.launch(visibleLaunchOptions);
        page = await browser.newPage();

        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: DOWNLOADS_DIR,
        });

        await page.goto(exporterUrl, {
          waitUntil: 'networkidle0',
          timeout: timeout,
        });
      }

      await waitForLogin(page);

      await page.goto(exporterUrl, {
        waitUntil: 'networkidle0',
        timeout: timeout,
      });

      currentPageTitle = await page.title();
      console.log(`   ログイン後のページタイトル: ${currentPageTitle}`);
    }

    let currentUrl = page.url();
    console.log(`   現在のURL: ${currentUrl}`);

    if (currentUrl.includes('/friend') || currentUrl.includes('/line/show') || currentPageTitle.includes('友だち')) {
      const exportPage = await navigateToExportPage(page, browser);

      await exportPage.waitForTimeout(2000);

      console.log(`   新しいページURL: ${exportPage.url()}`);
      const newTitle = await exportPage.title();
      console.log(`   新しいページタイトル: ${newTitle}`);

      page = exportPage;
    }

    if (headless) {
      console.log('📌 ヘッドレスモードで実行中（ブラウザ非表示）');
    } else {
      console.log('📌 ブラウザ表示モードで実行中');
    }

    console.log('📍 ステップ2: プリセット選択');
    
    await page.waitForTimeout(5000);
    
    const readyState = await page.evaluate(() => document.readyState);
    console.log(`   ページ状態: ${readyState}`);
    
    if (readyState !== 'complete') {
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });
    }
    
    console.log(`   🔍 プリセット「${presetName}」を探しています...`);

    // デバッグ: ページ内のすべてのプリセット名を表示
    const allPresets = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      return rows.map(row => row.textContent.trim()).filter(text => text.length > 0);
    });

    console.log('   📋 ページ内のプリセット一覧（最初の5件）:');
    allPresets.slice(0, 5).forEach((text, i) => {
      console.log(`      ${i + 1}: ${text.substring(0, 150)}`);
    });

    const result = await page.evaluate((presetName) => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const foundPresets = [];
      const foundButtons = [];
      let presetRowIndex = -1;

      // 方法1: プリセット名を含む行を探す
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const text = row.textContent;

        if (text.includes(presetName)) {
          presetRowIndex = i;
          foundPresets.push(text.trim().substring(0, 100));
          const buttons = row.querySelectorAll('button, a');

          for (const button of buttons) {
            const buttonText = button.textContent || button.innerText || '';
            const buttonInfo = {
              text: buttonText.trim(),
              className: button.className,
              html: button.innerHTML.substring(0, 100)
            };
            foundButtons.push(buttonInfo);

            // プリセット選択ボタンを探す（コピーボタンでもOK）
            if (buttonText.includes('表示項目') && buttonText.includes('コピー')) {
              button.click();
              return {
                success: true,
                method: '同じ行内のボタン',
                presetText: text.trim().substring(0, 100),
                buttonText: buttonText.trim(),
                buttonClass: button.className
              };
            } else if (!buttonText.includes('コピー') && !buttonText.includes('copy')) {
              if (buttonText.includes('CSVエクスポート') ||
                  buttonText.includes('エクスポート') ||
                  (buttonText.includes('CSV') && !buttonText.includes('表示項目')) ||
                  button.className.includes('export') ||
                  button.className.includes('csv')) {
                button.click();
                return {
                  success: true,
                  method: '同じ行内のボタン',
                  presetText: text.trim().substring(0, 100),
                  buttonText: buttonText.trim(),
                  buttonClass: button.className
                };
              }
            }
          }
        }
      }

      // 方法2: プリセット名が見つかった場合、次の行や親要素も探す
      if (presetRowIndex >= 0 && presetRowIndex < rows.length - 1) {
        // 次の行のボタンを探す
        const nextRow = rows[presetRowIndex + 1];
        const buttons = nextRow.querySelectorAll('button, a');

        for (const button of buttons) {
          const buttonText = button.textContent || button.innerText || '';

          if (!buttonText.includes('コピー') && !buttonText.includes('copy')) {
            if (buttonText.includes('CSVエクスポート') ||
                buttonText.includes('エクスポート') ||
                (buttonText.includes('CSV') && !buttonText.includes('表示項目')) ||
                button.className.includes('export') ||
                button.className.includes('csv')) {
              button.click();
              return {
                success: true,
                method: '次の行のボタン',
                presetText: foundPresets[0],
                buttonText: buttonText.trim(),
                buttonClass: button.className
              };
            }
          }
        }
      }

      // 方法3: プリセット名が見つかった場合、親要素全体からボタンを探す
      if (presetRowIndex >= 0) {
        const presetRow = rows[presetRowIndex];
        const parent = presetRow.closest('table, tbody');
        if (parent) {
          const allButtons = parent.querySelectorAll('button, a');
          for (const button of allButtons) {
            const buttonText = button.textContent || button.innerText || '';

            // プリセット名の近くにあるボタンを探す
            const buttonRow = button.closest('tr');
            if (buttonRow) {
              const rowIndex = Array.from(rows).indexOf(buttonRow);
              // プリセット行の前後2行以内
              if (Math.abs(rowIndex - presetRowIndex) <= 2) {
                if (!buttonText.includes('コピー') && !buttonText.includes('copy')) {
                  if (buttonText.includes('CSVエクスポート') ||
                      buttonText.includes('エクスポート') ||
                      (buttonText.includes('CSV') && !buttonText.includes('表示項目'))) {
                    button.click();
                    return {
                      success: true,
                      method: '近くの行のボタン（行差: ' + (rowIndex - presetRowIndex) + '）',
                      presetText: foundPresets[0],
                      buttonText: buttonText.trim(),
                      buttonClass: button.className
                    };
                  }
                }
              }
            }
          }
        }
      }

      return { success: false, foundPresets, foundButtons };
    }, presetName);

    if (!result.success) {
      console.error(`   ❌ プリセットが見つかりませんでした`);
      if (result.foundPresets.length > 0) {
        console.error(`   見つかった候補行: ${result.foundPresets.length}件`);
        result.foundPresets.forEach((preset, i) => {
          console.error(`      ${i + 1}: ${preset}`);
        });
        console.error(`   見つかったボタン: ${result.foundButtons.length}件`);
        result.foundButtons.forEach((btn, i) => {
          console.error(`      ${i + 1}: テキスト="${btn.text}", クラス="${btn.className}", HTML="${btn.html}"`);
        });
      } else {
        console.error(`   プリセット名「${presetName}」を含む行が見つかりませんでした`);
        console.error(`   ページ内の全プリセット（最初の10件）:`);
        allPresets.slice(0, 10).forEach((text, i) => {
          console.error(`      ${i + 1}: ${text.substring(0, 200)}`);
        });
      }

      // スクリーンショットを保存してデバッグしやすくする
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const screenshotPath = path.join(LOGS_DIR, `preset-not-found_${timestamp}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`   📸 スクリーンショット保存: ${screenshotPath}`);

      throw new Error(`プリセット "${presetName}" のエクスポートボタンが見つかりません`);
    }

    console.log(`   ✅ 検出方法: ${result.method}`);
    console.log(`   ✅ 見つかった行: ${result.presetText}`);
    console.log(`   ✅ クリックしたボタン: ${result.buttonText}`);

    // ページ遷移を待つ
    console.log('   ⏳ ページ遷移を待機中...');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {
      console.log('   ℹ️  ナビゲーションイベントなし（同じページ内の可能性）');
    });
    await page.waitForTimeout(2000);

    console.log('📍 ステップ3: エクスポート実行');

    // 「この条件でダウンロード」ボタンを探す
    console.log('   🔍 「この条件でダウンロード」ボタンを探しています...');

    const downloadButtonFound = await page.evaluate(() => {
      // テキストで「ダウンロード」を含むボタンを探す
      const buttons = Array.from(document.querySelectorAll('button, a'));

      for (const button of buttons) {
        const buttonText = button.textContent || button.innerText || '';

        if (buttonText.includes('ダウンロード') || buttonText.includes('download')) {
          button.click();
          return { found: true, text: buttonText.trim() };
        }
      }

      return { found: false };
    });

    if (!downloadButtonFound.found) {
      // スクリーンショットを保存
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const screenshotPath = path.join(LOGS_DIR, `download-button-not-found_${timestamp}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`   📸 スクリーンショット保存: ${screenshotPath}`);
      throw new Error('「ダウンロード」ボタンが見つかりません');
    }

    console.log(`   ✅ 「${downloadButtonFound.text}」ボタンをクリックしました`);
    console.log('   ℹ️  CSV生成リクエストを送信しました');

    console.log('📍 ステップ4: CSV生成完了を待機');
    console.log('   ⏳ サーバー側でCSV生成中...');

    // CSV生成を待つ（サーバー処理時間を考慮）
    await page.waitForTimeout(5000);

    // ページをリロードしてエクスポート履歴を最新化
    console.log('   🔄 ページをリロードして履歴を更新中...');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForTimeout(3000);

    console.log('📍 ステップ5: エクスポート履歴からダウンロード');
    console.log('   🔍 エクスポート履歴テーブルを探しています...');

    // エクスポート履歴テーブルから一番上の行のダウンロードボタンをクリック
    const historyDownloadResult = await page.evaluate((presetName) => {
      // テーブルを探す
      const tables = Array.from(document.querySelectorAll('table'));
      let foundRows = [];

      for (const table of tables) {
        const rows = Array.from(table.querySelectorAll('tr'));

        // 一番上のデータ行を探す（ヘッダー行を除く）
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i];
          const rowText = row.textContent;

          // プリセット名を含む行、または「コピー」を含む行を探す
          // 数字付き（例：コピー150）も検出できるように柔軟に
          if (rowText.includes(presetName) ||
              (rowText.includes('コピー') && rowText.match(/\d+/))) {

            foundRows.push({ index: i, text: rowText.trim().substring(0, 100) });

            // その行のダウンロードボタンを探す
            const buttons = Array.from(row.querySelectorAll('button, a'));

            // 右端のボタンから順に探す（一番右が「ダウンロード」ボタンの可能性が高い）
            for (let j = buttons.length - 1; j >= 0; j--) {
              const button = buttons[j];
              const buttonText = button.textContent || button.innerText || '';
              const buttonClass = button.className || '';

              // 「表示項目」「コピー」を含むボタンは除外（これらは黄緑ボタン）
              if (buttonText.includes('表示項目') ||
                  buttonText.includes('コピー') ||
                  buttonText.includes('copy')) {
                continue;
              }

              // 純粋に「ダウンロード」を含むボタンを探す（水色ボタン）
              if (buttonText.includes('ダウンロード') || buttonText.includes('download')) {
                button.click();
                return {
                  found: true,
                  rowText: rowText.trim().substring(0, 100),
                  buttonText: buttonText.trim(),
                  buttonClass: buttonClass,
                  rowIndex: i
                };
              }
            }
          }
        }
      }

      return { found: false, foundRows };
    }, presetName);

    if (!historyDownloadResult.found) {
      console.error(`   ❌ エクスポート履歴のダウンロードボタンが見つかりませんでした`);

      if (historyDownloadResult.foundRows && historyDownloadResult.foundRows.length > 0) {
        console.error(`   見つかった候補行: ${historyDownloadResult.foundRows.length}件`);
        historyDownloadResult.foundRows.forEach((row) => {
          console.error(`      行${row.index}: ${row.text}`);
        });
      } else {
        console.error(`   プリセット名「${presetName}」またはコピーを含む行が見つかりませんでした`);
      }

      // スクリーンショットを保存
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const screenshotPath = path.join(LOGS_DIR, `history-download-not-found_${timestamp}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`   📸 スクリーンショット保存: ${screenshotPath}`);
      throw new Error('エクスポート履歴のダウンロードボタンが見つかりません');
    }

    console.log(`   ✅ 履歴行: ${historyDownloadResult.rowText}`);
    console.log(`   ✅ ダウンロードボタンをクリック: ${historyDownloadResult.buttonText}`);

    console.log('📍 ステップ6: ファイルダウンロード待機');
    console.log('   ⏳ ダウンロード中...');

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const files = await fs.readdir(DOWNLOADS_DIR);
      const csvFiles = files.filter(f => f.endsWith('.csv') && !f.endsWith('.crdownload'));

      if (csvFiles.length > 0) {
        downloadedFile = path.join(DOWNLOADS_DIR, csvFiles[0]);
        console.log(`   ✅ ダウンロード完了: ${csvFiles[0]}`);
        break;
      }

      await page.waitForTimeout(1000);
    }

    if (!downloadedFile) {
      throw new Error('ダウンロードがタイムアウトしました');
    }

    console.log('');
    console.log('========================================');
    console.log('✅ CSV エクスポート成功');
    console.log('========================================');
    console.log(`📂 ファイルパス: ${downloadedFile}`);
    console.log('');

    return downloadedFile;

  } catch (error) {
    console.log('========================================');
    console.log('❌ CSV エクスポート失敗');
    console.log('========================================');
    console.error(`エラー: ${error.message}`);

    if (screenshotOnError && browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          const page = pages[pages.length - 1];
          const timestamp = new Date().toISOString().replace(/:/g, '-');
          const screenshotPath = path.join(LOGS_DIR, `export-error_${timestamp}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`📸 スクリーンショット保存: ${screenshotPath}`);
        }
      } catch (screenshotError) {
        console.error('スクリーンショット保存失敗:', screenshotError.message);
      }
    }

    throw error;

  } finally {
    if (browser) {
      console.log('🔒 ブラウザを閉じています...');
      await browser.close();
      console.log('✅ ブラウザを閉じました');
    }
  }
}

export default { exportCSV };
