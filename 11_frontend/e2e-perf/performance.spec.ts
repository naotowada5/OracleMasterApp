/**
 * 初回表示時間とPWAの確認（T5-3）。
 *
 * 対応設計書: 01_docs/01_ra/requirements3.md §8.1（Webアプリ初回表示3秒以内）
 *             01_docs/02_sd/04_共通設計/非機能設計.md §3（PWA・オフライン対応）
 *
 * 本番ビルドを `vite preview` で配信して計測する。数値はテスト出力に残すので、
 * バンドルが肥大化したときに前回との差が追える。
 */
import { expect, test, type CDPSession, type Page } from '@playwright/test';

/** 要件定義書 §8.1 の初回表示時間 */
const FIRST_PAINT_BUDGET_MS = 3000;

interface Timings {
  /** 最初のコンテンツが描画されるまで */
  firstContentfulPaint: number;
  domContentLoaded: number;
  load: number;
  /** 転送量の合計（バイト） */
  transferBytes: number;
  requestCount: number;
}

async function measure(page: Page): Promise<Timings> {
  // FCP はロード完了より後に記録されることがあるため出現を待つ
  await page.waitForFunction(
    () => performance.getEntriesByName('first-contentful-paint').length > 0,
  );

  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]!;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    return {
      firstContentfulPaint: fcp.startTime,
      domContentLoaded: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      transferBytes:
        nav.transferSize + resources.reduce((total, entry) => total + entry.transferSize, 0),
      requestCount: resources.length + 1,
    };
  });
}

function report(label: string, timings: Timings): void {
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)}KB`;
  console.log(
    `  ${label}: FCP=${timings.firstContentfulPaint.toFixed(0)}ms ` +
      `DOMContentLoaded=${timings.domContentLoaded.toFixed(0)}ms ` +
      `load=${timings.load.toFixed(0)}ms ` +
      `転送=${kb(timings.transferBytes)}/${timings.requestCount}件`,
  );
}

/** Chrome DevTools の «Fast 3G» 相当に絞る */
async function throttleToFast3G(client: CDPSession): Promise<void> {
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  });
}

test('初回表示（キャッシュなし・回線制限なし）', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'load' });
  await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();

  const timings = await measure(page);
  report('回線制限なし', timings);

  expect(timings.firstContentfulPaint).toBeLessThan(FIRST_PAINT_BUDGET_MS);
});

test('初回表示（キャッシュなし・Fast 3G 相当）', async ({ page, context }) => {
  const client = await context.newCDPSession(page);
  await throttleToFast3G(client);

  await page.goto('/login', { waitUntil: 'load' });
  await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();

  const timings = await measure(page);
  report('Fast 3G', timings);

  // 実回線に近い条件でも要件を満たすこと
  expect(timings.firstContentfulPaint).toBeLessThan(FIRST_PAINT_BUDGET_MS);
});

test('Service Worker が登録され、オフラインでもアプリシェルが起動する', async ({
  page,
  context,
}) => {
  await page.goto('/login', { waitUntil: 'load' });

  // 登録完了とページ制御の取得を待つ
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'load' });
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  // ネットワークを落としても起動画面までは出る（非機能設計 §3）
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });

  await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
  await expect(page.getByLabel('メールアドレス')).toBeVisible();

  await context.setOffline(false);
});

test('マニフェストが参照するアイコンが実在する', async ({ request }) => {
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
    icons: { src: string; sizes: string; type: string }[];
  };
  expect(manifest.icons.length).toBeGreaterThan(0);

  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status(), `${icon.src} が配信されていない`).toBe(200);

    // SPAのフォールバックで index.html が返ると 200 になってしまうため中身で確認する
    const body = await response.body();
    expect(body.subarray(0, 8).toString('hex'), `${icon.src} がPNGではない`).toBe(
      '89504e470d0a1a0a',
    );

    // PNGヘッダの幅・高さが manifest の宣言と一致すること
    const [declared] = icon.sizes.split('x');
    expect(body.readUInt32BE(16), `${icon.src} の幅が宣言と違う`).toBe(Number(declared));
    expect(body.readUInt32BE(20), `${icon.src} の高さが宣言と違う`).toBe(Number(declared));
  }
});

test('Service Worker はAPIレスポンスをキャッシュしない', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker.ready);

  // 認証付きの動的データを端末に残さない方針（Phase2 で改めて検討）
  const cachedUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return urls;
  });

  console.log(`  キャッシュ対象: ${cachedUrls.length}件`);
  expect(cachedUrls.some((url) => url.includes('/api/'))).toBe(false);
});
