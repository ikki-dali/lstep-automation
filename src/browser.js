/**
 * ブラウザ自動操作モジュール
 * 
 * 役割:
 * - Puppeteerでブラウザを制御
 * - Lステップにアクセス
 * - CSV生成・ダウンロード
 * - エラー時のスクリーンショット保存
 */

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ブラウザインスタンスとページを管理するクラス
 */
export class BrowserAutomation {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.options = {
      headless: options.headless !== false, // デフォルトtrue
      slowMo: options.slowMo || 100,        // 操作を100ms遅延（安定性UP）
      timeout: options.timeout || 60000,    // 60秒タイムアウト
      userDataDir: options.userDataDir || path.join(__dirname, '../.browser-data'), // Cookie保存先
      ...options
    };
  }

  /**
   * ブラウザを起動
   * 
   * Cookie保存ディレクトリを使うことで、
   * ログイン状態を保持できる
   */
  async launch() {
    console.log('🚀 ブラウザ起動中...');

    try {
      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        slowMo: this.options.slowMo,
        
        // システムのChromeを使用（より安定）
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 
          (process.platform === 'darwin' 
            ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            : undefined),
        
        // Cookie保存用のディレクトリ
        userDataDir: this.options.userDataDir,
        
        // ブラウザ引数
        args: [
          '--no-sandbox',                    // Linuxサーバー対応
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',         // メモリ不足対策
          '--disable-blink-features=AutomationControlled', // 自動化検知回避
        ],
        
        // デフォルトのタイムアウト設定
        defaultViewport: {
          width: 1920,
          height: 1080,
        }
      });

      this.page = await this.browser.newPage();
      
      // デフォルトタイムアウトを設定
      this.page.setDefaultTimeout(this.options.timeout);
      
      // User-Agentを設定（通常のブラウザに見せる）
      await this.page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      console.log('✅ ブラウザ起動完了');
      
    } catch (error) {
      throw new Error(`ブラウザ起動エラー: ${error.message}`);
    }
  }

  /**
   * ページにアクセス
   * 
   * @param {string} url - アクセス先URL
   * @param {Object} options - オプション
   */
  async goto(url, options = {}) {
    console.log(`🌐 ページアクセス: ${url}`);

    try {
      await this.page.goto(url, {
        waitUntil: options.waitUntil || 'networkidle2', // ネットワークがアイドル状態になるまで待つ
        timeout: options.timeout || this.options.timeout,
      });

      console.log('✅ ページ読み込み完了');
      
    } catch (error) {
      await this.saveScreenshot('page-load-error');
      throw new Error(`ページアクセスエラー: ${error.message}`);
    }
  }

  /**
   * 要素が表示されるまで待機（複数セレクタ対応）
   * 
   * 学習ポイント:
   * - セレクタは変わる可能性があるので、複数用意
   * - 最初に見つかったものを使う
   * 
   * @param {string|Array<string>} selectors - セレクタ（複数可）
   * @param {Object} options - オプション
   * @returns {Promise<ElementHandle>} 見つかった要素
   */
  async waitForElement(selectors, options = {}) {
    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
    const timeout = options.timeout || this.options.timeout;
    const startTime = Date.now();

    console.log(`⏳ 要素を待機中: ${selectorArray.join(' または ')}`);

    // 全セレクタを並列で待機
    while (Date.now() - startTime < timeout) {
      for (const selector of selectorArray) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            // 要素が見つかったら、表示されているか確認
            const isVisible = await element.evaluate(el => {
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            });

            if (isVisible) {
              console.log(`✅ 要素が見つかりました: ${selector}`);
              return element;
            }
          }
        } catch (e) {
          // 要素が見つからない場合は次のセレクタを試す
        }
      }

      // 少し待ってから再試行
      await this.page.waitForTimeout(300);
    }

    // タイムアウト
    await this.saveScreenshot('element-not-found');
    throw new Error(`要素が見つかりませんでした: ${selectorArray.join(', ')}`);
  }

  /**
   * テキストで要素を検索
   * 
   * XPathを使って、テキスト内容で要素を探す
   * 
   * @param {string} text - 検索するテキスト
   * @param {string} tag - タグ名（デフォルト: 全タグ）
   * @returns {Promise<ElementHandle|null>} 見つかった要素
   */
  async findElementByText(text, tag = '*') {
    console.log(`🔍 テキストで検索: "${text}"`);

    try {
      // XPathで検索
      // 完全一致と部分一致の両方を試す
      const xpaths = [
        `//${tag}[text()="${text}"]`,                    // 完全一致
        `//${tag}[contains(text(), "${text}")]`,         // 部分一致
        `//${tag}[normalize-space(text())="${text}"]`,   // 空白を正規化して完全一致
      ];

      for (const xpath of xpaths) {
        const elements = await this.page.$x(xpath);
        if (elements.length > 0) {
          console.log(`✅ 要素が見つかりました（${xpath}）`);
          return elements[0];
        }
      }

      console.log(`⚠️ テキストで要素が見つかりませんでした: "${text}"`);
      return null;

    } catch (error) {
      console.error(`❌ テキスト検索エラー: ${error.message}`);
      return null;
    }
  }

  /**
   * 要素をクリック（安全版）
   * 
   * クリック前に:
   * - 要素が表示されているか確認
   * - スクロールして表示
   * - クリック可能になるまで待機
   * 
   * @param {ElementHandle|string} elementOrSelector - 要素またはセレクタ
   */
  async safeClick(elementOrSelector) {
    try {
      let element;

      // セレクタ文字列の場合は要素を取得
      if (typeof elementOrSelector === 'string') {
        element = await this.waitForElement(elementOrSelector);
      } else {
        element = elementOrSelector;
      }

      // 要素までスクロール
      await element.evaluate(el => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      // スクロール完了を待つ
      await this.page.waitForTimeout(500);

      // クリック可能になるまで待機
      await element.evaluate(el => {
        return new Promise((resolve) => {
          const checkClickable = () => {
            const rect = el.getBoundingClientRect();
            const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
            
            if (isInViewport && !el.disabled) {
              resolve();
            } else {
              setTimeout(checkClickable, 100);
            }
          };
          checkClickable();
        });
      });

      // クリック実行
      await element.click();
      console.log('✅ クリック成功');

      // クリック後の処理を待つ
      await this.page.waitForTimeout(300);

    } catch (error) {
      await this.saveScreenshot('click-error');
      throw new Error(`クリックエラー: ${error.message}`);
    }
  }

  /**
   * ダウンロードを待機
   * 
   * Chrome DevTools Protocol (CDP) を使って
   * ダウンロードの完了を検知
   * 
   * @param {Function} triggerDownload - ダウンロードをトリガーする関数
   * @param {string} downloadPath - ダウンロード先パス
   * @returns {Promise<string>} ダウンロードされたファイルパス
   */
  async waitForDownload(triggerDownload, downloadPath) {
    console.log('📥 ダウンロード開始...');

    try {
      // ダウンロードディレクトリを作成
      await fs.mkdir(downloadPath, { recursive: true });

      // CDP経由でダウンロード設定
      const client = await this.page.target().createCDPSession();
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath,
      });

      // ダウンロード前のファイル一覧を取得
      const filesBefore = await fs.readdir(downloadPath);

      // ダウンロードをトリガー
      await triggerDownload();

      // ダウンロード完了を待機
      let downloadedFile = null;
      const timeout = 60000; // 60秒
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        await this.page.waitForTimeout(1000); // 1秒ごとにチェック

        const filesAfter = await fs.readdir(downloadPath);
        const newFiles = filesAfter.filter(f => !filesBefore.includes(f));

        // .crdownload (ダウンロード中) ファイルがないか確認
        const downloading = newFiles.some(f => f.endsWith('.crdownload'));

        if (newFiles.length > 0 && !downloading) {
          // CSVファイルを探す
          const csvFile = newFiles.find(f => f.endsWith('.csv'));
          if (csvFile) {
            downloadedFile = path.join(downloadPath, csvFile);
            break;
          }
        }
      }

      if (!downloadedFile) {
        throw new Error('ダウンロードがタイムアウトしました');
      }

      console.log(`✅ ダウンロード完了: ${downloadedFile}`);
      return downloadedFile;

    } catch (error) {
      await this.saveScreenshot('download-error');
      throw new Error(`ダウンロードエラー: ${error.message}`);
    }
  }

  /**
   * スクリーンショットを保存
   * 
   * @param {string} name - ファイル名（拡張子なし）
   * @returns {Promise<string>} 保存したファイルパス
   */
  async saveScreenshot(name) {
    try {
      const logsDir = path.join(__dirname, '../logs');
      await fs.mkdir(logsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}_${timestamp}.png`;
      const filepath = path.join(logsDir, filename);

      await this.page.screenshot({
        path: filepath,
        fullPage: true, // ページ全体をキャプチャ
      });

      console.log(`📸 スクリーンショット保存: ${filepath}`);
      return filepath;

    } catch (error) {
      console.error('スクリーンショット保存エラー:', error.message);
      return null;
    }
  }

  /**
   * ページのHTMLを保存（デバッグ用）
   */
  async savePageHTML(name) {
    try {
      const logsDir = path.join(__dirname, '../logs');
      await fs.mkdir(logsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}_${timestamp}.html`;
      const filepath = path.join(logsDir, filename);

      const html = await this.page.content();
      await fs.writeFile(filepath, html, 'utf-8');

      console.log(`💾 HTML保存: ${filepath}`);
      return filepath;

    } catch (error) {
      console.error('HTML保存エラー:', error.message);
      return null;
    }
  }

  /**
   * ブラウザを閉じる
   */
  async close() {
    if (this.browser) {
      console.log('🔒 ブラウザを閉じています...');
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('✅ ブラウザを閉じました');
    }
  }

  /**
   * ログイン状態をチェック
   * 
   * @param {string} loginCheckUrl - ログイン確認用URL
   * @param {string} loggedInSelector - ログイン後に表示される要素のセレクタ
   * @returns {Promise<boolean>} ログイン済みならtrue
   */
  async isLoggedIn(loginCheckUrl, loggedInSelector) {
    try {
      await this.goto(loginCheckUrl);
      
      // ログイン後の要素があるか確認（タイムアウトは短め）
      const element = await this.page.$(loggedInSelector);
      return element !== null;

    } catch (error) {
      return false;
    }
  }
}

// エクスポート
export default BrowserAutomation;