import { test, expect } from '@playwright/test';

test('version-display feature loads from feat and renders its badge', async ({ page }) => {
  const featUrls: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes(':5477')) featUrls.push(r.url());
  });

  await page.goto('/');

  // the loader resolved the feature by request: /latest/js-web → /v4/js-web/
  // (waiting on its output also guarantees both requests already happened)
  await expect(page.locator('#feature-url')).toHaveText(
    'http://127.0.0.1:5477/version-display/v4/js-web/',
  );
  expect(featUrls).toContain('http://127.0.0.1:5477/version-display/latest/js-web');
  expect(featUrls).toContain('http://127.0.0.1:5477/version-display/v4/js-web/');

  // initial state: badge shows ONLY the version (v4 contract)
  const badge = page.locator('deploy-info').locator('#badge');
  await expect(badge).toHaveText('v1.2.3');

  // click expands full info: project leads, tag/serf rows are v2-era and gone
  await badge.click();
  const detail = page.locator('deploy-info').locator('#detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('project');
  await expect(detail).toContainText('feat');
  await expect(detail).toContainText('namespace');
  await expect(detail).toContainText('angular-test');
  await expect(detail).toContainText('commit');
  await expect(detail).toContainText('e2e0001');
  await expect(detail).not.toContainText('tech stack');
  await expect(detail).not.toContainText('tag version');
});
