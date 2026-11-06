import { test, expect } from '@playwright/test';

test('version-display feature loads from feat and renders its badge', async ({ page }) => {
  const featUrls: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes(':5099')) featUrls.push(r.url());
  });

  await page.goto('/');

  // the loader resolved the feature by request: /latest/js-web → /v1/js-web/
  // (waiting on its output also guarantees both requests already happened)
  await expect(page.locator('#feature-url')).toHaveText(
    'http://127.0.0.1:5099/version-display/v1/js-web/',
  );
  expect(featUrls).toContain('http://127.0.0.1:5099/version-display/latest/js-web');
  expect(featUrls).toContain('http://127.0.0.1:5099/version-display/v1/js-web/');

  // badge lives in the custom element's open shadow root (Playwright pierces it)
  const badge = page.locator('deploy-info').locator('#badge');
  await expect(badge).toHaveText('feat@angular-test v1.2.3');

  // click expands the detail table
  await badge.click();
  await expect(page.locator('deploy-info').locator('#detail')).toBeVisible();
  await expect(page.locator('deploy-info').locator('#detail')).toContainText('repo');
});
