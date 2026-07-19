import { test, expect } from '@playwright/test';

// The app is gated behind Supabase magic-link auth. E2E runs sign in with a
// seeded test user via env credentials; without them the suite skips instead
// of failing (create a user in Supabase Auth and export these to enable):
//   E2E_SUPABASE_EMAIL / E2E_SUPABASE_PASSWORD
const E2E_EMAIL = process.env.E2E_SUPABASE_EMAIL;
const E2E_PASSWORD = process.env.E2E_SUPABASE_PASSWORD;

test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Set E2E_SUPABASE_EMAIL / E2E_SUPABASE_PASSWORD to run the e2e suite against Supabase auth.');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-initialized')) {
      localStorage.clear();
      sessionStorage.setItem('e2e-initialized', 'true');
    }
    localStorage.setItem('mass_ai_mode', 'false');
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Send Magic Link/ }).waitFor({ timeout: 15_000 }).catch(() => {});
  await page.evaluate(async ({ email, password }) => {
    if (!window.__supabase) return;
    const { data } = await window.__supabase.auth.getSession();
    if (!data.session) await window.__supabase.auth.signInWithPassword({ email, password });
  }, { email: E2E_EMAIL, password: E2E_PASSWORD });
  // Returning users land on the Dashboard with their last project auto-opened.
  // Delete the seeded user's cloud projects so each test starts on the create
  // screen with a clean database.
  await page.evaluate(async () => {
    if (!window.__supabase) return;
    const { data } = await window.__supabase.auth.getSession();
    if (!data.session) return;
    const headers = { Authorization: `Bearer ${data.session.access_token}` };
    const res = await fetch('/api/projects', { headers });
    const projects = res.ok ? await res.json() : [];
    await Promise.all(projects.map(p => fetch(`/api/projects/${p.id}`, { method: 'DELETE', headers })));
  });
  await page.reload();
  await page.getByLabel('Project Name *').waitFor({ timeout: 15_000 });
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

  await expect(page.getByTitle('Export')).toHaveCount(0);
  const downloadButton = page.getByRole('button', { name: 'Download blueprint' });
  await expect(downloadButton).toBeVisible();
  await downloadButton.click();
  await expect(page.getByRole('menuitem', { name: 'PDF' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Word' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Markdown' })).toBeVisible();

  if (testInfo.project.name === 'desktop') {
    const [markdown] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Markdown' }).click()
    ]);
    expect(markdown.suggestedFilename()).toMatch(/\.md$/);

    await downloadButton.click();
    const [word] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('menuitem', { name: 'Word' }).click()
    ]);
    expect(word.suggestedFilename()).toMatch(/\.docx$/);

    await downloadButton.click();
    const [pdf] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('menuitem', { name: 'PDF' }).click()
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
