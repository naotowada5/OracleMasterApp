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

describe('API-09 セッション取得', () => {
  beforeEach(() => {
    process.env.TABLE_NAME_PREFIX = 'dev';
    process.env.LOG_LEVEL = 'ERROR';
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(SESSION);
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
    mockGetItem.mockResolvedValue(undefined);

    const result = await handler(buildEvent(), CONTEXT);

    expect(result.statusCode).toBe(404);
  });

  it('回答履歴を answeredAt 昇順で返す', async () => {
    mockQuery.mockResolvedValue({
      items: [
        history('q-3', false, '2026-08-18T10:03:00.000Z'),
        history('q-1', true, '2026-08-18T10:01:00.000Z'),
        history('q-2', true, '2026-08-18T10:02:00.000Z'),
      ],
      lastEvaluatedKey: undefined,
    });

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
    mockQuery.mockResolvedValue({
      items: [history('q-1', true, '2026-08-18T10:01:00.000Z')],
      lastEvaluatedKey: undefined,
    });

    const body = JSON.parse((await handler(buildEvent(), CONTEXT)).body);

    for (const key of ['createdAt', 'createdBy', 'updatedAt', 'updatedBy']) {
      expect(body).not.toHaveProperty(key);
      expect(body.answers[0]).not.toHaveProperty(key);
    }
  });

  it('未回答分は answers に現れない（totalQuestions との差分が未回答数）', async () => {
    mockQuery.mockResolvedValue({
      items: [history('q-1', true, '2026-08-18T10:01:00.000Z')],
      lastEvaluatedKey: undefined,
    });

    const body = JSON.parse((await handler(buildEvent(), CONTEXT)).body);

    expect(body.answers).toHaveLength(1);
    expect(body.totalQuestions).toBe(20);
  });
});
