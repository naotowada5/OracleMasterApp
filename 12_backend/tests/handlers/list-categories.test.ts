import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

jest.mock('../../src/common/dynamodb');

import { getItem, query } from '../../src/common/dynamodb';
import { handler } from '../../src/handlers/list-categories';

const mockGetItem = getItem as jest.MockedFunction<typeof getItem>;
const mockQuery = query as jest.MockedFunction<typeof query>;
const CONTEXT = {} as Context;

function buildEvent(qualificationId?: string): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/categories',
    headers: {},
    queryStringParameters: qualificationId ? { qualificationId } : null,
    requestContext: { requestId: 'req-1', authorizer: { claims: { sub: 'sub-1' } } },
  } as unknown as APIGatewayProxyEvent;
}

const AUDIT = {
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBy: 'SYSTEM',
  updatedAt: '2026-06-01T00:00:00.000Z',
  updatedBy: 'SYSTEM',
};

function category(categoryId: string, categoryName: string, sortOrder: number) {
  return { categoryId, qualificationId: '1Z0-071-JPN', categoryName, sortOrder, ...AUDIT };
}

describe('API-02 カテゴリ一覧取得', () => {
  beforeEach(() => {
    process.env.TABLE_NAME_PREFIX = 'dev';
    process.env.LOG_LEVEL = 'ERROR';
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue({ qualificationId: '1Z0-071-JPN', ...AUDIT });
  });

  it('qualificationId 未指定は 400 VALIDATION_ERROR', async () => {
    const result = await handler(buildEvent(), CONTEXT);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual([{ field: 'qualificationId', reason: 'required' }]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('存在しない資格は 404 NOT_FOUND', async () => {
    mockGetItem.mockResolvedValue(undefined);

    const result = await handler(buildEvent('1Z0-000-JPN'), CONTEXT);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error.code).toBe('NOT_FOUND');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('GSI qualificationId-index を Query する', async () => {
    mockQuery.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });

    await handler(buildEvent('1Z0-071-JPN'), CONTEXT);

    expect(mockQuery).toHaveBeenCalledWith({
      TableName: 'dev-OR_M_CATEGORY',
      IndexName: 'qualificationId-index',
      KeyConditionExpression: 'qualificationId = :qualificationId',
      ExpressionAttributeValues: { ':qualificationId': '1Z0-071-JPN' },
    });
  });

  it('sortOrder 昇順で返す', async () => {
    mockQuery.mockResolvedValue({
      items: [
        category('c-3', 'トランザクション制御', 3),
        category('c-1', 'SELECT文の基礎', 1),
        category('c-2', '結合', 2),
      ],
      lastEvaluatedKey: undefined,
    });

    const body = JSON.parse((await handler(buildEvent('1Z0-071-JPN'), CONTEXT)).body);

    expect(body.items.map((item: { sortOrder: number }) => item.sortOrder)).toEqual([1, 2, 3]);
  });

  it('カテゴリ0件は404ではなく空配列を返す', async () => {
    mockQuery.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });

    const result = await handler(buildEvent('1Z0-071-JPN'), CONTEXT);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ items: [] });
  });

  it('共通項目をレスポンスに含めない', async () => {
    mockQuery.mockResolvedValue({
      items: [category('c-1', 'SELECT文の基礎', 1)],
      lastEvaluatedKey: undefined,
    });

    const body = JSON.parse((await handler(buildEvent('1Z0-071-JPN'), CONTEXT)).body);

    expect(Object.keys(body.items[0]).sort()).toEqual([
      'categoryId',
      'categoryName',
      'qualificationId',
      'sortOrder',
    ]);
  });
});
