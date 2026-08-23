/**
 * 異常系の確認（T5-1 のうち手動では再現しにくいもの）。
 *
 * 対応設計書: S-05 §5, S-06 §4・§6, S-09 §6
 *             01_docs/02_sd/04_共通設計/エラーハンドリング方針.md
 */
import { expect, test, data } from './fixtures/app';

/** S-05 で出題を開始し、S-06 まで進める */
async function startExam(page: import('@playwright/test').Page, timeLimitMin?: number) {
  await page.goto('/exam/settings');
  await page.getByLabel('資格種別').selectOption('1Z0-082-JPN');
  await page.getByLabel('出題数').fill('2');
  if (timeLimitMin !== undefined) {
    await page.getByLabel('制限時間（分）').fill(String(timeLimitMin));
  }
  await page.getByRole('button', { name: '出題開始' }).click();
  await expect(page).toHaveURL(/\/exam$/);
}

test.describe('S-05 出題設定', () => {
  test('出題数が範囲外なら送信せずにエラーを出す', async ({ page, api }) => {
    await page.goto('/exam/settings');
    await page.getByLabel('出題数').fill('101');
    await page.getByRole('button', { name: '出題開始' }).click();

    await expect(page.getByRole('alert')).toContainText('出題数は1〜100の範囲で入力してください');
    expect(api.callsTo('POST', '/questions/random')).toHaveLength(0);
  });

  test('制限時間が0以下なら送信せずにエラーを出す', async ({ page, api }) => {
    await page.goto('/exam/settings');
    await page.getByLabel('制限時間（分）').fill('0');
    await page.getByRole('button', { name: '出題開始' }).click();

    await expect(page.getByRole('alert')).toContainText('制限時間は1分以上で入力してください');
    expect(api.callsTo('POST', '/sessions')).toHaveLength(0);
  });

  test('対象問題が指定数に満たない場合は警告を持ち越して出題を継続する', async ({ page }) => {
    await page.goto('/exam/settings');
    await page.getByLabel('出題数').fill('50');
    await page.getByRole('button', { name: '出題開始' }).click();

    // 警告を出しても処理は中断しない（S-05 §5）
    await expect(page).toHaveURL(/\/exam$/);
    await expect(page.getByRole('heading', { name: '問題 1 / 2' })).toBeVisible();

    // S-05 に留まらないため、警告は S-06 で読める
    const warning = page.getByText('対象の問題が2問しかないため、2問で出題します');
    await expect(warning).toBeVisible();

    // 読み終えたら閉じられる
    await page.getByRole('button', { name: '警告を閉じる' }).click();
    await expect(warning).toHaveCount(0);

    // 次の問題へ進んでも再表示されない
    await page.getByRole('button', { name: /正しい記述その1/ }).click();
    await page.getByRole('button', { name: /正しい記述その2/ }).click();
    await page.getByRole('button', { name: '決定' }).click();
    await page.getByRole('button', { name: '次の問題へ' }).click();
    await expect(page.getByRole('heading', { name: '問題 2 / 2' })).toBeVisible();
    await expect(warning).toHaveCount(0);
  });

  test('出題数が足りている場合は警告を出さない', async ({ page }) => {
    await page.goto('/exam/settings');
    await page.getByLabel('出題数').fill('2');
    await page.getByRole('button', { name: '出題開始' }).click();

    await expect(page.getByRole('heading', { name: '問題 1 / 2' })).toBeVisible();
    await expect(page.locator('.feedback--warning')).toHaveCount(0);
  });

  test('APIエラー時は画面に留まりメッセージを出す', async ({ page, api }) => {
    api.stubError(
      { method: 'POST', path: '/questions/random' },
      500,
      'INTERNAL_ERROR',
      'サーバーエラー',
    );

    await page.goto('/exam/settings');
    await page.getByRole('button', { name: '出題開始' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'エラーが発生しました。時間をおいて再度お試しください',
    );
    await expect(page).toHaveURL(/\/exam\/settings$/);
  });
});

test.describe('S-06 出題', () => {
  test('多重送信しても採点APIは1度しか呼ばれない', async ({ page, api }) => {
    // 送信中の状態を観測できるように応答を遅らせる
    api.stub({ method: 'PUT', path: /^\/sessions\// }, async (route, request) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const questionId = String(request.body?.questionId ?? '');
      const selected = (request.body?.selectedChoiceIds as string[]) ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data.buildAnswerResult(questionId, selected)),
      });
    });

    await startExam(page);
    await page.getByRole('button', { name: /正しい記述その1/ }).click();
    await page.getByRole('button', { name: /正しい記述その2/ }).click();

    const submit = page.getByRole('button', { name: '決定' });
    await submit.click();

    // 送信中はボタンと選択肢が操作不能になる
    const submitting = page.getByRole('button', { name: '送信中…' });
    await expect(submitting).toBeDisabled();
    await expect(page.getByRole('button', { name: /正しい記述その1/ })).toBeDisabled();

    // 無効化を無視して押しても二重送信にならない
    await submitting.dispatchEvent('click');
    await submitting.dispatchEvent('click');

    await expect(page).toHaveURL(/\/exam\/explanation$/);
    expect(api.callsTo('PUT', /^\/sessions\//)).toHaveLength(1);
  });

  test('複数選択は1つも選ばないと決定できない', async ({ page }) => {
    await startExam(page);

    await expect(page.getByRole('button', { name: '決定' })).toBeDisabled();

    await page.getByRole('button', { name: /正しい記述その1/ }).click();
    await expect(page.getByRole('button', { name: '決定' })).toBeEnabled();

    // 選び直して0件に戻すと再び押せなくなる
    await page.getByRole('button', { name: /正しい記述その1/ }).click();
    await expect(page.getByRole('button', { name: '決定' })).toBeDisabled();
  });

  test('制限時間切れでセッションを終了し結果画面へ遷移する', async ({ page, api }) => {
    await page.clock.install();
    await startExam(page, 1);

    await expect(page.locator('.exam__timer')).toContainText('残り 01:00');

    // 1分経過させる
    await page.clock.runFor(61_000);

    await expect(page).toHaveURL(new RegExp(`/result/${data.SESSION_ID}$`));

    // 未回答のまま終了処理が呼ばれている（S-06 §4 時間切れ）
    const finish = api
      .callsTo('PUT', /^\/sessions\//)
      .filter((request) => request.body?.action === 'finish');
    expect(finish).toHaveLength(1);
    expect(
      api.callsTo('PUT', /^\/sessions\//).filter((r) => r.body?.action === 'answer'),
    ).toHaveLength(0);
  });

  test('セッションなしで直接開くと出題設定へ戻せる', async ({ page }) => {
    await page.goto('/exam');

    await expect(page.getByRole('alert')).toContainText('出題セッションが開始されていません');
    await page.getByRole('button', { name: '出題設定へ' }).click();
    await expect(page).toHaveURL(/\/exam\/settings$/);
  });

  test('採点結果なしで解説画面を直接開くとエラーになる', async ({ page }) => {
    await page.goto('/exam/explanation');

    await expect(page.getByRole('alert')).toContainText('採点結果がありません');
  });
});

test.describe('S-09 結果', () => {
  test('未回答の問題は不正解として数え、詳細は開けない', async ({ page, api }) => {
    api.stub({ method: 'GET', path: /^\/sessions\// }, async (route) => {
      const detail = data.buildSessionDetail([
        {
          questionId: data.MULTI_QUESTION_ID,
          isCorrect: true,
          selectedChoiceIds: data.MULTI_CORRECT_IDS,
        },
      ]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // 2問中1問しか回答していない状態
        body: JSON.stringify({ ...detail, correctCount: 1 }),
      });
    });

    await page.goto(`/result/${data.SESSION_ID}`);

    // 不正解数 ＝ 総問題数 − 正解数（未回答も不正解に含む）
    await expect(page.locator('.result__summary dd')).toHaveText(['2', '1', '1', '50%']);
    await expect(page.locator('.result__cell-mark')).toHaveText(['◯', '✕']);

    // 未回答分は押下できない
    await expect(page.locator('.result__cell--unanswered')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /詳細を見る/ })).toHaveCount(1);
  });

  test('未終了のセッションでは警告を出しつつ取得できた範囲を表示する', async ({ page, api }) => {
    api.stub({ method: 'GET', path: /^\/sessions\// }, async (route) => {
      const detail = data.buildSessionDetail([]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...detail, status: 'in_progress' }),
      });
    });

    await page.goto(`/result/${data.SESSION_ID}`);

    await expect(
      page.getByText('このセッションはまだ終了していません', { exact: false }),
    ).toBeVisible();
  });

  test('取得失敗時は再読み込みで復帰できる', async ({ page, api }) => {
    // 開発モードの StrictMode で useEffect が2回走るため、回数ではなく
    // 明示的なフラグで成功／失敗を切り替える
    let shouldFail = true;
    api.stub({ method: 'GET', path: /^\/sessions\// }, async (route) => {
      if (shouldFail) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'failed' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          data.buildSessionDetail([
            {
              questionId: data.SINGLE_QUESTION_ID,
              isCorrect: true,
              selectedChoiceIds: [data.SINGLE_CORRECT_ID],
            },
          ]),
        ),
      });
    });

    await page.goto(`/result/${data.SESSION_ID}`);
    await expect(page.getByRole('alert')).toBeVisible();

    shouldFail = false;
    await page.getByRole('button', { name: '再読み込み' }).click();

    await expect(page.locator('.result__summary')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
