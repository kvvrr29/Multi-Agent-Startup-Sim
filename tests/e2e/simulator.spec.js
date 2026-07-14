import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-initialized')) {
      localStorage.clear();
      sessionStorage.setItem('e2e-initialized', 'true');
    }
    localStorage.setItem('mass_ai_mode', 'false');
  });
  await page.goto('/');
});

test('simulator generates, revises, versions, persists, and exposes exports', async ({ page }, testInfo) => {
  await page.getByLabel('Project Name *').fill('MediCore');
  await page.getByLabel('Startup Idea *').fill('A hospital management system for patient records, appointments, and billing at regional clinics');
  await page.getByLabel('Target Audience').fill('Regional clinics');
  await page.getByLabel('Budget').fill('$100k');
  await page.getByRole('button', { name: 'Generate Blueprint' }).click();

  await expect(page.locator('#blueprint-section-finalRecommendations')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('[id^="blueprint-section-"]')).toHaveCount(18);

  const approve = page.locator('#blueprint-section-executiveSummary').getByRole('button', { name: 'Approve' });
  await expect(approve).toBeEnabled({ timeout: 5_000 });
  await approve.click();

  await page.getByRole('button', { name: 'Reduce Budget' }).click();
  await expect(page.getByText('Revision Preview')).toBeVisible();
  await page.getByRole('button', { name: 'Apply Revision' }).click();
  await expect(page.getByText(/Revision Applied Successfully|partially completed/)).toBeVisible({ timeout: 15_000 });

  await page.getByTitle('Versions').click();
  await expect(page.getByText('v3', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('MediCore', { exact: true })).toBeVisible();

  await page.getByTitle('Export').click();
  await expect(page.getByRole('button', { name: /Word Document/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Markdown/ })).toBeVisible();

  if (testInfo.project.name === 'desktop') {
    const [markdown] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Markdown/ }).click()
    ]);
    expect(markdown.suggestedFilename()).toMatch(/\.md$/);

    const [word] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('button', { name: /Word Document/ }).click()
    ]);
    expect(word.suggestedFilename()).toMatch(/\.docx$/);

    const [pdf] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('button', { name: /PDF Document/ }).click()
    ]);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);

    await page.getByTitle('Versions').click();
    await page.getByText('v1', { exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('v4', { exact: true })).toBeVisible();
  }
});

test('developer tools stay hidden until Developer Mode is enabled', async ({ page }) => {
  await expect(page.getByTitle('Open AI Debug Panel')).toHaveCount(0);
  await page.getByTitle('Settings').click();
  const developerToggle = page.getByLabel(/Developer Mode/i);
  await developerToggle.check();
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await page.getByLabel('Project Name *').fill('DevTools');
  await page.getByLabel('Startup Idea *').fill('A workflow tool used to verify developer-only diagnostics');
  await page.getByLabel('Target Audience').fill('Developers');
  await page.getByLabel('Budget').fill('$10k');
  await page.getByRole('button', { name: 'Generate Blueprint' }).click();
  await expect(page.getByTitle('Open AI Debug Panel')).toBeVisible();
});
