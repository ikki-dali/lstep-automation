import puppeteer from 'puppeteer';

(async () => {
  try {
    console.log('ブラウザ起動テスト...');
    const browser = await puppeteer.launch({
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox']
    });
    console.log('✅ 起動成功！');
    const page = await browser.newPage();
    await page.goto('https://www.google.com');
    console.log('✅ ページ表示成功！');
    await browser.close();
  } catch (error) {
    console.error('❌ エラー:', error);
  }
})();
