import { test, expect } from '@playwright/test';

// Block external services — Discord API and Google Fonts are not under test.
// Discord widget code handles network failures gracefully (fallback cards).
test.beforeEach(async ({ page }, testInfo) => {
  await page.route('**/discord.com/**',   route => route.abort());
  await page.route('**/googleapis.com/**', route => route.abort());
  await page.route('**/gstatic.com/**',   route => route.abort());

  // Log unexpected HTTP errors and failed requests from external hosts.
  // Captured in test output to help diagnose rate-limiting or CDN issues in CI.
  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && !url.includes('discord.com') && !url.includes('googleapis.com') && !url.includes('gstatic.com')) {
      console.log(`[net] ${status} ${url}  [${testInfo.title}]`);
    }
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!url.includes('discord.com') && !url.includes('googleapis.com') && !url.includes('gstatic.com')) {
      console.log(`[net] FAILED ${request.failure()?.errorText ?? '?'} ${url}  [${testInfo.title}]`);
    }
  });
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
  await expect(links).toHaveCount(13);
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

test('grid toolbar renders size toggles (no batch select) and persists prefs', async ({ page }) => {
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  // Toolbar should have icon toggle buttons for view size, not a select.
  await expect(page.locator('.toolbar-toggle-group')).toHaveCount(2);
  await expect(page.locator('.grid-size-select')).toHaveCount(0);
  await expect(page.locator('.grid-batch-select')).toHaveCount(0);

  // Default preview size is medium; clicking the large toggle should update
  // the grid dataset and persist to localStorage.
  await page.locator('.toggle-btn[data-value="large"]').first().click();
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

  await page.locator('.toggle-btn[data-value="list"]').click();
  await page.locator('.toggle-btn[data-value="large"]').first().click();

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
  await page.route('**/dist.sc2arcade.com/star-assets/**', route => route.abort());
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  await page.locator('.toggle-btn[data-value="list"]').click();

  // Click where the name text sits. tooltip has pointer-events:none so a real
  // mouse click at that coordinate lands on a::after (which covers the row),
  // bubbling to the anchor. This is exactly the row-wide click behavior we want.
  const tooltip = await page.locator('.icon-item .tooltip').first().boundingBox();
  await page.mouse.click(tooltip.x + tooltip.width / 2, tooltip.y + tooltip.height / 2);

  await expect(page.locator('.pswp')).toBeVisible();
});

test('list layout: name truncates with ellipsis and carries native title', async ({ page }) => {
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');
  await page.locator('.toggle-btn[data-value="list"]').click();

  const tooltipStyle = await page.evaluate(() => {
    const t = document.querySelector('.icon-item .tooltip');
    const s = getComputedStyle(t);
    return { ws: s.whiteSpace, overflow: s.overflow, textOverflow: s.textOverflow };
  });
  expect(tooltipStyle.ws).toBe('nowrap');
  expect(tooltipStyle.textOverflow).toBe('ellipsis');
  expect(tooltipStyle.overflow).toBe('hidden');

  // Both the anchor/img and the tooltip should carry a `title` attribute matching
  // the visible name so truncated names are readable via native hover tooltip.
  const titles = await page.evaluate(() => {
    const item = document.querySelector('.icon-item');
    const name = item.querySelector('.tooltip').textContent;
    return {
      name,
      imgTitle: item.querySelector('img').getAttribute('title'),
      tooltipTitle: item.querySelector('.tooltip').getAttribute('title'),
      anchorTitle: item.querySelector('a').getAttribute('title'),
    };
  });
  expect(titles.imgTitle).toBe(titles.name);
  expect(titles.tooltipTitle).toBe(titles.name);
  expect(titles.anchorTitle).toBe(titles.name);
});

test('list layout: rows share a consistent height and have no copy-btn', async ({ page }) => {
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');
  await page.locator('.toggle-btn[data-value="list"]').click();

  const heights = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.icon-item')).slice(0, 10);
    return rows.map(r => r.getBoundingClientRect().height);
  });
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  expect(max - min).toBeLessThanOrEqual(1);
  await expect(page.locator('.icon-item .copy-btn')).toHaveCount(0);
});

test('list layout: art tiles are wider than tall, portraits taller than wide', async ({ page }) => {
  await page.goto('/art.html');
  await page.waitForSelector('.icon-item');
  await page.locator('.toggle-btn[data-value="list"]').click();
  const artImg = await page.evaluate(() => {
    const img = document.querySelector('.icon-item img');
    const r = img.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  expect(artImg.w).toBeGreaterThan(artImg.h);

  await page.goto('/portraits.html');
  await page.waitForSelector('.icon-item');
  await page.locator('.toggle-btn[data-value="list"]').click();
  const portraitImg = await page.evaluate(() => {
    const img = document.querySelector('.icon-item img');
    const r = img.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  expect(portraitImg.h).toBeGreaterThan(portraitImg.w);
});

test('viewport-inferred batch size renders at least 10 items initially', async ({ page }) => {
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  const count = await page.locator('.icon-item').count();
  expect(count).toBeGreaterThanOrEqual(10);
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

  // Scroll the window past the threshold and assert visibility toggles
  await page.evaluate(() => {
    window.scrollTo(0, 1000);
  });
  await expect(btn).toHaveClass(/visible/);
});

test('clicking a tile opens the PhotoSwipe lightbox with a visible copy button', async ({ page }) => {
  // Block the external asset host so thumbnail loads don't flake tests.
  // PhotoSwipe still renders its chrome and attempts to fetch item.icon; we
  // only assert the overlay is present and the custom copy button is wired.
  await page.route('**/dist.sc2arcade.com/star-assets/**', route => route.abort());
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  await expect(page.locator('.pswp')).toHaveCount(0);

  await page.locator('.icon-item a').first().click();

  const overlay = page.locator('.pswp');
  await expect(overlay).toBeVisible();

  const copyBtn = overlay.locator('.pswp__button--custom-copy-btn');
  await expect(copyBtn).toBeVisible();

  // The SVG icon must render on the dark chrome — no black-on-black regression.
  const iconBox = await copyBtn.locator('svg').boundingBox();
  expect(iconBox.width).toBeGreaterThan(0);
  expect(iconBox.height).toBeGreaterThan(0);
  const iconFill = await copyBtn.locator('svg').evaluate(
    (el) => getComputedStyle(el).fill);
  expect(iconFill).not.toBe('rgb(0, 0, 0)');
  expect(iconFill).not.toBe('rgba(0, 0, 0, 0)');

  await expect(copyBtn).toHaveAttribute('title', 'Copy name');

  await page.waitForTimeout(400);
  await overlay.locator('.pswp__button--close').click();
  await expect(overlay).toHaveCount(0);
});

test('lightbox renders a caption with the clicked item name', async ({ page }) => {
  await page.route('**/dist.sc2arcade.com/star-assets/**', route => route.abort());
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  const firstTile = page.locator('.icon-item').first();
  const expectedName = await firstTile.locator('.tooltip').textContent();

  await firstTile.locator('a').click();
  const caption = page.locator('.pswp__custom-caption');
  await expect(caption).toBeVisible();
  await expect(caption).toHaveText(expectedName);
});

test('lightbox shows prev/next arrows and advances on click', async ({ page }) => {
  await page.route('**/dist.sc2arcade.com/star-assets/**', route => route.abort());
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  await page.locator('.icon-item a').first().click();
  const overlay = page.locator('.pswp');
  await expect(overlay).toBeVisible();

  const nextBtn = overlay.locator('.pswp__button--arrow--next');
  await expect(nextBtn).toBeVisible();
  await expect(overlay.locator('.pswp__button--arrow--prev')).toBeVisible();

  const firstCaption = await page.locator('.pswp__custom-caption').textContent();
  await nextBtn.click();
  // Caption updates on the `change` event — wait for it to differ.
  await expect(page.locator('.pswp__custom-caption')).not.toHaveText(firstCaption);
});

test('lightbox contains the image instead of stretching it to the viewport', async ({ page }) => {
  // Buttons are 76px icons. Before the fix the overlay upscaled them to 2048px —
  // lock that out by asserting the rendered slide width stays sensible even when
  // the real image never arrives (the placeholder dims drive layout).
  await page.route('**/dist.sc2arcade.com/star-assets/**', route => route.abort());
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  await page.locator('.icon-item a').first().click();
  const overlay = page.locator('.pswp');
  await expect(overlay).toBeVisible();
  await page.waitForTimeout(400);

  const { slideW, natW } = await page.evaluate(() => {
    const img = document.querySelector('.pswp__img');
    return {
      slideW: img ? img.getBoundingClientRect().width : 0,
      natW: img ? img.naturalWidth : 0,
    };
  });
  // The lightbox must not upscale past the image's natural size. Allow a tiny
  // sub-pixel tolerance for rendering rounding.
  expect(slideW).toBeLessThanOrEqual(natW + 1);
});

test('terrain-tilesets: lightbox centers the slide after real-image load', async ({ page }) => {
  // Terrain tilesets are served from a separate host and are larger than their
  // thumbnails — the dataSource dims (guessed from the thumbnail) won't match
  // the natural size. PhotoSwipe's `refreshSlideContent` (called from our
  // `contentLoad` handler) must recompute the slide so the image stays
  // centered inside the scroll wrap instead of overflowing.
  await page.goto('/terrain-tilesets.html');
  await page.waitForSelector('.icon-item');

  await page.locator('.icon-item a').first().click();
  const overlay = page.locator('.pswp');
  await expect(overlay).toBeVisible();
  // Wait for the real image to load + refreshSlideContent to re-render.
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const img = document.querySelector('.pswp__img');
      return img && img.naturalWidth > 0 && img.complete ? img.naturalWidth : 0;
    });
  }, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(200);  // let refresh settle

  const geom = await page.evaluate(() => {
    const img = document.querySelector('.pswp__img');
    const wrap = document.querySelector('.pswp__scroll-wrap');
    return { ib: img.getBoundingClientRect(), wb: wrap.getBoundingClientRect() };
  });
  // Slide must sit inside the scroll wrap and be horizontally centered —
  // the screenshot bug was a large tileset shifted right off-screen because
  // PhotoSwipe laid it out against a mismatched dataSource dim.
  expect(geom.ib.left).toBeGreaterThanOrEqual(geom.wb.left - 1);
  expect(geom.ib.right).toBeLessThanOrEqual(geom.wb.right + 1);
  const imgCenter = (geom.ib.left + geom.ib.right) / 2;
  const wrapCenter = (geom.wb.left + geom.wb.right) / 2;
  expect(Math.abs(imgCenter - wrapCenter)).toBeLessThan(2);
});

test('ctrl+click bypasses the lightbox and lets the anchor behave normally', async ({ page }) => {
  await page.route('**/dist.sc2arcade.com/star-assets/**', route => route.abort());
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  // Modifier click is a pass-through — anchor default runs, no overlay opens.
  await page.locator('.icon-item a').first().click({ modifiers: ['ControlOrMeta'] });

  // Give the async dynamic-import a chance; overlay must still not appear
  await page.waitForTimeout(200);
  await expect(page.locator('.pswp')).toHaveCount(0);
});

// --- Tile geometry & image containment ---

test('grid tiles have consistent dimensions (buttons and overlays)', async ({ page }) => {
  for (const url of ['/buttons.html', '/overlays.html']) {
    await page.goto(url);
    await page.waitForSelector('.icon-item');
    const dims = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.icon-item')).slice(0, 20).map(el => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      })
    );
    const { w, h } = dims[0];
    for (const d of dims) {
      expect(d.w).toBe(w);
      expect(d.h).toBe(h);
    }
    expect(w).toBe(h); // base grid is square
  }
});

test('images stay within tile bounds (overlays has the most varied aspect ratios)', async ({ page }) => {
  await page.route('**/dist.sc2arcade.com/star-assets/**', route => route.abort());
  await page.goto('/overlays.html');
  await page.waitForSelector('.icon-item');

  const overflows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.icon-item')).slice(0, 20).map(el => {
      const tile = el.getBoundingClientRect();
      const img = el.querySelector('img').getBoundingClientRect();
      return {
        left:   img.left   >= tile.left   - 1,
        right:  img.right  <= tile.right  + 1,
        top:    img.top    >= tile.top    - 1,
        bottom: img.bottom <= tile.bottom + 1,
      };
    })
  );
  for (const o of overflows) {
    expect(o.left).toBe(true);
    expect(o.right).toBe(true);
    expect(o.top).toBe(true);
    expect(o.bottom).toBe(true);
  }
});

test('anchor fills tile in grid mode (same bounding box as .icon-item)', async ({ page }) => {
  await page.route('**/dist.sc2arcade.com/star-assets/**', route => route.abort());
  await page.goto('/buttons.html');
  await page.waitForSelector('.icon-item');

  const match = await page.evaluate(() => {
    const item = document.querySelector('.icon-item');
    const a    = item.querySelector('a');
    const ir   = item.getBoundingClientRect();
    const ar   = a.getBoundingClientRect();
    return {
      w: Math.abs(ar.width  - ir.width)  < 2,
      h: Math.abs(ar.height - ir.height) < 2,
    };
  });
  expect(match.w).toBe(true);
  expect(match.h).toBe(true);
});

test('art tiles have 3:2 aspect ratio and use object-fit: contain', async ({ page }) => {
  await page.goto('/art.html');
  await page.waitForSelector('.icon-item');
  const result = await page.evaluate(() => {
    const item = document.querySelector('.icon-item');
    const img  = item.querySelector('img');
    const r    = item.getBoundingClientRect();
    return { objectFit: getComputedStyle(img).objectFit, ratio: r.width / r.height };
  });
  expect(result.objectFit).toBe('contain');
  expect(result.ratio).toBeCloseTo(3 / 2, 1);
});

test('terrain-gallery lightbox shows two-line caption: name larger than description', async ({ page }) => {
  await page.route('**/dist.sc2arcade.com/star-assets/**', route => route.abort());
  await page.goto('/terrain-gallery.html');
  await page.waitForSelector('.icon-item');

  const expectedName = await page.locator('.icon-item').first().locator('.tooltip').textContent();

  await page.locator('.icon-item a').first().click();
  const overlay = page.locator('.pswp');
  await expect(overlay).toBeVisible();

  const nameEl = overlay.locator('.pswp__caption-name');
  const descEl = overlay.locator('.pswp__caption-desc');

  await expect(nameEl).toBeVisible();
  await expect(nameEl).toHaveText(expectedName);

  await expect(descEl).toBeVisible();
  const descText = await descEl.textContent();
  expect(descText.trim().length).toBeGreaterThan(0);

  const { nameFontSize, descFontSize } = await page.evaluate(() => {
    const n = document.querySelector('.pswp__caption-name');
    const d = document.querySelector('.pswp__caption-desc');
    return {
      nameFontSize: parseFloat(getComputedStyle(n).fontSize),
      descFontSize: parseFloat(getComputedStyle(d).fontSize),
    };
  });
  expect(nameFontSize).toBeGreaterThan(descFontSize);
});

test('portrait tiles have 2:3 aspect ratio and use object-fit: contain', async ({ page }) => {
  await page.goto('/portraits.html');
  await page.waitForSelector('.icon-item');
  const result = await page.evaluate(() => {
    const item = document.querySelector('.icon-item');
    const img  = item.querySelector('img');
    const r    = item.getBoundingClientRect();
    return { objectFit: getComputedStyle(img).objectFit, ratio: r.width / r.height };
  });
  expect(result.objectFit).toBe('contain');
  expect(result.ratio).toBeCloseTo(2 / 3, 1);
});

