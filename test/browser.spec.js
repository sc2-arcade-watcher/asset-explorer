import { test, expect } from '@playwright/test';

// Block external services — Discord API and Google Fonts are not under test.
// Discord widget code handles network failures gracefully (fallback cards).
test.beforeEach(async ({ page }) => {
  await page.route('**/discord.com/**',   route => route.abort());
  await page.route('**/googleapis.com/**', route => route.abort());
  await page.route('**/gstatic.com/**',   route => route.abort());
});

test('loads without uncaught JS errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  expect(errors).toEqual([]);
});

test('title and h1', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SC2Mapster Asset Explorer/);
  await expect(page.locator('h1')).toContainText('SC2Mapster Asset Explorer');
});

test('nav links are present', async ({ page }) => {
  await page.goto('/');
  const links = page.locator('nav.links a');
  await expect(links).toHaveCount(12);
});

test('discord widget container renders fallback cards', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // With Discord API blocked, renderDiscordWidgets falls back to .discord-widget-fallback cards
  const cards = page.locator('#discord-widgets .discord-widget-fallback');
  await expect(cards).not.toHaveCount(0);
});
