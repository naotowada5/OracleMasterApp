import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

jest.mock('../../src/common/dynamodb');

import { getItem, putItem, query, updateItem } from '../../src/common/dynamodb';
import { handler } from '../../src/handlers/update-session';

const mockGetItem = getItem as jest.MockedFunction<typeof getItem>;
const mockPutItem = putItem as jest.MockedFunction<typeof putItem>;
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockUpdateItem = updateItem as jest.MockedFunction<typeof updateItem>;
const CONTEXT = {} as Context;

const AUDIT = {
  createdAt: '2026-08-18T10:00:00.000Z',
  createdBy: 'owner-sub',
  updatedAt: '2026-08-18T10:00:00.000Z',
  updatedBy: 'owner-sub',
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 's-1',
    userId: 'owner-sub',
    qualificationId: '1Z0-085-JPN',
    totalQuestions: 20,
    correctCount: 4,
    timeLimitMin: 30,
    elapsedSec: 0,
    status: 'in_progress' as const,
    startedAt: '2026-08-18T10:00:00.000Z',
    ...AUDIT,
    ...overrides,
  };
}

function choice(choiceId: string, isCorrect: boolean, sortOrder: number) {
  return {
    choiceId,
    questionId: 'q-1',
    label: String.fromCharCode(64 + sortOrder),
    choiceText: `選択肢${sortOrder}`,
    isCorrect,
    sortOrder,
    ...AUDIT,
  };
}

/** 正解は ch-1 と ch-3 の複数選択問題 */
const MULTI_CHOICES = [
  choice('ch-1', true, 1),
  choice('ch-2', false, 2),
  choice('ch-3', true, 3),
  choice('ch-4', false, 4),
];

function buildEvent(body: unknown, sub = 'owner-sub', sessionId = 's-1'): APIGatewayProxyEvent {
  return {
    httpMethod: 'PUT',
    path: `/sessions/${sessionId}`,
    headers: {},
    pathParameters: { sessionId },
    body: JSON.stringify(body),
    requestContext: { requestId: 'req-1', authorizer: { claims: { sub } } },
  } as unknown as APIGatewayProxyEvent;
}

/**
 * Query の呼ばれ方: 1回目=選択肢、2回目=回答履歴
 * @param histories 既存の回答履歴
 */
function mockQueries(choices = MULTI_CHOICES, histories: unknown[] = []) {
  mockQuery
    .mockResolvedValueOnce({ items: choices, lastEvaluatedKey: undefined })
    .mockResolvedValueOnce({ items: histories as never[], lastEvaluatedKey: undefined });
}

describe('API-08 セッション更新', () => {
  beforeEach(() => {
    process.env.TABLE_NAME_PREFIX = 'dev';
    process.env.LOG_LEVEL = 'ERROR';
    // mockResolvedValueOnce のキューを次のテストへ持ち越さないため実装ごとリセットする
    jest.resetAllMocks();
    mockGetItem.mockResolvedValue(session());
    mockUpdateItem.mockImplementation(async () => session({ correctCount: 5 }));
  });

  describe('認可・状態チェック', () => {
    it('他ユーザーのセッションは 403', async () => {
      const result = await handler(
        buildEvent(
          { action: 'answer', questionId: 'q-1', selectedChoiceIds: ['ch-1'] },
          'other-sub',
        ),
        CONTEXT,
      );

      expect(result.statusCode).toBe(403);
      expect(mockPutItem).not.toHaveBeenCalled();
    });

    it('存在しないセッションは 404', async () => {
      mockGetItem.mockResolvedValue(undefined);

      const result = await handler(
        buildEvent({ action: 'answer', questionId: 'q-1', selectedChoiceIds: ['ch-1'] }),
        CONTEXT,
      );

      expect(result.statusCode).toBe(404);
    });

    it.each(['completed', 'expired'])('終了済み（%s）セッションへの回答は 409', async (status) => {
      mockGetItem.mockResolvedValue(session({ status }));

      const result = await handler(
        buildEvent({ action: 'answer', questionId: 'q-1', selectedChoiceIds: ['ch-1'] }),
        CONTEXT,
      );

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body).error.code).toBe('CONFLICT');
      expect(mockPutItem).not.toHaveBeenCalled();
    });

    it('action が不正な値は 400', async () => {
      const result = await handler(buildEvent({ action: 'submit' }), CONTEXT);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error.details).toEqual([
        { field: 'action', reason: 'invalid' },
      ]);
    });

    it('selectedChoiceIds が空配列は 400', async () => {
      const result = await handler(
        buildEvent({ action: 'answer', questionId: 'q-1', selectedChoiceIds: [] }),
        CONTEXT,
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error.details).toEqual([
        { field: 'selectedChoiceIds', reason: 'required' },
      ]);
    });

    it('選択肢が存在しない問題IDは 404', async () => {
      mockQueries([], []);

      const result = await handler(
        buildEvent({ action: 'answer', questionId: 'q-unknown', selectedChoiceIds: ['ch-1'] }),
        CONTEXT,
      );

      expect(result.statusCode).toBe(404);
    });
  });

  describe('採点（要件定義書 F-04: 完全一致のみ正解）', () => {
    it('正解集合と完全一致すれば isCorrect=true', async () => {
      mockQueries();

      const body = JSON.parse(
        (
          await handler(
            buildEvent({
              action: 'answer',
              questionId: 'q-1',
              selectedChoiceIds: ['ch-1', 'ch-3'],
            }),
            CONTEXT,
          )
        ).body,
      );

      expect(body.isCorrect).toBe(true);
    });

    it('部分正解は isCorrect=false（正解2つのうち1つだけ選択）', async () => {
      mockQueries();

      const body = JSON.parse(
        (
          await handler(
            buildEvent({ action: 'answer', questionId: 'q-1', selectedChoiceIds: ['ch-1'] }),
            CONTEXT,
          )
        ).body,
      );

      expect(body.isCorrect).toBe(false);
    });

    it('過剰選択は isCorrect=false', async () => {
      mockQueries();

      const body = JSON.parse(
        (
          await handler(
            buildEvent({
              action: 'answer',
              questionId: 'q-1',
              selectedChoiceIds: ['ch-1', 'ch-2', 'ch-3'],
            }),
            CONTEXT,
          )
        ).body,
      );

      expect(body.isCorrect).toBe(false);
    });

    it('正解時のみ correctCount をインクリメントする', async () => {
      mockQueries();

      await handler(
        buildEvent({ action: 'answer', questionId: 'q-1', selectedChoiceIds: ['ch-1', 'ch-3'] }),
        CONTEXT,
      );

      expect(mockUpdateItem.mock.calls[0][0].ExpressionAttributeValues?.[':increment']).toBe(1);
    });

    it('不正解時のインクリメント量は 0', async () => {
      mockQueries();

      await handler(
        buildEvent({ action: 'answer', questionId: 'q-1', selectedChoiceIds: ['ch-2'] }),
        CONTEXT,
      );

      expect(mockUpdateItem.mock.calls[0][0].ExpressionAttributeValues?.[':increment']).toBe(0);
    });

    it('採点後は correctChoiceIds を返す（S-07 のハイライト表示用）', async () => {
      mockQueries();

      const body = JSON.parse(
        (
          await handler(
            buildEvent({ action: 'answer', questionId: 'q-1', selectedChoiceIds: ['ch-2'] }),
            CONTEXT,
          )
        ).body,
      );

      expect(body.correctChoiceIds.sort()).toEqual(['ch-1', 'ch-3']);
    });
  });

  describe('回答履歴の記録', () => {
    it('共通項目つきで履歴を作成する', async () => {
      mockQueries();

      await handler(
        buildEvent({ action: 'answer', questionId: 'q-1', selectedChoiceIds: ['ch-1', 'ch-3'] }),
        CONTEXT,
      );

      const [table, item] = mockPutItem.mock.calls[0];
      expect(table).toBe('dev-OR_T_ANSWER_HISTORY');
      expect(item).toMatchObject({
        sessionId: 's-1',
        questionId: 'q-1',
        selectedChoiceIds: ['ch-1', 'ch-3'],
        isCorrect: true,
        createdBy: 'owner-sub',
        updatedBy: 'owner-sub',
      });
    });

    it('セッション更新では createdAt / createdBy を上書きしない', async () => {
      mockQueries();

      await handler(
        buildEvent({ action: 'answer', questionId: 'q-1', selectedChoiceIds: ['ch-1'] }),
        CONTEXT,
      );

      const expression = mockUpdateItem.mock.calls[0][0].UpdateExpression ?? '';
      expect(expression).toContain('updatedAt');
      expect(expression).toContain('updatedBy');
      expect(expression).not.toContain('createdAt');
      expect(expression).not.toContain('createdBy');
    });
  });

  describe('多重送信への冪等性', () => {
    it('同一問題への再送信では履歴を作成せず既存結果を返す', async () => {
      const existing = {
        historyId: 'h-existing',
        sessionId: 's-1',
        questionId: 'q-1',
        selectedChoiceIds: ['ch-1', 'ch-3'],
        isCorrect: true,
        answeredAt: '2026-08-18T10:01:00.000Z',
        ...AUDIT,
      };
      mockQueries(MULTI_CHOICES, [existing]);

      const body = JSON.parse(
        (
          await handler(
            buildEvent({ action: 'answer', questionId: 'q-1', selectedChoiceIds: ['ch-2'] }),
            CONTEXT,
          )
        ).body,
      );

      expect(body.historyId).toBe('h-existing');
      expect(body.isCorrect).toBe(true);
      expect(mockPutItem).not.toHaveBeenCalled();
      expect(mockUpdateItem).not.toHaveBeenCalled();
    });
  });

  describe('isLastQuestion', () => {
    it('出題数に達していなければ false', async () => {
      mockQueries(MULTI_CHOICES, []);

      const body = JSON.parse(
        (
          await handler(
            buildEvent({ action: 'answer', questionId: 'q-1', selectedChoiceIds: ['ch-1'] }),
            CONTEXT,
          )
        ).body,
      );

      expect(body.isLastQuestion).toBe(false);
    });

    it('出題数に達したら true', async () => {
      mockGetItem.mockResolvedValue(session({ totalQuestions: 3 }));
      const answered = [
        {
          historyId: 'h-1',
          sessionId: 's-1',
          questionId: 'q-a',
          selectedChoiceIds: [],
          isCorrect: true,
          answeredAt: '2026-08-18T10:01:00.000Z',
          ...AUDIT,
        },
        {
          historyId: 'h-2',
          sessionId: 's-1',
          questionId: 'q-b',
          selectedChoiceIds: [],
          isCorrect: true,
          answeredAt: '2026-08-18T10:02:00.000Z',
          ...AUDIT,
        },
      ];
      mockQueries(MULTI_CHOICES, answered);

      const body = JSON.parse(
        (
          await handler(
            buildEvent({ action: 'answer', questionId: 'q-1', selectedChoiceIds: ['ch-1'] }),
            CONTEXT,
          )
        ).body,
      );

      expect(body.isLastQuestion).toBe(true);
    });
  });

  describe('制限時間超過', () => {
    it('超過時は回答を記録した上で expired にする', async () => {
      mockQueries();
      mockUpdateItem.mockResolvedValue(session({ status: 'expired', correctCount: 5 }));

      const body = JSON.parse(
        (
          await handler(
            buildEvent({
              action: 'answer',
              questionId: 'q-1',
              selectedChoiceIds: ['ch-1', 'ch-3'],
              // 制限時間30分=1800秒を超過
              elapsedSec: 1900,
            }),
            CONTEXT,
          )
        ).body,
      );

      expect(mockPutItem).toHaveBeenCalledTimes(1);
      const values = mockUpdateItem.mock.calls[0][0].ExpressionAttributeValues ?? {};
      expect(values[':status']).toBe('expired');
      expect(values[':finishedAt']).toBeDefined();
      expect(body.sessionStatus).toBe('expired');
    });

    it('timeLimitMin=0（無制限）では超過扱いにしない', async () => {
      mockGetItem.mockResolvedValue(session({ timeLimitMin: 0 }));
      mockQueries();

      await handler(
        buildEvent({
          action: 'answer',
          questionId: 'q-1',
          selectedChoiceIds: ['ch-1'],
          elapsedSec: 99999,
        }),
        CONTEXT,
      );

      expect(
        mockUpdateItem.mock.calls[0][0].ExpressionAttributeValues?.[':status'],
      ).toBeUndefined();
    });
  });

  describe('action=finish', () => {
    it('completed に更新して finishedAt を設定する', async () => {
      mockUpdateItem.mockResolvedValue(
        session({ status: 'completed', finishedAt: '2026-08-18T10:31:00.000Z' }),
      );

      const body = JSON.parse((await handler(buildEvent({ action: 'finish' }), CONTEXT)).body);

      expect(body.sessionStatus).toBe('completed');
      expect(body.finishedAt).toBe('2026-08-18T10:31:00.000Z');
    });

    it('制限時間を超過していれば expired にする', async () => {
      mockGetItem.mockResolvedValue(session({ elapsedSec: 1900 }));
      mockUpdateItem.mockResolvedValue(session({ status: 'expired' }));

      await handler(buildEvent({ action: 'finish' }), CONTEXT);

      expect(mockUpdateItem.mock.calls[0][0].ExpressionAttributeValues?.[':status']).toBe(
        'expired',
      );
    });

    it('既に終了済みなら冪等に現状を返しエラーにしない', async () => {
      mockGetItem.mockResolvedValue(
        session({ status: 'completed', finishedAt: '2026-08-18T10:31:00.000Z' }),
      );

      const result = await handler(buildEvent({ action: 'finish' }), CONTEXT);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.sessionStatus).toBe('completed');
      expect(mockUpdateItem).not.toHaveBeenCalled();
    });

    it('他ユーザーのセッションは 403', async () => {
      const result = await handler(buildEvent({ action: 'finish' }, 'other-sub'), CONTEXT);

      expect(result.statusCode).toBe(403);
      expect(mockUpdateItem).not.toHaveBeenCalled();
    });
  });
});
