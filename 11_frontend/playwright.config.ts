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
  /**
   * 要件定義書 §8.4 の対応ブラウザを網羅する。
   *
   * Firefox は対応表に含まれないうえ、Playwright 同梱ビルドの起動に
   * Microsoft Visual C++ 再頒布可能パッケージが必要で、未導入の Windows では
   * `spawn UNKNOWN` で失敗する。既定では実行せず、必要なときだけ
   * `PW_FIREFOX=1` を付けて有効化する。
   */
  projects: [
    // PC: Chrome
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // PC: Edge（Chromium ベースだが、実機のチャネルで確認する）
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    // PC: Safari
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // スマートフォン: Android Chrome。§8.4 の下限に近い375px幅で確認する
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 } },
    },
    // スマートフォン: iOS Safari 15以上
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
    ...(process.env.PW_FIREFOX
      ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }]
      : []),
  ],
  webServer: {
    command: `npm run dev -- --mode e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
