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

// INI data files — a subset covering the standard pair + special types
const iniFiles = [
  '/list/buttons.ini',
  '/list/buttons-png.ini',
  '/list/models.ini',
  '/list/models-png.ini',
  '/list/models-glb.ini',
  '/list/textures.ini',
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

test.describe('INI data files', () => {
  for (const path of iniFiles) {
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

// Guard against wrong file being served at these paths
test('script.js exports createItemList', async ({ request }) => {
  const body = await (await request.get('/src/script.js')).text();
  expect(body).toContain('createItemList');
});

test('player.js defines glb-viewer element', async ({ request }) => {
  const body = await (await request.get('/src/player.js')).text();
  expect(body).toContain('glb-viewer');
});
