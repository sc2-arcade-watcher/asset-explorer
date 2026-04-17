import { defineConfig, devices } from '@playwright/test';

// Tests run against a live Caddy+imageproxy stack. Start it with `make up`
// (or `make dev`), or let `make test` do it for you. BASE_URL defaults to
// http://localhost:8080 — override via the HTTP_PORT / BASE_URL env vars.
export default defineConfig({
  testDir: './test',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
  },
  reporter: 'list',

  projects: [
    // HTTP-only tests — no browser required
    {
      name: 'api',
      testMatch: /smoke\.spec\.js/,
    },
    // Browser tests
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /browser\.spec\.js/,
    },
  ],
});
