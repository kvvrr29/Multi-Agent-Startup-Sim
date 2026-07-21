import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error]: ${msg.text()}`);
    } else {
      console.log(`[Browser Console]: ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    console.log(`[Browser Page Error]: ${error.message}`);
    console.log(`[Browser Page Stack]: ${error.stack}`);
  });

  try {
    const response = await page.goto('http://localhost:3004');
    console.log(`[Status]: ${response.status()}`);
    // Wait a little to let any render errors pop
    await page.waitForTimeout(2000);
    const content = await page.content();
    console.log('[Body Length]:', content.length);
  } catch (err) {
    console.log(`[Navigation Error]: ${err.message}`);
  }

  await browser.close();
})();
