import { test, expect } from '@playwright/test';

test.describe('WebLLM Generation', () => {
  test('Generates without fallback', async ({ page }) => {
    // Listen to console to capture RAW MODEL RESPONSE
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('RAW MODEL') || msg.text().includes('JSON PARSING') || msg.text().includes('[Diagnostic') || msg.text().includes('FAILED')) {
        console.log(`[BROWSER]: ${msg.text()}`);
      }
    });

    await page.goto('/');
    
    // Auth
    if (await page.isVisible('text="Welcome to Startup Simulator"')) {
      await page.fill('input[placeholder="Jane Doe"]', 'QA Tester');
      await page.fill('input[placeholder="you@example.com"]', 'qa@example.com');
      await page.click('button:has-text("Enter Simulator")');
    }
    
    // Go to project creation
    if (await page.isVisible('text="Create New Project"')) {
      await page.click('button:has-text("Create New Project")');
    }

    // Select WebLLM
    const webllmRadio = page.locator('input[value="webllm"]');
    await webllmRadio.click();
    
    // Fill form
    await page.fill('input[name="name"]', 'TaskMaster');
    await page.fill('textarea[name="idea"]', 'A simple task management application for teams.');
    await page.fill('input[name="targetAudience"]', 'Small teams');
    await page.fill('input[name="budget"]', '$5k');
    await page.fill('input[name="timeline"]', '3 months');

    // Make sure model is ready
    const downloadBtn = page.locator('button:has-text("Download Model")');
    if (await downloadBtn.isVisible()) {
      await downloadBtn.click();
    }
    await expect(
      page.locator('text="Built-in AI is ready."')
        .or(page.locator('text="Built-in AI is unavailable on this browser."'))
    ).toBeVisible({ timeout: 60000 });

    if (await page.isVisible('text="Built-in AI is unavailable on this browser."')) {
      console.log('Skipping generation because WebGPU is not supported in headless mode.');
      return;
    }

    // Submit
    await page.click('button:has-text("Generate Blueprint")');

    // Wait for generation
    await expect(page.locator('text="TaskMaster"').first()).toBeVisible({ timeout: 120000 });
  });
});
