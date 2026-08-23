/**
 * レイアウトとPWA設定の確認。
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/画面一覧.md §画面共通仕様
 *             01_docs/01_ra/requirements3.md §8.4
 *
 * chromium（デスクトップ幅）と mobile（375px幅）の両プロジェクトで実行され、
 * どちらの幅でも横スクロールが出ないことを確認する。
 */
import { expect, test, data } from './fixtures/app';

/** 画面幅を超えてページが広がっていないか */
async function hasHorizontalOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test('主要画面で横スクロールが発生しない', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(`${data.TEST_USER.displayName} さん`)).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);

  await page.getByRole('button', { name: '問題スタート' }).click();
  await page.getByRole('button', { name: '出題開始' }).click();
  await expect(page).toHaveURL(/\/exam$/);
  expect(await hasHorizontalOverflow(page)).toBe(false);

  // 選択肢が並ぶ解説画面はもっとも横幅を使う
  await page.getByRole('button', { name: /正しい記述その1/ }).click();
  await page.getByRole('button', { name: '決定' }).click();
  await expect(page.locator('.judgement')).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);

  // マス目が並ぶ結果画面
  await page.getByRole('button', { name: '次の問題へ' }).click();
  await page.getByRole('button', { name: /唯一の正解/ }).click();
  await page.getByRole('button', { name: '結果を見る' }).click();
  await expect(page.locator('.result__summary')).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test('PWAのマニフェストとテーマカラーが配信される', async ({ page, request }) => {
  await page.goto('/login');

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1a4f8a');

  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const body = (await manifest.json()) as { name: string; start_url: string; display: string };
  expect(body.start_url).toBe('/');
  expect(body.display).toBe('standalone');
});
