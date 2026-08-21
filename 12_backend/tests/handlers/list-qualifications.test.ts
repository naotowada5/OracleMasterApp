import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

jest.mock('../../src/common/dynamodb');

import { scanAll } from '../../src/common/dynamodb';
import { handler } from '../../src/handlers/list-qualifications';

const mockScanAll = scanAll as jest.MockedFunction<typeof scanAll>;
const CONTEXT = {} as Context;

const EVENT = {
  httpMethod: 'GET',
  path: '/qualifications',
  headers: {},
  requestContext: { requestId: 'req-1', authorizer: { claims: { sub: 'sub-1' } } },
} as unknown as APIGatewayProxyEvent;

/** 共通項目つきの資格マスタアイテムを組み立てる */
function qualification(overrides: Record<string, unknown>) {
  return {
    name: '資格',
    level: 'bronze',
    isActive: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    createdBy: 'SYSTEM',
    updatedAt: '2026-06-01T00:00:00.000Z',
    updatedBy: 'SYSTEM',
    ...overrides,
  };
}

describe('API-01 資格一覧取得', () => {
  beforeEach(() => {
    process.env.TABLE_NAME_PREFIX = 'dev';
    process.env.LOG_LEVEL = 'ERROR';
    jest.clearAllMocks();
  });

  it('OR_M_QUALIFICATION を Scan する', async () => {
    mockScanAll.mockResolvedValue([]);

    await handler(EVENT, CONTEXT);

    expect(mockScanAll).toHaveBeenCalledWith({ TableName: 'dev-OR_M_QUALIFICATION' });
  });

  it('isActive=false の資格を除外する', async () => {
    mockScanAll.mockResolvedValue([
      qualification({ qualificationId: '1Z0-085-JPN', name: 'Bronze DBA', isActive: true }),
      qualification({ qualificationId: '1Z0-999-JPN', name: '廃止資格', isActive: false }),
    ]);

    const result = await handler(EVENT, CONTEXT);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].qualificationId).toBe('1Z0-085-JPN');
  });

  it('name の昇順で返す', async () => {
    mockScanAll.mockResolvedValue([
      qualification({ qualificationId: 'c', name: 'Silver SQL' }),
      qualification({ qualificationId: 'a', name: 'Bronze DBA' }),
      qualification({ qualificationId: 'b', name: 'Gold DBA' }),
    ]);

    const body = JSON.parse((await handler(EVENT, CONTEXT)).body);

    expect(body.items.map((item: { name: string }) => item.name)).toEqual([
      'Bronze DBA',
      'Gold DBA',
      'Silver SQL',
    ]);
  });

  it('共通項目をレスポンスに含めない（API共通設計 §8.1）', async () => {
    mockScanAll.mockResolvedValue([qualification({ qualificationId: '1Z0-085-JPN' })]);

    const body = JSON.parse((await handler(EVENT, CONTEXT)).body);

    expect(Object.keys(body.items[0]).sort()).toEqual([
      'isActive',
      'level',
      'name',
      'qualificationId',
    ]);
  });

  it('0件でも200と空配列を返す', async () => {
    mockScanAll.mockResolvedValue([]);

    const result = await handler(EVENT, CONTEXT);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ items: [] });
  });

  it('DynamoDBの障害は 500 INTERNAL_ERROR に変換する', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockScanAll.mockRejectedValue(new Error('ProvisionedThroughputExceededException'));

    const result = await handler(EVENT, CONTEXT);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error.code).toBe('INTERNAL_ERROR');
  });
});
