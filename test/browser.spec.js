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

test('icon-item border uses ::before overlay, not element border', async ({ page }) => {
  await page.goto('/buttons.html');
  // Wait for at least one icon-item to be rendered
  await page.waitForSelector('.icon-item');

  const borderStyle = await page.evaluate(() => {
    const item = document.querySelector('.icon-item');
    const style = getComputedStyle(item);
    return {
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
    };
  });

  // The element itself must have no border (0px) — border lives in ::before overlay
  expect(borderStyle.borderTopWidth).toBe('0px');
  expect(borderStyle.borderRightWidth).toBe('0px');
  expect(borderStyle.borderBottomWidth).toBe('0px');
  expect(borderStyle.borderLeftWidth).toBe('0px');

  const pseudoBorder = await page.evaluate(() => {
    const item = document.querySelector('.icon-item');
    return getComputedStyle(item, '::before').borderTopWidth;
  });

  // The ::before pseudo-element must carry the 1px border
  expect(pseudoBorder).toBe('1px');
});

test('grid toolbar renders size + batch selects and persists prefs', async ({ page }) => {
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  const sizeSelect = page.locator('.grid-size-select');
  const batchSelect = page.locator('.grid-batch-select');
  await expect(sizeSelect).toBeVisible();
  await expect(batchSelect).toBeVisible();

  // Default preview size is medium; changing to large should update the grid
  // dataset, bump the --tile-scale, and persist to localStorage.
  await sizeSelect.selectOption('large');
  await expect(page.locator('.icons-grid')).toHaveAttribute('data-preview-size', 'large');

  const stored = await page.evaluate(() => localStorage.getItem('grid:buttons:preview'));
  expect(stored).toBe('large');

  // Reload — the stored pref should be restored before first render.
  await page.reload();
  await page.waitForSelector('.icon-item');
  await expect(page.locator('.icons-grid')).toHaveAttribute('data-preview-size', 'large');
});

test('list preview mode switches grid to single-column layout', async ({ page }) => {
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  await page.locator('.grid-size-select').selectOption('list');

  const columns = await page.evaluate(() => {
    const grid = document.querySelector('.icons-grid');
    return getComputedStyle(grid).gridTemplateColumns;
  });
  // In list mode we set grid-template-columns: 1fr — only one column token.
  expect(columns.split(' ').length).toBe(1);
});

test('back-to-top button becomes visible after scrolling', async ({ page }) => {
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  const btn = page.locator('.grid-back-to-top');
  await expect(btn).toHaveCount(1);
  // Not visible at initial scroll position
  await expect(btn).not.toHaveClass(/visible/);

  // Scroll the article container past the threshold and assert visibility toggles
  await page.evaluate(() => {
    const article = document.querySelector('article');
    article.scrollTop = 1000;
    article.dispatchEvent(new Event('scroll'));
  });
  await expect(btn).toHaveClass(/visible/);
});

test('batch-size picker "all" renders every item up front', async ({ page }) => {
  await page.goto('/terrain-cliffs.html');
  await page.waitForSelector('.icon-item');

  const initial = await page.locator('.icon-item').count();
  // terrain-cliffs has 108 entries; default batchSize 200 already covers it — pick
  // terrain-doodads (2353 entries) to see the delta between batched and "all".
  await page.goto('/terrain-doodads.html');
  await page.waitForSelector('.icon-item');
  const batched = await page.locator('.icon-item').count();
  expect(batched).toBeLessThanOrEqual(200);

  await page.locator('.grid-batch-select').selectOption('all');
  // "all" triggers renderNextBatch with step = filteredItems.length
  await expect.poll(() => page.locator('.icon-item').count(), { timeout: 5000 })
    .toBeGreaterThan(batched);
});
