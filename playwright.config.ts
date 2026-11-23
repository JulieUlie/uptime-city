import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Uptime City is static (no backend). It is served by `wrangler dev`, exactly like Cloudflare serves it
// (Python's simple server dropped module requests under parallel load). The live weather comes from
// Open-Meteo; the tests fake it with page.route so they do not depend on the real weather.
// The whole folder is the website and wrangler restarts on every change in it, so test output goes
// outside the folder.
const OUT = join(tmpdir(), 'uptime-city-playwright');
// another port when 8794 is taken: UPTIME_TEST_PORT=8797 npm test
const PORT = Number(process.env.UPTIME_TEST_PORT) || 8794;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // the game draws an animated city all the time; too many browsers at once starve each other
  workers: 3,
  // a busy machine can take more than the default 30 s just to start the game in a fresh browser
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: join(OUT, 'test-results'),
  reporter: [['list'], ['html', { open: 'never', outputFolder: join(OUT, 'report') }]],
  use: { baseURL: BASE_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'logic', testDir: './tests/logic', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium', testDir: './tests/ui', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testDir: './tests/ui', grep: /@mobile/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx wrangler dev --port ${PORT} --ip 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
