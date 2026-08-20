import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

jest.mock('../../src/common/dynamodb');

import { query } from '../../src/common/dynamodb';
import { handler } from '../../src/handlers/list-questions';

const mockQuery = query as jest.MockedFunction<typeof query>;
const CONTEXT = {} as Context;

const AUDIT = {
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBy: 'SYSTEM',
  updatedAt: '2026-06-01T00:00:00.000Z',
  updatedBy: 'SYSTEM',
};

function buildEvent(params: Record<string, string> | null = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/questions',
    headers: {},
    queryStringParameters: params,
    requestContext: { requestId: 'req-1', authorizer: { claims: { sub: 'sub-1' } } },
  } as unknown as APIGatewayProxyEvent;
}

const QUESTION = {
  questionId: 'q-1',
  qualificationId: '1Z0-071-JPN',
  categoryId: 'c-1',
  questionText: '次のSQL文で正しいものはどれか。',
  questionType: 'single' as const,
  correctCount: 1,
  explanation: 'SELECT文の基本構文は...',
  difficulty: 'medium',
  isActive: true,
  ...AUDIT,
};

const CHOICES = [
  {
    choiceId: 'ch-2',
    questionId: 'q-1',
    label: 'B',
    choiceText: 'INSERT ...',
    isCorrect: false,
    sortOrder: 2,
    ...AUDIT,
  },
  {
    choiceId: 'ch-1',
    questionId: 'q-1',
    label: 'A',
    choiceText: 'SELECT ...',
    isCorrect: true,
    sortOrder: 1,
    ...AUDIT,
  },
];

/** 1回目=問題のQuery、2回目以降=選択肢のQuery */
function mockQuestionAndChoices(lastEvaluatedKey?: Record<string, unknown>) {
  mockQuery
    .mockResolvedValueOnce({ items: [QUESTION], lastEvaluatedKey })
    .mockResolvedValue({ items: CHOICES, lastEvaluatedKey: undefined });
}

describe('API-03 問題一覧取得', () => {
  beforeEach(() => {
    process.env.TABLE_NAME_PREFIX = 'dev';
    process.env.LOG_LEVEL = 'ERROR';
    jest.clearAllMocks();
  });

  it('qualificationId 未指定は 400', async () => {
    const result = await handler(buildEvent(null), CONTEXT);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.details).toEqual([
      { field: 'qualificationId', reason: 'required' },
    ]);
  });

  it('categoryId 未指定時は qualificationId-index を使う', async () => {
    mockQuestionAndChoices();

    await handler(buildEvent({ qualificationId: '1Z0-071-JPN' }), CONTEXT);

    const input = mockQuery.mock.calls[0][0];
    expect(input.IndexName).toBe('qualificationId-index');
    expect(input.KeyConditionExpression).toBe('qualificationId = :qid');
  });

  it('categoryId 指定時は categoryId-index を使う', async () => {
    mockQuestionAndChoices();

    await handler(buildEvent({ qualificationId: '1Z0-071-JPN', categoryId: 'c-1' }), CONTEXT);

    const input = mockQuery.mock.calls[0][0];
    expect(input.IndexName).toBe('categoryId-index');
    expect(input.KeyConditionExpression).toBe('categoryId = :categoryId');
  });

  it('isActive=true でフィルタする', async () => {
    mockQuestionAndChoices();

    await handler(buildEvent({ qualificationId: '1Z0-071-JPN' }), CONTEXT);

    const input = mockQuery.mock.calls[0][0];
    expect(input.FilterExpression).toBe('isActive = :isActive');
    expect(input.ExpressionAttributeValues?.[':isActive']).toBe(true);
  });

  it('選択肢を sortOrder 昇順で結合し、正解フラグを含めて返す', async () => {
    mockQuestionAndChoices();

    const body = JSON.parse(
      (await handler(buildEvent({ qualificationId: '1Z0-071-JPN' }), CONTEXT)).body,
    );

    expect(body.items[0].choices.map((c: { label: string }) => c.label)).toEqual(['A', 'B']);
    expect(body.items[0].choices[0].isCorrect).toBe(true);
    expect(body.items[0].explanation).toBe('SELECT文の基本構文は...');
  });

  it('共通項目をレスポンスに含めない', async () => {
    mockQuestionAndChoices();

    const body = JSON.parse(
      (await handler(buildEvent({ qualificationId: '1Z0-071-JPN' }), CONTEXT)).body,
    );

    for (const key of ['createdAt', 'createdBy', 'updatedAt', 'updatedBy']) {
      expect(body.items[0]).not.toHaveProperty(key);
      expect(body.items[0].choices[0]).not.toHaveProperty(key);
    }
  });

  describe('ページング', () => {
    it('limit 未指定時は既定値20を使う', async () => {
      mockQuestionAndChoices();

      await handler(buildEvent({ qualificationId: '1Z0-071-JPN' }), CONTEXT);

      expect(mockQuery.mock.calls[0][0].Limit).toBe(20);
    });

    it('limit 範囲外は 400', async () => {
      const result = await handler(
        buildEvent({ qualificationId: '1Z0-071-JPN', limit: '101' }),
        CONTEXT,
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error.details).toEqual([
        { field: 'limit', reason: 'out_of_range' },
      ]);
    });

    it('続きがある場合は nextToken を返し、次回リクエストで復元できる', async () => {
      mockQuestionAndChoices({ questionId: 'q-1' });

      const body = JSON.parse(
        (await handler(buildEvent({ qualificationId: '1Z0-071-JPN' }), CONTEXT)).body,
      );
      expect(body.nextToken).not.toBeNull();

      jest.clearAllMocks();
      mockQuestionAndChoices();
      await handler(
        buildEvent({ qualificationId: '1Z0-071-JPN', nextToken: body.nextToken }),
        CONTEXT,
      );

      expect(mockQuery.mock.calls[0][0].ExclusiveStartKey).toEqual({ questionId: 'q-1' });
    });

    it('最終ページでは nextToken が null', async () => {
      mockQuestionAndChoices();

      const body = JSON.parse(
        (await handler(buildEvent({ qualificationId: '1Z0-071-JPN' }), CONTEXT)).body,
      );

      expect(body.nextToken).toBeNull();
    });

    it('不正な nextToken は 400', async () => {
      const result = await handler(
        buildEvent({ qualificationId: '1Z0-071-JPN', nextToken: '!!!broken!!!' }),
        CONTEXT,
      );

      expect(result.statusCode).toBe(400);
    });
  });
});
