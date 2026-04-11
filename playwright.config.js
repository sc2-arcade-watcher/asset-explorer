import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
  },
  reporter: 'list',

  // When BASE_URL is not set (CI or local without a running stack),
  // spin up a plain static file server against site/.
  // Set reuseExistingServer so local iterating doesn't restart the server each run.
  webServer: process.env.BASE_URL ? undefined : {
    command: 'python3 -m http.server 8080 --directory site',
    port: 8080,
    reuseExistingServer: !process.env.CI,
  },

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
