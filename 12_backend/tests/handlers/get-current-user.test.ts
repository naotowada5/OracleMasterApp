import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

jest.mock('../../src/common/dynamodb');

import { getItem, putItem, updateItem } from '../../src/common/dynamodb';
import { handler } from '../../src/handlers/get-current-user';

const mockGetItem = getItem as jest.MockedFunction<typeof getItem>;
const mockPutItem = putItem as jest.MockedFunction<typeof putItem>;
const mockUpdateItem = updateItem as jest.MockedFunction<typeof updateItem>;
const CONTEXT = {} as Context;

function buildEvent(claims: Record<string, string> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/users/me',
    headers: {},
    requestContext: {
      requestId: 'req-1',
      authorizer: {
        claims: { sub: 'cognito-sub-1', email: 'user@example.com', name: '和田', ...claims },
      },
    },
  } as unknown as APIGatewayProxyEvent;
}

const EXISTING_USER = {
  userId: 'cognito-sub-1',
  email: 'user@example.com',
  displayName: '和田',
  lastLoginAt: '2026-08-01T00:00:00.000Z',
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBy: 'cognito-sub-1',
  updatedAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'cognito-sub-1',
};

describe('API-10 ユーザー情報取得', () => {
  beforeEach(() => {
    process.env.TABLE_NAME_PREFIX = 'dev';
    process.env.LOG_LEVEL = 'ERROR';
    jest.clearAllMocks();
  });

  describe('既存ユーザー', () => {
    beforeEach(() => {
      mockGetItem.mockResolvedValue(EXISTING_USER);
      mockUpdateItem.mockResolvedValue({
        ...EXISTING_USER,
        lastLoginAt: '2026-08-20T12:00:00.000Z',
      });
    });

    it('レコードを作成せず lastLoginAt を更新する', async () => {
      const result = await handler(buildEvent(), CONTEXT);

      expect(mockPutItem).not.toHaveBeenCalled();
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).lastLoginAt).toBe('2026-08-20T12:00:00.000Z');
    });

    it('updatedAt / updatedBy も同時に更新し、createdAt は触らない', async () => {
      await handler(buildEvent(), CONTEXT);

      const input = mockUpdateItem.mock.calls[0][0];
      expect(input.UpdateExpression).toBe(
        'SET lastLoginAt = :lastLoginAt, updatedAt = :updatedAt, updatedBy = :updatedBy',
      );
      expect(input.ExpressionAttributeValues?.[':updatedBy']).toBe('cognito-sub-1');
      expect(input.UpdateExpression).not.toContain('createdAt');
      expect(input.UpdateExpression).not.toContain('createdBy');
    });

    it('createdAt のみ共通項目から返却する（API共通設計 §8.1 の例外）', async () => {
      const body = JSON.parse((await handler(buildEvent(), CONTEXT)).body);

      expect(Object.keys(body).sort()).toEqual([
        'createdAt',
        'displayName',
        'email',
        'lastLoginAt',
        'userId',
      ]);
    });
  });

  describe('初回アクセス（レコード未作成）', () => {
    beforeEach(() => {
      mockGetItem.mockResolvedValue(undefined);
    });

    it('クレームからレコードを自動作成する', async () => {
      const result = await handler(buildEvent(), CONTEXT);

      expect(mockPutItem).toHaveBeenCalledTimes(1);
      const [table, item, condition] = mockPutItem.mock.calls[0];
      expect(table).toBe('dev-OR_M_USER');
      expect(condition).toBe('attribute_not_exists(userId)');
      expect(item).toMatchObject({
        userId: 'cognito-sub-1',
        email: 'user@example.com',
        displayName: '和田',
        createdBy: 'cognito-sub-1',
        updatedBy: 'cognito-sub-1',
      });
      expect(result.statusCode).toBe(200);
    });

    it('作成時は createdAt と updatedAt が同値になる', async () => {
      await handler(buildEvent(), CONTEXT);

      const item = mockPutItem.mock.calls[0][1] as { createdAt: string; updatedAt: string };
      expect(item.createdAt).toBe(item.updatedAt);
    });

    it('name クレームが無い場合はメールのローカル部を表示名にする', async () => {
      await handler(
        {
          ...buildEvent(),
          requestContext: {
            requestId: 'req-1',
            authorizer: { claims: { sub: 'cognito-sub-1', email: 'taro@example.com' } },
          },
        } as unknown as APIGatewayProxyEvent,
        CONTEXT,
      );

      const item = mockPutItem.mock.calls[0][1] as { displayName: string };
      expect(item.displayName).toBe('taro');
    });

    it('同時リクエストで作成が競合した場合は更新経路に合流する', async () => {
      const conflict = new Error('The conditional request failed');
      conflict.name = 'ConditionalCheckFailedException';
      mockPutItem.mockRejectedValueOnce(conflict);
      mockUpdateItem.mockResolvedValue(EXISTING_USER);

      const result = await handler(buildEvent(), CONTEXT);

      expect(result.statusCode).toBe(200);
      expect(mockUpdateItem).toHaveBeenCalledTimes(1);
    });
  });

  it('クレームが無い場合は 401 UNAUTHORIZED', async () => {
    const result = await handler(
      {
        httpMethod: 'GET',
        path: '/users/me',
        headers: {},
        requestContext: {},
      } as unknown as APIGatewayProxyEvent,
      CONTEXT,
    );

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).error.code).toBe('UNAUTHORIZED');
  });
});
