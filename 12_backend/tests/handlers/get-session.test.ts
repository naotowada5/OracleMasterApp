import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

jest.mock('../../src/common/dynamodb');

import { getItem, query } from '../../src/common/dynamodb';
import { handler } from '../../src/handlers/get-session';

const mockGetItem = getItem as jest.MockedFunction<typeof getItem>;
const mockQuery = query as jest.MockedFunction<typeof query>;
const CONTEXT = {} as Context;

const AUDIT = {
  createdAt: '2026-08-18T10:00:00.000Z',
  createdBy: 'owner-sub',
  updatedAt: '2026-08-18T10:26:00.000Z',
  updatedBy: 'owner-sub',
};

const SESSION = {
  sessionId: 's-1',
  userId: 'owner-sub',
  qualificationId: '1Z0-085-JPN',
  totalQuestions: 20,
  correctCount: 16,
  timeLimitMin: 30,
  elapsedSec: 1580,
  status: 'completed' as const,
  startedAt: '2026-08-18T10:00:00.000Z',
  finishedAt: '2026-08-18T10:26:20.000Z',
  ...AUDIT,
};

const QUESTION = {
  questionId: 'q-1',
  qualificationId: '1Z0-085-JPN',
  categoryId: 'c-1',
  questionText: '問題文です',
  questionType: 'single' as const,
  correctCount: 1,
  explanation: '事前登録済みの解説',
  isActive: true,
  ...AUDIT,
};

const CHOICES = [
  {
    choiceId: 'ch-2',
    questionId: 'q-1',
    label: 'B',
    choiceText: 'B案',
    isCorrect: false,
    sortOrder: 2,
    ...AUDIT,
  },
  {
    choiceId: 'ch-1',
    questionId: 'q-1',
    label: 'A',
    choiceText: 'A案',
    isCorrect: true,
    sortOrder: 1,
    ...AUDIT,
  },
];

/**
 * getItem はセッションと問題の両方で呼ばれるため、テーブル名で応答を切り替える。
 * @param question 問題本体。null を渡すと「取得できなかった」状態を再現する
 */
function setItems(
  sessionOverrides: Record<string, unknown> | null = {},
  question: unknown = QUESTION,
) {
  mockGetItem.mockImplementation(async (table: string) => {
    if (table.includes('OR_M_QUESTION')) return (question === null ? undefined : question) as never;
    return sessionOverrides === null ? undefined : ({ ...SESSION, ...sessionOverrides } as never);
  });
}

function history(questionId: string, isCorrect: boolean, answeredAt: string) {
  return {
    historyId: `h-${questionId}`,
    sessionId: 's-1',
    questionId,
    selectedChoiceIds: ['ch-1'],
    isCorrect,
    answeredAt,
    ...AUDIT,
  };
}

function buildEvent(
  sub = 'owner-sub',
  sessionId: string | undefined = 's-1',
): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/sessions/s-1',
    headers: {},
    pathParameters: sessionId ? { sessionId } : null,
    requestContext: { requestId: 'req-1', authorizer: { claims: { sub } } },
  } as unknown as APIGatewayProxyEvent;
}

/** query は 1回目=回答履歴、2回目以降=選択肢 の順に呼ばれる */
function mockHistories(histories: unknown[]) {
  mockQuery
    .mockResolvedValueOnce({ items: histories as never[], lastEvaluatedKey: undefined })
    .mockResolvedValue({ items: CHOICES, lastEvaluatedKey: undefined });
}

describe('API-09 セッション取得', () => {
  beforeEach(() => {
    process.env.TABLE_NAME_PREFIX = 'dev';
    process.env.LOG_LEVEL = 'ERROR';
    jest.resetAllMocks();
    setItems();
    mockQuery.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });
  });

  it('サマリを返す', async () => {
    const body = JSON.parse((await handler(buildEvent(), CONTEXT)).body);

    expect(body).toMatchObject({
      sessionId: 's-1',
      totalQuestions: 20,
      correctCount: 16,
      status: 'completed',
    });
  });

  it('他ユーザーのセッションは 403', async () => {
    const result = await handler(buildEvent('other-sub'), CONTEXT);

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error.code).toBe('FORBIDDEN');
  });

  it('存在しないセッションは 404', async () => {
    setItems(null);

    const result = await handler(buildEvent(), CONTEXT);

    expect(result.statusCode).toBe(404);
  });

  it('回答履歴を answeredAt 昇順で返す', async () => {
    mockHistories([
      history('q-3', false, '2026-08-18T10:03:00.000Z'),
      history('q-1', true, '2026-08-18T10:01:00.000Z'),
      history('q-2', true, '2026-08-18T10:02:00.000Z'),
    ]);

    const body = JSON.parse((await handler(buildEvent(), CONTEXT)).body);

    expect(body.answers.map((a: { questionId: string }) => a.questionId)).toEqual([
      'q-1',
      'q-2',
      'q-3',
    ]);
  });

  it('GSI sessionId-index を Query する', async () => {
    await handler(buildEvent(), CONTEXT);

    expect(mockQuery.mock.calls[0][0]).toMatchObject({
      TableName: 'dev-OR_T_ANSWER_HISTORY',
      IndexName: 'sessionId-index',
    });
  });

  it('共通項目をレスポンスに含めない', async () => {
    mockHistories([history('q-1', true, '2026-08-18T10:01:00.000Z')]);

    const body = JSON.parse((await handler(buildEvent(), CONTEXT)).body);

    for (const key of ['createdAt', 'createdBy', 'updatedAt', 'updatedBy']) {
      expect(body).not.toHaveProperty(key);
      expect(body.answers[0]).not.toHaveProperty(key);
    }
  });

  it('回答に問題文・解説・選択肢を結合して返す（S-09 の詳細表示用）', async () => {
    mockHistories([history('q-1', true, '2026-08-18T10:01:00.000Z')]);

    const body = JSON.parse((await handler(buildEvent(), CONTEXT)).body);
    const answer = body.answers[0];

    expect(answer.questionText).toBe('問題文です');
    expect(answer.explanation).toBe('事前登録済みの解説');
    expect(answer.questionType).toBe('single');
    // 選択肢は sortOrder 昇順
    expect(answer.choices.map((c: { label: string }) => c.label)).toEqual(['A', 'B']);
    // 採点済みのため正解を開示してよい
    expect(answer.choices[0].isCorrect).toBe(true);
  });

  it('ユーザーが選んだ選択肢IDを返す（「あなたの回答」表示用）', async () => {
    mockHistories([history('q-1', true, '2026-08-18T10:01:00.000Z')]);

    const body = JSON.parse((await handler(buildEvent(), CONTEXT)).body);

    expect(body.answers[0].selectedChoiceIds).toEqual(['ch-1']);
  });

  it('問題本体を取得できない場合も結果表示を継続する（API-09 §3）', async () => {
    setItems({}, null);
    mockHistories([history('q-1', true, '2026-08-18T10:01:00.000Z')]);

    const result = await handler(buildEvent(), CONTEXT);
    const answer = JSON.parse(result.body).answers[0];

    expect(result.statusCode).toBe(200);
    expect(answer.questionText).toBe('');
    expect(answer.explanation).toBe('');
    expect(answer.isCorrect).toBe(true);
  });

  it('未回答分は answers に現れない（totalQuestions との差分が未回答数）', async () => {
    mockHistories([history('q-1', true, '2026-08-18T10:01:00.000Z')]);

    const body = JSON.parse((await handler(buildEvent(), CONTEXT)).body);

    expect(body.answers).toHaveLength(1);
    expect(body.totalQuestions).toBe(20);
  });
});
