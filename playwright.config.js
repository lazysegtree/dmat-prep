import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:43127',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 43127 --bind 127.0.0.1 --directory website',
    url: 'http://127.0.0.1:43127',
    reuseExistingServer: false,
  },
});
