import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { ConflictError, ForbiddenError, ValidationError } from '../../src/common/errors';
import { withErrorHandling } from '../../src/common/handler';
import { ok } from '../../src/common/response';

const CONTEXT = {} as Context;

function buildEvent(origin?: string): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/qualifications',
    headers: origin ? { Origin: origin } : {},
    requestContext: { requestId: 'req-1', authorizer: { claims: { sub: 'sub-1' } } },
  } as unknown as APIGatewayProxyEvent;
}

describe('withErrorHandling', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, LOG_LEVEL: 'ERROR', ALLOWED_ORIGINS: 'http://localhost:5173' };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('正常時はハンドラの結果をそのまま返す', async () => {
    const handler = withErrorHandling('API-01', async () => ok({ items: [] }));
    const result = await handler(buildEvent(), CONTEXT);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ items: [] });
  });

  it.each([
    [new ValidationError('入力が不正です'), 400, 'VALIDATION_ERROR'],
    [new ForbiddenError(), 403, 'FORBIDDEN'],
    [new ConflictError('このセッションは終了しています'), 409, 'CONFLICT'],
  ])('想定内エラーは対応するステータスに変換する', async (error, statusCode, code) => {
    const handler = withErrorHandling('API-08', async () => {
      throw error;
    });
    const result = await handler(buildEvent(), CONTEXT);

    expect(result.statusCode).toBe(statusCode);
    expect(JSON.parse(result.body).error.code).toBe(code);
  });

  it('バリデーション詳細をレスポンスに含める', async () => {
    const handler = withErrorHandling('API-04', async () => {
      throw new ValidationError('出題数は1〜100の範囲で入力してください', [
        { field: 'questionCount', reason: 'out_of_range' },
      ]);
    });
    const result = await handler(buildEvent(), CONTEXT);

    expect(JSON.parse(result.body).error.details).toEqual([
      { field: 'questionCount', reason: 'out_of_range' },
    ]);
  });

  it('想定外の例外は 500 とし、内部情報をレスポンスに含めない', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = withErrorHandling('API-03', async () => {
      throw new Error('DynamoDB接続に失敗: arn:aws:dynamodb:...');
    });
    const result = await handler(buildEvent(), CONTEXT);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error.code).toBe('INTERNAL_ERROR');
    expect(result.body).not.toContain('arn:aws:dynamodb');
    expect(result.body).not.toContain('DynamoDB接続に失敗');
  });

  it('許可オリジンからのリクエストにはCORSヘッダを付与する', async () => {
    const handler = withErrorHandling('API-01', async () =>
      ok({ items: [] }, 'http://localhost:5173'),
    );
    const result = await handler(buildEvent('http://localhost:5173'), CONTEXT);

    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
  });

  it('許可外オリジンにはCORSヘッダを付与しない', async () => {
    const handler = withErrorHandling('API-01', async () => {
      throw new ForbiddenError();
    });
    const result = await handler(buildEvent('https://evil.example.com'), CONTEXT);

    expect(result.headers?.['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
