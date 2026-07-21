import { chromium } from 'playwright';

(async () => {
  console.log('Launching browser with WebGPU...');
  const browser = await chromium.launch({
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=WebGPU',
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist',
      '--disable-gpu-driver-bug-workarounds'
    ]
  });
  
  const page = await browser.newPage();
  
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Vite') || text.includes('React DevTools') || text.includes('AuthGate')) return;
    console.log(`[Browser]: ${text}`);
  });
  
  page.on('pageerror', error => console.error(`[Browser Page Error]: ${error}`));

  console.log('Navigating...');
  await page.goto('http://localhost:3004');
  
  console.log('Logging in...');
  await page.fill('input[placeholder="Jane Doe"]', 'Test User');
  await page.fill('input[placeholder="you@example.com"]', 'test@example.com');
  await page.click('button:has-text("Enter Simulator")');
  
  console.log('Waiting for Create New Project button...');
  // Handle if we land on dashboard vs create page
  const createBtn = page.locator('button:has-text("Create New Project")');
  await createBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await createBtn.isVisible()) {
    await createBtn.click();
  }
  
  await page.waitForSelector('input[value="webllm"]');
  
  await page.click('input[value="webllm"]');
  await page.fill('input[name="name"]', 'TestApp');
  await page.fill('textarea[name="idea"]', 'A simple task app');
  await page.fill('input[name="targetAudience"]', 'Everyone');
  await page.fill('input[name="budget"]', '10k');
  await page.fill('input[name="timeline"]', '1 month');
  
  console.log('Waiting for WebLLM download/init...');
  const downloadBtn = page.locator('button:has-text("Download Model")');
  if (await downloadBtn.isVisible()) {
    await downloadBtn.click();
  }
  
  await page.waitForSelector('text="Built-in AI is ready."', { timeout: 180000 });
  
  console.log('Triggering generation...');
  await page.click('button:has-text("Generate Blueprint")');
  
  console.log('Waiting for generation logs...');
  // Wait enough time to see the timeout or success
  await page.waitForTimeout(100000);
  
  await browser.close();
})();
