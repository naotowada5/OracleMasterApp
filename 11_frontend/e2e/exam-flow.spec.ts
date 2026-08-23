/**
 * 出題から結果表示までの通し確認（T5-1 の正常系をE2E化したもの）。
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/画面遷移図.md
 *             個別画面設計書 S-03, S-05, S-06, S-07, S-09
 */
import { expect, test, data } from './fixtures/app';

/** S-07 / S-09 の採点済み選択肢を、選択肢テキストで特定する */
function answeredChoice(page: import('@playwright/test').Page, text: string) {
  return page.locator('.exam__choices--readonly .choice', { hasText: text });
}

test('S-03 → S-05 → S-06 → S-07 → S-09 を通しで操作できる', async ({ page, api }) => {
  // --- S-03 メイン画面 -------------------------------------------------
  await page.goto('/');
  await expect(page.getByText(`${data.TEST_USER.displayName} さん`)).toBeVisible();
  // 問題作成・インポートは Phase3 のため非活性（要件定義書 F-02）
  await expect(page.getByRole('button', { name: '問題作成・インポート' })).toBeDisabled();

  await page.getByRole('button', { name: '問題スタート' }).click();

  // --- S-05 出題設定画面 -----------------------------------------------
  await expect(page).toHaveURL(/\/exam\/settings$/);
  await page.getByLabel('資格種別').selectOption('1Z0-082-JPN');
  await page.getByLabel('出題数').fill('2');
  await page.getByRole('button', { name: '出題開始' }).click();

  // --- S-06 出題画面（1問目・複数選択） --------------------------------
  await expect(page).toHaveURL(/\/exam$/);

  // API-04 → API-07 の順に呼ばれる（S-05 §4）
  expect(api.callsTo('POST', '/questions/random').at(0)?.body).toMatchObject({
    qualificationId: '1Z0-082-JPN',
    questionCount: 2,
  });
  // API-07 には API-04 が返した実際の出題数を渡す
  expect(api.callsTo('POST', '/sessions').at(0)?.body).toMatchObject({ totalQuestions: 2 });

  await expect(page.getByRole('heading', { name: '問題 1 / 2' })).toBeVisible();
  await expect(page.getByText('正しいものを2つ選んでください')).toBeVisible();
  // 制限時間なしの場合はタイマーを出さない
  await expect(page.locator('.exam__timer')).toHaveCount(0);

  // 正解1つ（A）＋不正解1つ（B）を選ぶ ＝ 部分正解
  await page.getByRole('button', { name: /正しい記述その1/ }).click();
  await page.getByRole('button', { name: /誤った記述その1/ }).click();
  await page.getByRole('button', { name: '決定' }).click();

  // 選択内容がそのまま送信される
  const answerCall = api.callsTo('PUT', /^\/sessions\//).at(0);
  expect(answerCall?.body).toMatchObject({
    action: 'answer',
    questionId: data.MULTI_QUESTION_ID,
    selectedChoiceIds: ['ch-m1', 'ch-m2'],
  });

  // --- S-07 解説画面（部分正解 ＝ 不正解） ------------------------------
  await expect(page).toHaveURL(/\/exam\/explanation$/);
  // 完全一致でないので不正解（要件定義書 F-04）
  await expect(page.locator('.judgement')).toHaveText('✕ 不正解');
  await expect(page.locator('.explanation__body')).toHaveText(data.MULTI_EXPLANATION);

  // 選んで正解だったもの: 緑＋「あなたの回答」「正解」
  const chosenCorrect = answeredChoice(page, '正しい記述その1');
  await expect(chosenCorrect).toHaveClass(/choice--correct/);
  await expect(chosenCorrect).not.toHaveClass(/choice--wrong-selection/);
  await expect(chosenCorrect.locator('.choice__mark')).toHaveText(['あなたの回答', '正解']);

  // 選んだが不正解だったもの: 赤枠＋「あなたの回答」のみ
  const chosenWrong = answeredChoice(page, '誤った記述その1');
  await expect(chosenWrong).toHaveClass(/choice--wrong-selection/);
  await expect(chosenWrong).not.toHaveClass(/choice--correct/);
  await expect(chosenWrong.locator('.choice__mark')).toHaveText(['あなたの回答']);

  // 選ばなかった正解: 緑＋「正解」のみ
  const missedCorrect = answeredChoice(page, '正しい記述その2');
  await expect(missedCorrect).toHaveClass(/choice--correct/);
  await expect(missedCorrect.locator('.choice__mark')).toHaveText(['正解']);

  // 選ばず不正解でもあるもの: 装飾なし
  const untouched = answeredChoice(page, '誤った記述その2');
  await expect(untouched).not.toHaveClass(/choice--correct/);
  await expect(untouched).not.toHaveClass(/choice--wrong-selection/);
  await expect(untouched.locator('.choice__mark')).toHaveCount(0);

  // --- S-06 出題画面（2問目・単一選択） --------------------------------
  await page.getByRole('button', { name: '次の問題へ' }).click();
  await expect(page.getByRole('heading', { name: '問題 2 / 2' })).toBeVisible();
  // 単一選択に「◯つ選んでください」の案内と決定ボタンは出さない
  await expect(page.getByText('選んでください', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '決定' })).toHaveCount(0);

  // 単一選択は選択と同時に送信される（S-06 §4 操作1）
  await page.getByRole('button', { name: /唯一の正解/ }).click();

  // --- S-07 解説画面（正解） -------------------------------------------
  await expect(page).toHaveURL(/\/exam\/explanation$/);
  await expect(page.locator('.judgement')).toHaveText('◯ 正解');
  // 正解時は赤枠が一切出ない
  await expect(page.locator('.choice--wrong-selection')).toHaveCount(0);

  // --- S-09 解答結果画面 ------------------------------------------------
  await page.getByRole('button', { name: '結果を見る' }).click();
  await expect(page).toHaveURL(new RegExp(`/result/${data.SESSION_ID}$`));

  // 終了時に API-08 の finish が呼ばれている
  const finishCalls = api
    .callsTo('PUT', /^\/sessions\//)
    .filter((request) => request.body?.action === 'finish');
  expect(finishCalls).toHaveLength(1);

  // 2問中1問正解 ＝ 正答率50%
  const summary = page.locator('.result__summary');
  await expect(summary).toContainText('総問題数');
  await expect(summary.locator('dd')).toHaveText(['2', '1', '1', '50%']);

  // 問題別正誤は ✕ → ◯ の順
  await expect(page.locator('.result__cell-mark')).toHaveText(['✕', '◯']);

  // --- S-09 問題別詳細（今回追加した動線） ------------------------------
  const beforeDetail = api.requests.length;
  await page.getByRole('button', { name: /問題1（不正解）の詳細を見る/ }).click();

  await expect(page.getByRole('heading', { name: '問題 1 の詳細' })).toBeVisible();
  await expect(page.locator('.judgement')).toHaveText('✕ 不正解');
  await expect(page.locator('.exam__question-text')).toHaveText(
    '正しい記述を2つ選択してください。',
  );
  await expect(page.locator('.explanation__body')).toHaveText(data.MULTI_EXPLANATION);
  // 取得済みデータから描画するため追加のAPI呼び出しはしない
  expect(api.requests).toHaveLength(beforeDetail);

  // S-07 と同じハイライト表現になっている
  await expect(answeredChoice(page, '誤った記述その1')).toHaveClass(/choice--wrong-selection/);
  await expect(answeredChoice(page, '正しい記述その2').locator('.choice__mark')).toHaveText([
    '正解',
  ]);

  // 一覧へ戻れる
  await page.getByRole('button', { name: '＜ 結果一覧に戻る' }).click();
  await expect(page.locator('.result__summary')).toBeVisible();
});

test('「もう一度挑戦」で前回の出題条件が復元される', async ({ page }) => {
  await page.goto('/exam/settings');
  await page.getByLabel('資格種別').selectOption('1Z0-082-JPN');
  await page.getByLabel('出題数').fill('2');
  await page.getByLabel('制限時間（分）').fill('30');
  await page.getByRole('button', { name: '出題開始' }).click();

  await expect(page).toHaveURL(/\/exam$/);
  await page.getByRole('button', { name: /正しい記述その1/ }).click();
  await page.getByRole('button', { name: /正しい記述その2/ }).click();
  await page.getByRole('button', { name: '決定' }).click();
  await page.getByRole('button', { name: '次の問題へ' }).click();
  await page.getByRole('button', { name: /唯一の正解/ }).click();
  await page.getByRole('button', { name: '結果を見る' }).click();

  await page.getByRole('button', { name: 'もう一度挑戦' }).click();

  await expect(page).toHaveURL(/\/exam\/settings$/);
  await expect(page.getByLabel('資格種別')).toHaveValue('1Z0-082-JPN');
  await expect(page.getByLabel('出題数')).toHaveValue('2');
  await expect(page.getByLabel('制限時間（分）')).toHaveValue('30');
});

test('S-08 問題閲覧は正解と解説を最初から表示する', async ({ page, api }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '問題閲覧' }).click();

  await expect(page).toHaveURL(/\/questions$/);
  await page.getByLabel('資格種別').selectOption('1Z0-082-JPN');

  // 大問で絞り込むと categoryId 付きで再取得する（S-08 §4 操作2）
  await page.getByLabel('大問').selectOption({ label: 'Oracleインスタンスの構造' });
  await expect
    .poll(() =>
      api.callsTo('GET', '/questions').some((request) => request.query.categoryId === 'cat-1'),
    )
    .toBe(true);

  await page.getByRole('button', { name: /正しい記述を2つ選択してください/ }).click();

  await expect(page.getByRole('heading', { name: '問題詳細' })).toBeVisible();
  await expect(page.locator('.explanation__body')).toHaveText(data.MULTI_EXPLANATION);
  // 閲覧画面は正解のみを示す（「あなたの回答」は存在しない）
  await expect(page.locator('.choice--correct')).toHaveCount(2);

  // 閲覧はセッションを作らない
  expect(api.callsTo('POST', '/sessions')).toHaveLength(0);
});
