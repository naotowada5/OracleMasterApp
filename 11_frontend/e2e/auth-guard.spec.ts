/**
 * 認証ガードの検証。
 *
 * 対応設計書: 01_docs/02_sd/04_共通設計/認証・認可設計.md
 *             01_docs/02_sd/01_画面設計/画面遷移図.md
 *
 * 要件定義書 §5 のとおり全APIがCognito必須であり、画面側も S-03〜S-09 を
 * 未ログインで開けてはならない。
 */
import { expect, test } from './fixtures/app';

const PROTECTED_PATHS = [
  '/',
  '/exam/settings',
  '/exam',
  '/exam/explanation',
  '/questions',
  '/import',
  '/result/dummy-session',
];

test.describe('未ログイン時', () => {
  test.use({ authenticated: false });

  for (const path of PROTECTED_PATHS) {
    test(`${path} はログイン画面へリダイレクトされる`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
    });
  }

  test('保護画面を開いてもAPIを呼ばない', async ({ page, api }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);

    expect(api.requests).toHaveLength(0);
  });

  test('新規登録画面は未ログインでも開ける', async ({ page }) => {
    await page.goto('/signup');

    await expect(page.getByRole('heading', { name: '新規登録' })).toBeVisible();
  });
});

test.describe('ログイン済み時', () => {
  test('ログイン画面へアクセスするとホームへ戻される', async ({ page }) => {
    await page.goto('/login');

    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByRole('heading', { name: 'Oracle Master 学習' })).toBeVisible();
  });

  test('ログアウトするとトークンが破棄され保護画面に戻れない', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'ログアウト' }).click();

    await expect(page).toHaveURL(/\/login$/);

    // トークンが残っているとリロードで復帰してしまう
    const tokens = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((key) => key.includes('idToken')),
    );
    expect(tokens).toHaveLength(0);

    await page.goto('/exam/settings');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('APIが401を返すとログイン画面へ戻る', async ({ page, api }) => {
    api.stubError({ method: 'GET', path: '/users/me' }, 401, 'UNAUTHORIZED', '認証が必要です');

    await page.goto('/');

    // client.ts が signOut() するため、次の画面遷移でガードに掛かる
    await expect(
      page.getByText('セッションの有効期限が切れました', { exact: false }),
    ).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
  });
});
