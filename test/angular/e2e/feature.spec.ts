import { test, expect } from '@playwright/test';

test('version-display feature loads from feat and renders its badge', async ({ page }) => {
  const featUrls: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes(':5099')) featUrls.push(r.url());
  });

  await page.goto('/');

  // the loader resolved the feature by request: /latest/js-web → /v2/js-web/
  // (waiting on its output also guarantees both requests already happened)
  await expect(page.locator('#feature-url')).toHaveText(
    'http://127.0.0.1:5099/version-display/v2/js-web/',
  );
  expect(featUrls).toContain('http://127.0.0.1:5099/version-display/latest/js-web');
  expect(featUrls).toContain('http://127.0.0.1:5099/version-display/v2/js-web/');

  // initial state: badge shows ONLY the tag version (v1.2.3.4.5.6 format)
  const badge = page.locator('deploy-info').locator('#badge');
  await expect(badge).toHaveText('v1.2.3.4.5.6');

  // click expands full info: serf envs + classic fields, no tag row (it's the badge)
  await badge.click();
  const detail = page.locator('deploy-info').locator('#detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('tech stack');
  await expect(detail).toContainText('angular');
  await expect(detail).toContainText('slave repo');
  await expect(detail).toContainText('artserf/feat');
  await expect(detail).toContainText('slave source');
  await expect(detail).toContainText('artserf');
  await expect(detail).toContainText('commit');
  await expect(detail).toContainText('e2e0001');
  await expect(detail).not.toContainText('tag version');
});
