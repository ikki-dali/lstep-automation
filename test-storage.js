import puppeteer from 'puppeteer';
import fs from 'fs/promises';

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  
  const page = await browser.newPage();
  
  // まずログインページへ
  await page.goto('https://manager.linestep.net/');
  
  console.log('ログインしてください...');
  await page.waitForTimeout(30000);
  
  // localStorageを取得
  const storage = await page.evaluate(() => {
    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      items[key] = localStorage.getItem(key);
    }
    return items;
  });
  
  console.log('保存するlocalStorage:', Object.keys(storage));
  await fs.writeFile('.browser-data/localStorage.json', JSON.stringify(storage, null, 2));
  
  await browser.close();
  console.log('✅ 保存完了');
  
  // 新しいブラウザで復元テスト
  console.log('\n新しいブラウザで復元テスト...');
  const browser2 = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  
  const page2 = await browser2.newPage();
  
  // localStorageを復元してからページ遷移
  await page2.evaluateOnNewDocument((data) => {
    const parsed = JSON.parse(data);
    for (const key in parsed) {
      localStorage.setItem(key, parsed[key]);
    }
  }, JSON.stringify(storage));
  
  await page2.goto('https://manager.linestep.net/');
  
  console.log('復元後にログインされているか確認...');
  await page2.waitForTimeout(5000);
  
  const title = await page2.title();
  console.log('ページタイトル:', title);
  console.log(title.includes('ログイン') ? '❌ ログインページ' : '✅ ログイン済み');
  
  await browser2.close();
})();
