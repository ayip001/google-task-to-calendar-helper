import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/lib/test-utils/setup.ts'],
    testTimeout: 10000,
    teardownTimeout: 5000,
    // Use threads pool instead of forks for better cleanup
    pool: 'threads',
    // Vitest 4: poolOptions moved to top-level
    threads: {
      singleThread: false,
      isolate: true,
    },
    // Ensure proper cleanup
    forceRerunTriggers: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

