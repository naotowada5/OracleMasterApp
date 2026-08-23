import { defineConfig, devices } from '@playwright/test';

/**
 * 非機能確認（T5-3）用の設定。
 *
 * 対応設計書: 01_docs/02_sd/04_共通設計/非機能設計.md §1, §3
 *             01_docs/01_ra/requirements3.md §8.1, §8.5
 *
 * 機能テスト（playwright.config.ts）が開発サーバを使うのに対し、こちらは
 * **本番ビルドを配信して**計測する。Service Worker は `import.meta.env.PROD`
 * のときだけ登録されるため、開発サーバでは PWA の確認ができない。
 */
const PORT = 5175;

export default defineConfig({
  testDir: './e2e-perf',
  // 計測結果が並列実行の負荷に影響されないよう直列で流す
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build -- --mode e2e && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
