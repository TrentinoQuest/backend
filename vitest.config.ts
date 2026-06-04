import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/index.ts'],
    testTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-at-least-thirty-two-characters!!',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '30d',
      GEO_MAX_ACCURACY_METERS: '100',
      GEO_MAX_FIX_AGE_SECONDS: '60',
      DB_RETRY_INTERVAL_MS: '1000',
      PORT: '3001',
    },
  },
});
