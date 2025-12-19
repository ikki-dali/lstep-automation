import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');
const LOGS_DIR = path.join(process.cwd(), 'logs');

// クライアント名からブラウザプロファイル名を生成
function sanitizeClientName(clientName) {
  return clientName
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// クライアントごとのブラウザデータディレクトリを取得
function getBrowserDataDir(clientName) {
  const profileName = sanitizeClientName(clientName);
  return path.join(process.cwd(), '.browser-data', profileName);
}

const LSTEP_EMAIL = process.env.LSTEP_EMAIL;
const LSTEP_PASSWORD = process.env.LSTEP_PASSWORD;

// Chrome実行パス（環境変数で指定可能、未指定時はPuppeteerのbundled Chromiumを使用）
const CHROME_EXECUTABLE_PATH = process.env.CHROME_EXECUTABLE_PATH;

// ヘルパー関数: 遅延
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function cleanupBrowserLocks(browserDataDir) {
  // ブラウザのロックファイルを削除（起動失敗の原因になることがある）
  const lockFiles = [
    'SingletonLock',
    'SingletonSocket',
    'SingletonCookie',
    'DevToolsActivePort'
  ];

  for (const lockFile of lockFiles) {
    const lockPath = path.join(browserDataDir, lockFile);
    try {
      await fs.unlink(lockPath);
    } catch (error) {
      // ファイルが存在しない場合はエラーを無視
      if (error.code !== 'ENOENT') {
        console.log(`   ⚠️  Warning: Could not remove ${lockFile}: ${error.message}`);
      }
    }
  }
}

async function ensureDirectories(browserDataDir) {
  await fs.mkdir(browserDataDir, { recursive: true });
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });

  // ロックファイルをクリーンアップ
  await cleanupBrowserLocks(browserDataDir);
}

async function launchBrowserWithRetry(launchOptions, maxRetries = 2) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   試行 ${attempt}/${maxRetries}: ブラウザを起動中...`);
      const browser = await puppeteer.launch(launchOptions);
      console.log('   ✅ ブラウザ起動成功');
      return browser;
    } catch (error) {
      lastError = error;
      console.log(`   ❌ 試行 ${attempt}/${maxRetries} 失敗: ${error.message}`);

      if (attempt < maxRetries) {
        console.log('   ⏳ 3秒後に再試行します...');
        await delay(3000);

        // リトライ前にロックファイルを再度クリーンアップ
        if (launchOptions.userDataDir) {
          await cleanupBrowserLocks(launchOptions.userDataDir);
        }
      }
    }
  }

  throw new Error(`ブラウザの起動に失敗しました (${maxRetries}回試行): ${lastError.message}`);
}

async function waitForLogin(page, email = null, password = null) {
  console.log('⏸️  ログインが必要です');
  console.log('');

  // メールとパスワードが提供されている場合は自動入力
  if (email && password) {
    console.log('🔐 ログイン情報を自動入力します...');

    try {
      // ページが完全に読み込まれるまで待機
      await delay(2000);

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
          await page.waitForSelector(selector, { timeout: 2000 });
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
      await page.click(emailInput);
      await delay(300);
      await page.type(emailInput, email, { delay: 50 });
      console.log('   ✅ メールアドレスを入力しました');

      // パスワード入力欄を探す
      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
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
      await page.click(passwordInput);
      await delay(300);
      await page.type(passwordInput, password, { delay: 50 });
      console.log('   ✅ パスワードを入力しました');

      console.log('');
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║                                                            ║');
      console.log('║      👆 reCAPTCHA のチェックをお願いします                  ║');
      console.log('║                                                            ║');
      console.log('║      チェック完了後、自動的にログインします                  ║');
      console.log('║                                                            ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('');

      // reCAPTCHAが完了するまで待機（チェックボックスがチェックされるのを待つ）
      await page.waitForFunction(
        () => {
          const recaptcha = document.querySelector('.recaptcha-checkbox');
          return recaptcha && recaptcha.getAttribute('aria-checked') === 'true';
        },
        { timeout: 180000 }
      );

      console.log('   ✅ reCAPTCHA完了を検出しました');

      // ログインボタンをクリック
      await delay(1000);

      // 複数のログインボタンセレクターを試す
      const loginButtonSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button.login-button',
        'button.btn-login',
        'a.btn-login'
      ];

      let buttonClicked = false;
      for (const selector of loginButtonSelectors) {
        try {
          await page.click(selector, { timeout: 2000 });
          buttonClicked = true;
          break;
        } catch (e) {
          // 次のセレクターを試す
        }
      }

      if (buttonClicked) {
        console.log('   ✅ ログインボタンをクリックしました');
      } else {
        console.log('   ⚠️  ログインボタンが見つからなかったため、Enterキーを押します');
        await page.keyboard.press('Enter');
      }

      console.log('');

    } catch (error) {
      console.log('⚠️  自動入力に失敗しました。手動でログインしてください。');
      console.log(`エラー: ${error.message}`);
    }
  } else {
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
  }

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
      
      await delay(1000);
    } catch (error) {
      await delay(1000);
    }
  }
  
  if (!loginCompleted) {
    throw new Error('ログインがタイムアウトしました（3分）');
  }
  
  await delay(2000);
  return true;
}

// LINE公式アカウントを切り替える
async function switchLineAccount(page, targetAccountName) {
  console.log(`🔄 LINE公式アカウントを切り替え中: ${targetAccountName}`);
  
  try {
    // ヘッダー右端のアカウントドロップダウンをクリック
    let dropdownOpened = false;
    
    // 方法1: 一番右のheadlessuiボタン（アカウント切り替えメニュー）
    // ？ヘルプボタンは左、アカウントボタンは右にあるので、最後のボタンを取得
    try {
      const menuButtons = await page.$$('button[id^="headlessui-menu-button"]');
      if (menuButtons.length > 0) {
        // 一番右（最後）のボタンを取得
        const accountButton = menuButtons[menuButtons.length - 1];
        const text = await page.evaluate(el => el.textContent?.trim(), accountButton);
        await accountButton.click();
        await delay(1500);
        console.log(`   📂 ドロップダウンを開きました（${text}）`);
        dropdownOpened = true;
      }
    } catch (e) {
      // 方法2に進む
    }
    
    // 方法2: 「切り替え」を含むメニューが出るボタンを探す
    if (!dropdownOpened) {
      try {
        const allButtons = await page.$$('header button, nav button');
        for (const btn of allButtons) {
          const text = await page.evaluate(el => el.textContent?.trim(), btn);
          // ？や送信数は除外
          if (text && !text.includes('？') && !text.includes('送信') && text.length > 2) {
            await btn.click();
            await delay(1500);
            console.log(`   📂 ドロップダウンを開きました（${text}）`);
            dropdownOpened = true;
            break;
          }
        }
      } catch (e) {
        // 続行
      }
    }
    
    // メニューが完全に開くまで待つ
    await delay(1500);
    
    // 「○○に切り替え」のリンクを直接探す（メニューコンテナではなく、個別のリンク）
    // 正規化関数
    const normalize = (str) => str.toLowerCase().replace(/[-－ー\s　【】]/g, '');
    const targetNorm = normalize(targetAccountName);
    
    // 全てのリンクから「○○に切り替え」を探す
    const allLinks = await page.$$('a, button');
    const switchLinks = [];
    
    for (const link of allLinks) {
      const text = await page.evaluate(el => el.textContent?.trim(), link);
      if (text && text.includes('に切り替え') && text.length < 50) {
        switchLinks.push({ element: link, text });
      }
    }
    
    console.log(`   📋 見つかった切り替えリンク: ${switchLinks.map(l => l.text).join(', ')}`);
    
    // ターゲットアカウント名に最も近いリンクを探す
    for (const { element, text } of switchLinks) {
      // 「○○に切り替え」から「○○」を抽出
      const accountName = text.replace('に切り替え', '').trim();
      const accountNorm = normalize(accountName);
      
      console.log(`   🔍 比較: "${accountName}" vs "${targetAccountName}"`);
      
      // 部分一致チェック
      if (accountNorm.includes(targetNorm) || targetNorm.includes(accountNorm)) {
        console.log(`   ✅ 「${text}」をクリック`);
        await element.click();
        await delay(3000);
        
        // ページ遷移を待つ
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
        
        console.log(`   ✅ アカウント切り替え完了`);
        return true;
      }
    }
    
    console.log(`   ⚠️ 「${targetAccountName}」の切り替えメニューが見つかりません（現在のアカウントで続行）`);
    return false;
    
  } catch (error) {
    console.log(`   ⚠️ アカウント切り替えに失敗: ${error.message}`);
    return false;
  }
}

/**
 * プリセット選択からCSVダウンロードまでを実行
 */
async function selectPresetAndExport(page, presetName, timeout = 60000) {
  await delay(3000);
  
  console.log(`   🔍 プリセット「${presetName}」を探しています...`);

  const result = await page.evaluate((presetName) => {
    const rows = Array.from(document.querySelectorAll('tr'));
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const text = row.textContent;

      if (text.includes(presetName)) {
        const buttons = row.querySelectorAll('button, a');
        
        for (const button of buttons) {
          const buttonText = button.textContent || button.innerText || '';
          
          // 「表示項目をコピー」ボタンを探す
          if (buttonText.includes('表示項目') && buttonText.includes('コピー')) {
            button.click();
            return { success: true, method: 'コピーボタン', buttonText: buttonText.trim() };
          }
          
          // CSVエクスポートボタンを探す
          if (!buttonText.includes('コピー') && 
              (buttonText.includes('CSVエクスポート') || buttonText.includes('エクスポート'))) {
            button.click();
            return { success: true, method: 'エクスポートボタン', buttonText: buttonText.trim() };
          }
        }
      }
    }
    return { success: false };
  }, presetName);

  if (!result.success) {
    throw new Error(`プリセット "${presetName}" のボタンが見つかりません`);
  }

  console.log(`   ✅ ${result.method}をクリック: ${result.buttonText}`);

  // ページ遷移を待つ
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
  await delay(2000);

  // 「この条件でダウンロード」ボタンを探してクリック
  console.log('   🔍 「ダウンロード」ボタンを探しています...');
  
  const downloadClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    for (const button of buttons) {
      const text = button.textContent || button.innerText || '';
      if (text.includes('ダウンロード') || text.includes('download')) {
        button.click();
        return { success: true, text: text.trim() };
      }
    }
    return { success: false };
  });

  if (!downloadClicked.success) {
    throw new Error('「ダウンロード」ボタンが見つかりません');
  }

  console.log(`   ✅ 「${downloadClicked.text}」をクリック`);

  // CSV生成を待つ
  console.log('   ⏳ CSV生成中...');
  await delay(5000);

  // ページをリロード
  await page.reload({ waitUntil: 'networkidle0' });
  await delay(3000);

  // 履歴からダウンロード
  console.log('   🔍 エクスポート履歴からダウンロードボタンを探しています...');
  
  const historyDownload = await page.evaluate((presetName) => {
    const tables = Array.from(document.querySelectorAll('table'));
    
    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll('tr'));
      
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i];
        const rowText = row.textContent;
        
        if (rowText.includes(presetName) || (rowText.includes('コピー') && rowText.match(/\d+/))) {
          const buttons = Array.from(row.querySelectorAll('button, a'));
          
          for (let j = buttons.length - 1; j >= 0; j--) {
            const button = buttons[j];
            const buttonText = button.textContent || '';
            
            if (buttonText.includes('表示項目') || buttonText.includes('コピー')) continue;
            
            if (buttonText.includes('ダウンロード') || buttonText.includes('download')) {
              button.click();
              return { success: true, text: buttonText.trim() };
            }
          }
        }
      }
    }
    return { success: false };
  }, presetName);

  if (!historyDownload.success) {
    throw new Error('履歴のダウンロードボタンが見つかりません');
  }

  console.log(`   ✅ 履歴からダウンロード: ${historyDownload.text}`);
}

async function navigateToExportPage(page, browser) {
  console.log('�� 友達リストからエクスポートページへ移動中...');
  
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await delay(2000);
  
  console.log('   🔍 「CSV操作」ボタンを探しています...');
  await page.waitForSelector('text/CSV操作', { timeout: 10000 });
  await page.click('text/CSV操作');
  console.log('   ✅ 「CSV操作」ボタンをクリックしました');
  await delay(2000);
  
  const pages = await browser.pages();
  const newPage = pages[pages.length - 1];
  
  console.log('   🔍 「CSVエクスポートリスト」ボタンを探しています...');
  await newPage.waitForSelector('text/CSVエクスポートリスト', { timeout: 10000 });
  await newPage.click('text/CSVエクスポートリスト');
  console.log('   ✅ 「CSVエクスポートリスト」ボタンをクリックしました');
  await delay(5000);
  
  const allPages = await browser.pages();
  const exportPage = allPages[allPages.length - 1];
  
  console.log('✅ エクスポートページに到達しました');
  
  return exportPage;
}

export async function exportCSV(exporterUrl, presetName, clientName, options = {}) {
  const {
    timeout = 60000,
    screenshotOnError = true,
    headless = true,
    email = null,
    password = null,
    cookies = null,
    profile = null,
  } = options;

  // プロファイル名: 指定があればそれを使用、なければクライアント名から生成
  const profileName = profile ? sanitizeClientName(profile) : sanitizeClientName(clientName);
  const browserDataDir = path.join(process.cwd(), '.browser-data', profileName);
  await ensureDirectories(browserDataDir);

  console.log('========================================');
  console.log('📋 Lステップ CSV エクスポート開始');
  console.log('========================================');
  console.log(`クライアント: ${clientName}`);
  console.log(`プロファイル: ${profileName}`);
  console.log(`プリセット: ${presetName}`);
  console.log(`URL: ${exporterUrl}`);

  let browser;
  let downloadedFile = null;

  try {
    // ブラウザを起動
    console.log('🚀 ブラウザ起動中...');

    const launchOptions = {
      headless: headless === true ? 'new' : headless,
      userDataDir: browserDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ],
      dumpio: false, // デバッグ時はtrueに設定
      protocolTimeout: 180000, // 3分に増やす（デフォルトは180秒）
    };

    // 環境変数でChrome実行パスが指定されている場合のみ設定
    if (CHROME_EXECUTABLE_PATH) {
      launchOptions.executablePath = CHROME_EXECUTABLE_PATH;
    }

    console.log('   ⚙️  起動オプション:', JSON.stringify({
      headless: launchOptions.headless,
      userDataDir: launchOptions.userDataDir,
      executablePath: launchOptions.executablePath || 'bundled Chromium',
      protocolTimeout: launchOptions.protocolTimeout
    }, null, 2));

    browser = await launchBrowserWithRetry(launchOptions);

    let page = await browser.newPage();
    console.log('✅ ブラウザ起動完了');

    // Cookieが渡された場合は設定
    if (cookies && Array.isArray(cookies) && cookies.length > 0) {
      console.log('🍪 Cookieを設定中...');
      try {
        // PuppeteerのsetCookieフォーマットに変換
        const puppeteerCookies = cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain || '.linestep.net',
          path: c.path || '/',
          secure: c.secure !== false,
          httpOnly: c.httpOnly !== false,
          sameSite: c.sameSite || 'Lax'
        }));
        await page.setCookie(...puppeteerCookies);
        console.log(`   ✅ ${puppeteerCookies.length}件のCookieを設定しました`);
      } catch (cookieError) {
        console.log(`   ⚠️ Cookie設定エラー: ${cookieError.message}`);
      }
    }

    const client = await page.createCDPSession();
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
          userDataDir: browserDataDir,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
          ],
          dumpio: false,
          protocolTimeout: 180000,
        };

        if (CHROME_EXECUTABLE_PATH) {
          visibleLaunchOptions.executablePath = CHROME_EXECUTABLE_PATH;
        }

        browser = await launchBrowserWithRetry(visibleLaunchOptions);
        page = await browser.newPage();

        const client = await page.createCDPSession();
        await client.send('Page.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: DOWNLOADS_DIR,
        });

        await page.goto(exporterUrl, {
          waitUntil: 'networkidle0',
          timeout: timeout,
        });
      }

      await waitForLogin(page, email, password);

      await page.goto(exporterUrl, {
        waitUntil: 'networkidle0',
        timeout: timeout,
      });

      currentPageTitle = await page.title();
      console.log(`   ログイン後のページタイトル: ${currentPageTitle}`);
    }

    let currentUrl = page.url();
    console.log(`   現在のURL: ${currentUrl}`);

    // ログイン後に友達リストに飛んだ場合
    if (currentUrl.includes('/friend') || currentUrl.includes('/line/show') || currentPageTitle.includes('友だち')) {
      
      // まずLINE公式アカウントを切り替える
      await switchLineAccount(page, clientName);
      await delay(2000);
      
      // エクスポートページに直接移動
      console.log('📍 エクスポートページに直接移動中...');
      console.log(`   → ${exporterUrl}`);
      
      await page.goto(exporterUrl, {
        waitUntil: 'networkidle0',
        timeout: timeout,
      });
      
      await delay(3000);
      
      // ページ遷移を待つ
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }).catch(() => {});
      } catch (e) {
        // タイムアウトは無視
      }
      
      currentUrl = page.url();
      console.log(`   移動後のURL: ${currentUrl}`);
      
      let newTitle = '';
      try {
        newTitle = await page.title();
        console.log(`   移動後のページタイトル: ${newTitle}`);
      } catch (e) {
        console.log(`   ⚠️ ページタイトル取得をスキップ`);
      }
      
      // まだエクスポートページに到達していない場合は従来の方法で移動
      if (!currentUrl.includes('/exporter/')) {
        console.log('   ⚠️ エクスポートページに到達できませんでした。従来の方法で移動します...');
        const exportPage = await navigateToExportPage(page, browser);
        await delay(2000);
        page = exportPage;
      }
    }

    if (headless) {
      console.log('📌 ヘッドレスモードで実行中（ブラウザ非表示）');
    } else {
      console.log('📌 ブラウザ表示モードで実行中');
    }

    console.log('📍 ステップ2: プリセット選択');
    
    await delay(5000);
    
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
    await delay(2000);

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
    await delay(5000);

    // ページをリロードしてエクスポート履歴を最新化
    console.log('   🔄 ページをリロードして履歴を更新中...');
    await page.reload({ waitUntil: 'networkidle0' });
    await delay(3000);

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

      await delay(1000);
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

    // デバッグ用に詳細なエラー情報を表示
    if (error.message.includes('socket hang up') || error.message.includes('Protocol error')) {
      console.error('');
      console.error('🔍 ブラウザ起動エラーの詳細:');
      console.error('   このエラーは、Puppeteerがブラウザに接続できない時に発生します。');
      console.error('   考えられる原因:');
      console.error('   1. Chromeがクラッシュまたは起動に失敗');
      console.error('   2. ポート競合や既存のChromeプロセスとの干渉');
      console.error('   3. .browser-dataディレクトリの破損');
      console.error('   4. システムリソース不足');
      console.error('');
      console.error('   エラーの種類:', error.constructor.name);
      if (error.stack) {
        console.error('   スタックトレース (最初の3行):');
        const stackLines = error.stack.split('\n').slice(0, 4);
        stackLines.forEach(line => console.error('   ' + line));
      }
    }

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

/**
 * 複数クライアントを1つのブラウザセッションで連続処理
 * ログインは最初の1回だけ！
 */
export async function exportMultipleCSV(clients, options = {}) {
  const {
    timeout = 60000,
    screenshotOnError = true,
    headless = true,
    userDataDir,
    email,
    password,
  } = options;

  const browserDataDir = userDataDir || path.join(process.cwd(), '.browser-data', 'shared');
  await cleanupBrowserLocks(browserDataDir);
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });

  let browser;
  const results = [];

  try {
    console.log('🚀 ブラウザ起動中（全クライアント共通）...');

    const launchOptions = {
      headless: headless === true ? 'new' : headless,
      userDataDir: browserDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ],
      dumpio: false,
      protocolTimeout: 180000,
    };

    if (CHROME_EXECUTABLE_PATH) {
      launchOptions.executablePath = CHROME_EXECUTABLE_PATH;
    }

    browser = await launchBrowserWithRetry(launchOptions);
    let page = await browser.newPage();
    console.log('✅ ブラウザ起動完了');

    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOADS_DIR,
    });

    let isLoggedIn = false;
    let needVisibleBrowser = false;

    // 最初のクライアントでログイン状態を確認
    console.log('📍 ログイン状態を確認中...');
    await page.goto(clients[0].exporterUrl, {
      waitUntil: 'networkidle0',
      timeout: timeout,
    });

    let currentPageTitle = await page.title();
    console.log(`   ページタイトル: ${currentPageTitle}`);

    if (currentPageTitle.includes('ログイン')) {
      if (process.env.CI) {
        throw new Error('ログインセッションが期限切れです。CI環境ではログインできません。');
      }

      // ヘッドレスモードならブラウザを再起動
      if (headless) {
        console.log('⚠️  ログインが必要です。ブラウザを表示モードで再起動します...');
        await browser.close();

        const visibleLaunchOptions = {
          headless: false,
          userDataDir: browserDataDir,
          args: launchOptions.args,
          dumpio: false,
          protocolTimeout: 180000,
        };

        if (CHROME_EXECUTABLE_PATH) {
          visibleLaunchOptions.executablePath = CHROME_EXECUTABLE_PATH;
        }

        browser = await launchBrowserWithRetry(visibleLaunchOptions);
        page = await browser.newPage();
        needVisibleBrowser = true;

        const newClient = await page.createCDPSession();
        await newClient.send('Page.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: DOWNLOADS_DIR,
        });

        await page.goto(clients[0].exporterUrl, {
          waitUntil: 'networkidle0',
          timeout: timeout,
        });
      }

      // ログイン処理
      await waitForLogin(page, email, password);
      isLoggedIn = true;
      console.log('✅ ログイン完了！続けて全クライアントを処理します。');
    } else {
      isLoggedIn = true;
      console.log('✅ 既にログイン済み');
    }

    // 全クライアントを連続処理
    for (let i = 0; i < clients.length; i++) {
      const clientConfig = clients[i];
      console.log('');
      console.log(`════════════════════════════════════════════════════════════`);
      console.log(`[${i + 1}/${clients.length}] ${clientConfig.name}`);
      console.log(`════════════════════════════════════════════════════════════`);

      try {
        // LINE公式アカウントを切り替え
        await switchLineAccount(page, clientConfig.name);
        await delay(2000);

        // エクスポートページに移動
        console.log('📍 エクスポートページに移動中...');
        await page.goto(clientConfig.exporterUrl, {
          waitUntil: 'networkidle0',
          timeout: timeout,
        });

        let currentUrl = page.url();
        currentPageTitle = await page.title();

        // 友達リストに飛んだ場合
        if (currentUrl.includes('/friend') || currentUrl.includes('/line/show')) {
          console.log('   📍 友達リストからエクスポートページへ移動中...');
          page = await navigateToExportPage(page, browser);
        }

        // プリセット選択とCSVエクスポート
        console.log('📍 プリセット選択中...');
        await selectPresetAndExport(page, clientConfig.presetName, timeout);

        // ダウンロード完了を待つ
        console.log('📥 CSVダウンロード待機中...');
        const downloadedFile = await waitForCSVDownload(DOWNLOADS_DIR, 60000);

        console.log(`✅ ${clientConfig.name} CSV取得完了: ${downloadedFile}`);
        results.push({
          name: clientConfig.name,
          success: true,
          csvPath: downloadedFile
        });

      } catch (clientError) {
        console.error(`❌ ${clientConfig.name} 失敗: ${clientError.message}`);
        if (screenshotOnError) {
          try {
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const screenshotPath = path.join(LOGS_DIR, `error_${clientConfig.name}_${timestamp}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`📸 スクリーンショット保存: ${screenshotPath}`);
          } catch (e) {}
        }
        results.push({
          name: clientConfig.name,
          success: false,
          error: clientError.message
        });
      }
    }

    return results;

  } finally {
    if (browser) {
      console.log('');
      console.log('🔒 ブラウザを閉じています...');
      await browser.close();
      console.log('✅ ブラウザを閉じました');
    }
  }
}

// CSVダウンロード完了を待機するヘルパー
async function waitForCSVDownload(downloadDir, timeout = 60000) {
  const startTime = Date.now();
  const existingFiles = new Set(await fs.readdir(downloadDir).catch(() => []));

  while (Date.now() - startTime < timeout) {
    await delay(1000);
    const currentFiles = await fs.readdir(downloadDir).catch(() => []);
    
    for (const file of currentFiles) {
      if (!existingFiles.has(file) && file.endsWith('.csv') && !file.endsWith('.crdownload')) {
        return path.join(downloadDir, file);
      }
    }
  }

  throw new Error('CSVダウンロードがタイムアウトしました');
}

export default { exportCSV, exportMultipleCSV };
