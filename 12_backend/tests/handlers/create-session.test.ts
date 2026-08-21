import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

jest.mock('../../src/common/dynamodb');

import { putItem } from '../../src/common/dynamodb';
import { handler } from '../../src/handlers/create-session';

const mockPutItem = putItem as jest.MockedFunction<typeof putItem>;
const CONTEXT = {} as Context;

function buildEvent(body: unknown, sub = 'cognito-sub-1'): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/sessions',
    headers: {},
    body: JSON.stringify(body),
    requestContext: { requestId: 'req-1', authorizer: { claims: { sub } } },
  } as unknown as APIGatewayProxyEvent;
}

describe('API-07 試験セッション開始', () => {
  beforeEach(() => {
    process.env.TABLE_NAME_PREFIX = 'dev';
    process.env.LOG_LEVEL = 'ERROR';
    jest.clearAllMocks();
  });

  it('201 を返し、作成直後は in_progress', async () => {
    const result = await handler(
      buildEvent({ qualificationId: '1Z0-085-JPN', totalQuestions: 20, timeLimitMin: 30 }),
      CONTEXT,
    );
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(201);
    expect(body.status).toBe('in_progress');
    expect(body.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('userId はトークンの sub を使い、クライアント指定値を無視する', async () => {
    const body = JSON.parse(
      (
        await handler(
          buildEvent({
            qualificationId: '1Z0-085-JPN',
            totalQuestions: 20,
            userId: 'なりすまし用のuserId',
          }),
          CONTEXT,
        )
      ).body,
    );

    expect(body.userId).toBe('cognito-sub-1');
    expect(mockPutItem.mock.calls[0][1]).toMatchObject({ userId: 'cognito-sub-1' });
  });

  it('correctCount と elapsedSec は 0 で初期化される', async () => {
    await handler(buildEvent({ qualificationId: '1Z0-085-JPN', totalQuestions: 20 }), CONTEXT);

    expect(mockPutItem.mock.calls[0][1]).toMatchObject({ correctCount: 0, elapsedSec: 0 });
  });

  it('timeLimitMin 未指定時は 0（無制限）として保存する', async () => {
    const body = JSON.parse(
      (await handler(buildEvent({ qualificationId: '1Z0-085-JPN', totalQuestions: 20 }), CONTEXT))
        .body,
    );

    expect(body.timeLimitMin).toBe(0);
  });

  it('共通項目を設定し、作成時は createdAt と updatedAt が同値', async () => {
    await handler(buildEvent({ qualificationId: '1Z0-085-JPN', totalQuestions: 20 }), CONTEXT);

    const item = mockPutItem.mock.calls[0][1] as Record<string, string>;
    expect(item.createdBy).toBe('cognito-sub-1');
    expect(item.updatedBy).toBe('cognito-sub-1');
    expect(item.createdAt).toBe(item.updatedAt);
  });

  it('共通項目をレスポンスに含めない', async () => {
    const body = JSON.parse(
      (await handler(buildEvent({ qualificationId: '1Z0-085-JPN', totalQuestions: 20 }), CONTEXT))
        .body,
    );

    for (const key of ['createdAt', 'createdBy', 'updatedAt', 'updatedBy']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('qualificationId 未指定は 400', async () => {
    const result = await handler(buildEvent({ totalQuestions: 20 }), CONTEXT);

    expect(result.statusCode).toBe(400);
  });

  it('totalQuestions 未指定は 400', async () => {
    const result = await handler(buildEvent({ qualificationId: '1Z0-085-JPN' }), CONTEXT);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.details).toEqual([
      { field: 'totalQuestions', reason: 'required' },
    ]);
  });

  it('totalQuestions が範囲外は 400', async () => {
    const result = await handler(
      buildEvent({ qualificationId: '1Z0-085-JPN', totalQuestions: 101 }),
      CONTEXT,
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.details).toEqual([
      { field: 'totalQuestions', reason: 'out_of_range' },
    ]);
  });
});
