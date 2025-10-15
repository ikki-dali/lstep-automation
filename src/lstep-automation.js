import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BROWSER_DATA_DIR = path.join(process.cwd(), '.browser-data');
const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');
const LOGS_DIR = path.join(process.cwd(), 'logs');

// 環境変数からログイン情報を取得
const LSTEP_EMAIL = process.env.LSTEP_EMAIL;
const LSTEP_PASSWORD = process.env.LSTEP_PASSWORD;

async function ensureDirectories() {
  await fs.mkdir(BROWSER_DATA_DIR, { recursive: true });
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });
}

async function autoLogin(page) {
  console.log('🔐 自動ログインを試行中...');
  
  if (!LSTEP_EMAIL || !LSTEP_PASSWORD) {
    console.log('⚠️  環境変数 LSTEP_EMAIL または LSTEP_PASSWORD が設定されていません');
    return false;
  }

  try {
    // メールアドレス入力
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 5000 });
    await page.type('input[type="email"], input[name="email"]', LSTEP_EMAIL);
    console.log('   ✅ メールアドレス入力完了');

    // パスワード入力
    await page.type('input[type="password"], input[name="password"]', LSTEP_PASSWORD);
    console.log('   ✅ パスワード入力完了');

    // ログインボタンをクリック
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
      page.click('button[type="submit"], input[type="submit"]')
    ]);

    console.log('   ✅ ログイン成功');
    await page.waitForTimeout(2000);
    return true;

  } catch (error) {
    console.error('   ❌ 自動ログイン失敗:', error.message);
    return false;
  }
}

export async function exportCSV(exporterUrl, presetName, options = {}) {
  const {
    timeout = 60000,
    screenshotOnError = true,
    headless = true,
  } = options;

  await ensureDirectories();

  console.log('========================================');
  console.log('�� Lステップ CSV エクスポート開始');
  console.log('========================================');
  console.log(`プリセット: ${presetName}`);
  console.log(`URL: ${exporterUrl}`);

  let browser;
  let downloadedFile = null;

  try {
    console.log('🚀 ブラウザ起動中...');
    
    const launchOptions = {
      headless: headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    };

    // ローカル実行時のみuserDataDirを使用
    if (!process.env.GITHUB_ACTIONS) {
      launchOptions.userDataDir = BROWSER_DATA_DIR;
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    console.log('✅ ブラウザ起動完了');

    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOADS_DIR,
    });

    console.log('📍 ステップ1: エクスポートページにアクセス');
    console.log(`🌐 ページアクセス: ${exporterUrl}`);
    
    await page.goto(exporterUrl, {
      waitUntil: 'networkidle0',
      timeout: timeout,
    });

    console.log('✅ ページ読み込み完了');
    
    const pageTitle = await page.title();
    console.log(`   ページタイトル: ${pageTitle}`);

    // ログインページかチェック
    if (pageTitle.includes('ログイン')) {
      console.log('⚠️  ログインページが表示されています');
      
      // 自動ログインを試行
      const loginSuccess = await autoLogin(page);
      
      if (!loginSuccess) {
        throw new Error('ログインが必要です。環境変数を設定してください。');
      }

      // ログイン後、再度エクスポートページへ
      await page.goto(exporterUrl, {
        waitUntil: 'networkidle0',
        timeout: timeout,
      });
    }

    console.log('📍 ステップ2: プリセット選択');
    
    await page.waitForSelector('select[name="preset"], select.preset-select', { timeout: 10000 });
    
    const presetOptions = await page.evaluate(() => {
      const select = document.querySelector('select[name="preset"], select.preset-select');
      if (!select) return [];
      return Array.from(select.options).map(opt => ({
        value: opt.value,
        text: opt.textContent.trim()
      }));
    });

    console.log(`   利用可能なプリセット: ${presetOptions.length}個`);
    presetOptions.forEach(opt => console.log(`     - ${opt.text}`));

    const targetPreset = presetOptions.find(opt => opt.text === presetName);
    
    if (!targetPreset) {
      throw new Error(`プリセット "${presetName}" が見つかりません`);
    }

    await page.select('select[name="preset"], select.preset-select', targetPreset.value);
    console.log(`✅ プリセット選択完了: ${presetName}`);

    await page.waitForTimeout(1000);

    console.log('📍 ステップ3: エクスポート実行');
    
    await page.click('button[type="submit"], button.export-button, input[type="submit"]');
    console.log('✅ エクスポートボタンクリック');

    console.log('⏳ ダウンロード待機中...');
    
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const files = await fs.readdir(DOWNLOADS_DIR);
      const csvFiles = files.filter(f => f.endsWith('.csv') && !f.endsWith('.crdownload'));
      
      if (csvFiles.length > 0) {
        downloadedFile = path.join(DOWNLOADS_DIR, csvFiles[0]);
        console.log(`✅ ダウンロード完了: ${csvFiles[0]}`);
        break;
      }
      
      await page.waitForTimeout(1000);
    }

    if (!downloadedFile) {
      throw new Error('ダウンロードがタイムアウトしました');
    }

    console.log('========================================');
    console.log('✅ CSV エクスポート成功');
    console.log('========================================');

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

          const htmlPath = path.join(LOGS_DIR, `export-error_${timestamp}.html`);
          const html = await page.content();
          await fs.writeFile(htmlPath, html);
          console.log(`�� HTML保存: ${htmlPath}`);
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
