import { test, expect } from '@playwright/test';

test.describe('Runtime QA Verification', () => {
  test('Authentication flow works', async ({ page }) => {
    await page.goto('/');
    
    // Check if we are on the onboarding page
    const isAuth = await page.isVisible('text="Welcome to Startup Simulator"');
    if (isAuth) {
      await page.fill('input[placeholder="Jane Doe"]', 'QA Tester');
      await page.fill('input[placeholder="you@example.com"]', 'qa@example.com');
      await page.click('button:has-text("Enter Simulator")');
    }
    
    // Wait for Dashboard or Project Creation
    await expect(page.locator('text="Start a New Project"').or(page.locator('text="Create New Project"'))).toBeVisible({ timeout: 10000 });
  });

  test('Settings Modal - Provider Switching and Gemini BYOK', async ({ page }) => {
    await page.goto('/');
    // Auth if needed
    if (await page.isVisible('text="Welcome to Startup Simulator"')) {
      await page.fill('input[placeholder="Jane Doe"]', 'QA Tester');
      await page.fill('input[placeholder="you@example.com"]', 'qa@example.com');
      await page.click('button:has-text("Enter Simulator")');
    }

    // Go to project creation
    if (await page.isVisible('text="Create New Project"')) {
      await page.click('button:has-text("Create New Project")');
    }

    await page.click('button:has-text("AI Settings")');
    await expect(page.locator('text="Default AI Provider"')).toBeVisible();

    // Select Gemini in the modal
    const modalGeminiRadio = page.locator('div[style*="z-index: 1000"] input[value="gemini"]');
    await modalGeminiRadio.click();
    await expect(page.locator('text="Gemini API Key"')).toBeVisible();
    await page.fill('input[placeholder="Enter your Gemini API Key..."]', 'dummy-key-for-testing');
    await page.click('button:has-text("Save Settings")');

    // Re-open settings to verify it was saved
    await page.click('button:has-text("AI Settings")');
    const geminiRadio = page.locator('div[style*="z-index: 1000"] input[value="gemini"]');
    await expect(geminiRadio).toBeChecked();
    
    // Check key
    const keyInput = page.locator('input[type="password"]');
    await expect(keyInput).toHaveValue('dummy-key-for-testing');
    await page.click('button:has-text("Cancel")');
  });

  test('Built-in AI - Error handling for WebGPU (or successful init)', async ({ page }) => {
    await page.goto('/');
    if (await page.isVisible('text="Welcome to Startup Simulator"')) {
      await page.fill('input[placeholder="Jane Doe"]', 'QA Tester');
      await page.fill('input[placeholder="you@example.com"]', 'qa@example.com');
      await page.click('button:has-text("Enter Simulator")');
    }
    
    if (await page.isVisible('text="Create New Project"')) {
      await page.click('button:has-text("Create New Project")');
    }

    // Make sure we are on webllm
    await page.click('input[value="webllm"]');
    
    // Click download
    const downloadBtn = page.locator('button:has-text("Download Model")');
    if (await downloadBtn.isVisible()) {
      await downloadBtn.click();
    }

    // It should either show downloading or an error
    await expect(
      page.locator('text="Downloading Built-in AI..."')
        .or(page.locator('text="Built-in AI is unavailable on this browser."'))
    ).toBeVisible({ timeout: 15000 });
  });
});
