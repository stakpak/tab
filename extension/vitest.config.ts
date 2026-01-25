import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
