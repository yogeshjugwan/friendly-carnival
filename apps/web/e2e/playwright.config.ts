import { defineConfig } from '@playwright/test';

/** Local-only smoke test. Not part of CI: see e2e/README.md. */
export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    permissions: ['camera', 'microphone'],
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
