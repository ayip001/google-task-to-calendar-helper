import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/lib/test-utils/setup.ts'],
              testTimeout: 30000,
              hookTimeout: 30000,
              teardownTimeout: 5000,
    pool: 'threads',
    threads: {
      singleThread: true,
      isolate: true,
    },
    forceRerunTriggers: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

