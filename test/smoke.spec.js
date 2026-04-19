import { test, expect } from '@playwright/test';

// All HTML pages the site serves
const pages = [
  '/',
  '/buttons.html',
  '/icons.html',
  '/art.html',
  '/portraits.html',
  '/overlays.html',
  '/consoles.html',
  '/ui.html',
  '/wireframes.html',
  '/models.html',
  '/terrain-cliffs.html',
  '/terrain-doodads.html',
  '/terrain-tilesets.html',
];

// Core JS/CSS that every page depends on
const assets = [
  '/src/script.js',
  '/src/styles.css',
  '/src/player.js',
  '/src/discord-widgets.js',
];

// Asset list JSON — a subset covering the three category shapes
const listFiles = [
  '/list/buttons.json',
  '/list/models.json',
  '/list/terrain-cliffs.json',
];

test.describe('pages', () => {
  for (const path of pages) {
    test(path, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
    });
  }
});

test.describe('static assets', () => {
  for (const path of assets) {
    test(path, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
    });
  }
});

test.describe('asset list JSON', () => {
  for (const path of listFiles) {
    test(path, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
    });
  }
});

test('unknown path → 404', async ({ request }) => {
  const res = await request.get('/definitely-does-not-exist');
  expect(res.status()).toBe(404);
});

test('404 page renders Caddy templates (meta tags present)', async ({ request }) => {
  const res = await request.get('/definitely-does-not-exist');
  const body = await res.text();

  // Template tags must NOT appear raw in the response
  expect(body).not.toContain('{{');

  const title = body.match(/<title>([^<]+)<\/title>/);
  expect(title, '<title> present').not.toBeNull();
  expect(title[1].trim().length).toBeGreaterThan(0);

  const metas = [
    ['property', 'og:title'],
    ['property', 'og:image'],
    ['property', 'og:type'],
  ];
  for (const [attr, key] of metas) {
    const re = new RegExp(
      `<meta[^>]*${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*content=["']([^"']+)["']`,
      'i'
    );
    expect(body.match(re), `${attr}="${key}" present in 404`).not.toBeNull();
  }
});

// Guard against wrong file being served at these paths
test('script.js exports createItemList', async ({ request }) => {
  const body = await (await request.get('/src/script.js')).text();
  expect(body).toContain('createItemList');
});

test('player.js defines glb-viewer element', async ({ request }) => {
  const body = await (await request.get('/src/player.js')).text();
  expect(body).toContain('glb-viewer');
});

// Loose SEO/OG checks — assert that the server-rendered HTML includes the
// tags crawlers and link unfurlers care about. We verify presence and
// non-emptiness only; copy can be edited freely without breaking tests.
test.describe('SEO meta tags (server-rendered via Caddy templates)', () => {
  for (const path of pages) {
    test(path, async ({ request }) => {
      const body = await (await request.get(path)).text();

      const title = body.match(/<title>([^<]+)<\/title>/);
      expect(title, '<title> present').not.toBeNull();
      expect(title[1].trim().length).toBeGreaterThan(0);

      // For each meta tag we assert the attribute is present with a non-empty
      // content. The regex tolerates attribute order and quote style.
      const metas = [
        ['name', 'description'],
        ['property', 'og:title'],
        ['property', 'og:description'],
        ['property', 'og:image'],
        ['property', 'og:type'],
      ];
      for (const [attr, key] of metas) {
        const re = new RegExp(
          `<meta[^>]*${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*content=["']([^"']+)["']`,
          'i'
        );
        const m = body.match(re);
        expect(m, `${attr}="${key}" present in ${path}`).not.toBeNull();
        expect(m[1].length).toBeGreaterThan(0);
      }

      // og:image should point at arc.png per the project convention.
      const ogImage = body.match(
        /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
      );
      expect(ogImage[1]).toMatch(/arc\.png$/);
    });
  }
});
