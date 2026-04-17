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

test('list layout switches grid to single-column and persists independently of size', async ({ page }) => {
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  await page.locator('.grid-layout-select').selectOption('list');
  await page.locator('.grid-size-select').selectOption('large');

  await expect(page.locator('.icons-grid')).toHaveAttribute('data-layout', 'list');
  await expect(page.locator('.icons-grid')).toHaveAttribute('data-preview-size', 'large');

  const columns = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.icons-grid')).gridTemplateColumns);
  // In list layout we set grid-template-columns: 1fr — only one column token.
  expect(columns.split(' ').length).toBe(1);

  const stored = await page.evaluate(() => ({
    layout: localStorage.getItem('grid:buttons:layout'),
    preview: localStorage.getItem('grid:buttons:preview'),
  }));
  expect(stored).toEqual({ layout: 'list', preview: 'large' });

  // Reload — both prefs restored independently.
  await page.reload();
  await page.waitForSelector('.icon-item');
  await expect(page.locator('.icons-grid')).toHaveAttribute('data-layout', 'list');
  await expect(page.locator('.icons-grid')).toHaveAttribute('data-preview-size', 'large');
});

test('list layout: clicking the name row opens the lightbox', async ({ page }) => {
  await page.route('**/star-assets.github.io/**', route => route.abort());
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  await page.locator('.grid-layout-select').selectOption('list');

  // Click where the name text sits. tooltip has pointer-events:none so a real
  // mouse click at that coordinate lands on a::after (which covers the row),
  // bubbling to the anchor. This is exactly the row-wide click behavior we want.
  const tooltip = await page.locator('.icon-item .tooltip').first().boundingBox();
  await page.mouse.click(tooltip.x + tooltip.width / 2, tooltip.y + tooltip.height / 2);

  await expect(page.locator('.pswp')).toBeVisible();
});

test('batch picker offers [100, 200, 300, 500] and no "all"', async ({ page }) => {
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  const values = await page.locator('.grid-batch-select option').evaluateAll(
    opts => opts.map(o => o.value));
  expect(values).toEqual(['100', '200', '300', '500']);
});

test('mobile viewport: art tiles shrink below the desktop 150px base', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/art.html');
  await page.waitForSelector('.icon-item');

  const tileWidth = await page.evaluate(() => {
    const item = document.querySelector('.art-grid .icon-item');
    return item.getBoundingClientRect().width;
  });
  // Desktop art tile is 150px; mobile --tile-base is 120px. Allow a small margin.
  expect(tileWidth).toBeLessThan(140);
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

test('clicking a tile opens the PhotoSwipe lightbox with a copy button', async ({ page }) => {
  // Block the external asset host so thumbnail loads don't flake tests.
  // PhotoSwipe still renders its chrome and attempts to fetch item.icon; we
  // only assert the overlay is present and the custom copy button is wired.
  await page.route('**/star-assets.github.io/**', route => route.abort());
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  // No overlay before clicking
  await expect(page.locator('.pswp')).toHaveCount(0);

  await page.locator('.icon-item a').first().click();

  const overlay = page.locator('.pswp');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('.pswp__button--copy-btn')).toBeVisible();

  // Wait for the opening animation to finish — close() is a no-op while isOpening
  await page.waitForTimeout(400);
  await overlay.locator('.pswp__button--close').click();
  await expect(overlay).toHaveCount(0);
});

test('ctrl+click bypasses the lightbox and lets the anchor behave normally', async ({ page }) => {
  await page.route('**/star-assets.github.io/**', route => route.abort());
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  // Modifier click is a pass-through — anchor default runs, no overlay opens.
  await page.locator('.icon-item a').first().click({ modifiers: ['ControlOrMeta'] });

  // Give the async dynamic-import a chance; overlay must still not appear
  await page.waitForTimeout(200);
  await expect(page.locator('.pswp')).toHaveCount(0);
});

