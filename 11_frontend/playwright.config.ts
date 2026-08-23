import { defineConfig, devices } from '@playwright/test';

/**
 * E2Eテスト設定（T5-2）
 *
 * 対応設計書: 01_docs/03_dev/開発タスク一覧.md T5-2
 *
 * テストは `--mode e2e` で起動した開発サーバに対して実行する。この モードでは
 * `.env.e2e` が読み込まれ、APIの向き先がテスト用の同一オリジンURLになる。
 * API・Cognito はテスト側でモックするため、AWS環境や認証情報を必要としない。
 */
const PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      // スマートフォン表示。要件定義書 §8.4 の下限に近い375px幅で確認する。
      // Safari/Firefox など他エンジンでの互換性確認は T5-3 で別途行う
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --mode e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
