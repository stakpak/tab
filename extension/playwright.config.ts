import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  workers: 1, // Run tests serially to avoid port conflicts
  retries: 1,
  use: {
    headless: false,
  },
});
