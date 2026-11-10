import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';

export default defineConfig({
  plugins: [cloudflareTest({ main: './test/worker-entry.ts', miniflare: { compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'] } })],
  test: { include: ['test/**/*.test.ts'] },
});
