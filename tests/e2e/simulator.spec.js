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
    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      const input = args[0];
      const url = typeof input === 'string' ? input : input?.url;
      if (url?.includes('/api/')) {
        const requests = JSON.parse(sessionStorage.getItem('e2e-api-requests') || '[]');
        requests.push(url);
        sessionStorage.setItem('e2e-api-requests', JSON.stringify(requests));
      }
      return originalFetch(...args);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Send Magic Link/ }).waitFor({ timeout: 15_000 }).catch(() => {});
  await page.evaluate(async ({ email, password }) => {
    if (!window.__supabase) return;
    const { data } = await window.__supabase.auth.getSession();
    if (!data.session) await window.__supabase.auth.signInWithPassword({ email, password });
  }, { email: E2E_EMAIL, password: E2E_PASSWORD });
  // Delete the seeded user's cloud projects so each test starts on the empty
  // project registry with a clean database.
  await page.evaluate(async () => {
    if (!window.__supabase) return;
    const { data } = await window.__supabase.auth.getSession();
    if (!data.session) return;
    const headers = { Authorization: `Bearer ${data.session.access_token}` };
    const res = await fetch('/api/projects', { headers });
    const projects = res.ok ? await res.json() : [];
    await Promise.all(projects.map(p => fetch(`/api/projects/${p.id}`, { method: 'DELETE', headers })));
  });
  await page.evaluate(() => sessionStorage.setItem('e2e-api-requests', '[]'));
  await page.reload();
  await page.getByRole('heading', { name: 'Your Projects' }).waitFor({ timeout: 15_000 });
});

test('simulator generates, revises, persists, and exposes exports', async ({ page }, testInfo) => {
  await expect(page.getByText('Select a project from Your Projects to load its blueprint.')).toBeVisible();
  await expect(page.getByText('No projects yet. Create one to start building a blueprint.')).toBeVisible();
  const bootstrapRequests = await page.evaluate(() => JSON.parse(sessionStorage.getItem('e2e-api-requests') || '[]'));
  expect(bootstrapRequests.filter(url => /\/api\/projects\/[^/]+(?:\/blueprint)?$/.test(new URL(url, 'http://localhost').pathname))).toEqual([]);

  await page.getByRole('button', { name: 'New Project' }).click();
  await page.getByLabel('Project Name *').waitFor();
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

  await page.getByPlaceholder('Describe the change...').fill('Reduce Budget');
  await page.getByRole('button', { name: 'Apply Change' }).click();
  await expect(page.getByText('Revision Preview')).toBeVisible();
  await page.getByRole('button', { name: 'Apply Revision' }).click();
  await expect(page.getByText(/Revision Applied Successfully|partially completed/)).toBeVisible({ timeout: 15_000 });

  // Reload returns to the unselected registry. Reopening performs exactly one
  // blueprint read and restores the approved cloud sections/local drafts.
  await page.reload();
  await expect(page.getByText('Select a project from Your Projects to load its blueprint.')).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('e2e-api-requests', '[]'));
  await page.getByRole('button', { name: 'Open MediCore' }).click();
  await expect(page.locator('#blueprint-section-executiveSummary')).toBeVisible();
  const openRequests = await page.evaluate(() => JSON.parse(sessionStorage.getItem('e2e-api-requests') || '[]'));
  expect(openRequests.filter(url => new URL(url, 'http://localhost').pathname.endsWith('/blueprint'))).toHaveLength(1);

  // Approval and Your Projects consume registry/blueprint state only.
  await page.getByTitle('Approval').click();
  await expect(page.getByRole('heading', { name: 'Approval & Quality' })).toBeVisible();
  await page.getByTitle('Your Projects').click();
  let resourcePaths = await page.evaluate(() => JSON.parse(sessionStorage.getItem('e2e-api-requests') || '[]')
    .map(url => new URL(url, window.location.origin).pathname)
    .filter(path => /\/(meta|events|memory|decisions)$/.test(path)));
  expect(resourcePaths).toEqual([]);

  // Memory loads only itself on first visit and is cached on revisit.
  await page.getByTitle('Project Memory').click();
  await expect(page.getByRole('heading', { name: 'Memory Inspector' })).toBeVisible();
  await page.getByTitle('Your Projects').click();
  await page.getByTitle('Project Memory').click();
  await expect(page.getByRole('heading', { name: 'Memory Inspector' })).toBeVisible();
  resourcePaths = await page.evaluate(() => JSON.parse(sessionStorage.getItem('e2e-api-requests') || '[]')
    .map(url => new URL(url, window.location.origin).pathname)
    .filter(path => /\/(meta|events|memory|decisions)$/.test(path)));
  expect(resourcePaths.map(path => path.split('/').at(-1))).toEqual(['memory']);

  // Agent Team progressively loads the three remaining resources and reuses memory.
  await page.getByTitle('Agent Team').click();
  await expect(page.getByRole('heading', { name: 'Agent Timeline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project Evolution' })).toBeVisible();
  await expect(page.getByText('Loading project context before revision actions…')).toHaveCount(0);
  resourcePaths = await page.evaluate(() => JSON.parse(sessionStorage.getItem('e2e-api-requests') || '[]')
    .map(url => new URL(url, window.location.origin).pathname)
    .filter(path => /\/(meta|events|memory|decisions)$/.test(path)));
  expect(resourcePaths.map(path => path.split('/').at(-1))).toEqual(['memory', 'meta', 'events', 'decisions']);

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
  }
});

test('developer tools stay hidden until Developer Mode is enabled', async ({ page }) => {
  await expect(page.getByTitle('Open AI Debug Panel')).toHaveCount(0);
  await page.getByTitle('Settings').click();
  const developerToggle = page.getByLabel(/Developer Mode/i);
  await developerToggle.check();
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await page.getByRole('button', { name: 'New Project' }).click();
  await page.getByLabel('Project Name *').fill('DevTools');
  await page.getByLabel('Startup Idea *').fill('A workflow tool used to verify developer-only diagnostics');
  await page.getByLabel('Target Audience').fill('Developers');
  await page.getByLabel('Budget').fill('$10k');
  await page.getByRole('button', { name: 'Generate Blueprint' }).click();
  await expect(page.getByTitle('Open AI Debug Panel')).toBeVisible();
});
