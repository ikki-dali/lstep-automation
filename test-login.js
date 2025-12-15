import puppeteer from 'puppeteer';
import path from 'path';

(async () => {
  try {
    const userDataDir = path.join(process.cwd(), '.browser-data');
    console.log('UserDataDir:', userDataDir);
    console.log('ブラウザ起動中...');
    
    const browser = await puppeteer.launch({
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      userDataDir: userDataDir,
      args: ['--no-sandbox']
    });
    
    console.log('✅ ブラウザ起動成功');
    const page = await browser.newPage();
    
    await page.goto('https://manager.linestep.net/', {
      waitUntil: 'networkidle0',
    });
    
    console.log('ページタイトル:', await page.title());
    
    // Cookieを確認
    const cookies = await page.cookies();
    console.log('保存されているCookie数:', cookies.length);
    
    console.log('\n手動でログインしてください。20秒後に閉じます...');
    await page.waitForTimeout(20000);
    
    // ログイン後のCookie数
    const cookiesAfter = await page.cookies();
    console.log('ログイン後のCookie数:', cookiesAfter.length);
    
    await browser.close();
  } catch (error) {
    console.error('❌ エラー:', error.message);
  }
})();
