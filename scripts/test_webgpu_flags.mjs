import { chromium } from 'playwright';

(async () => {
  console.log('Testing WebGPU flags...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=WebGPU',
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist',
      '--disable-gpu-driver-bug-workarounds'
    ]
  });
  
  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`[Browser]: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[PageError]: ${err.message}`));

  await page.goto('http://localhost:3004');
  await page.waitForTimeout(2000);

  const webGpuSupported = await page.evaluate(async () => {
    if (!navigator.gpu) return 'No navigator.gpu';
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return 'No adapter found';
      return `Adapter found: ${adapter.name || 'unknown'}`;
    } catch (e) {
      return `Error: ${e.message}`;
    }
  });

  console.log('WebGPU support result:', webGpuSupported);
  await browser.close();
})();
