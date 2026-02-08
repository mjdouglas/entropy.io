import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default environment for tests
    environment: 'node',

    // Test file patterns
    include: ['tests/**/*.test.js'],

    // Global setup
    setupFiles: ['./tests/setup.js'],

    // Browser mode configuration (enabled per-file via comment)
    browser: {
      enabled: false,
      name: 'chromium',
      provider: playwright(),
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['js/**/*.js'],
    },
  },
});
