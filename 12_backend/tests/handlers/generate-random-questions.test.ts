import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

jest.mock('../../src/common/dynamodb');

import { query } from '../../src/common/dynamodb';
import { handler, pickRandom } from '../../src/handlers/generate-random-questions';

const mockQuery = query as jest.MockedFunction<typeof query>;
const CONTEXT = {} as Context;

const AUDIT = {
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBy: 'SYSTEM',
  updatedAt: '2026-06-01T00:00:00.000Z',
  updatedBy: 'SYSTEM',
};

function buildEvent(body: unknown): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/questions/random',
    headers: {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
    requestContext: { requestId: 'req-1', authorizer: { claims: { sub: 'sub-1' } } },
  } as unknown as APIGatewayProxyEvent;
}

function question(id: string) {
  return {
    questionId: id,
    qualificationId: '1Z0-085-JPN',
    categoryId: 'c-1',
    questionText: `問題${id}`,
    questionType: 'multiple' as const,
    correctCount: 2,
    explanation: '解説テキスト（クライアントには渡さない）',
    isActive: true,
    ...AUDIT,
  };
}

const CHOICES = [
  {
    choiceId: 'ch-1',
    questionId: 'q-1',
    label: 'A',
    choiceText: 'A案',
    isCorrect: true,
    sortOrder: 1,
    ...AUDIT,
  },
  {
    choiceId: 'ch-2',
    questionId: 'q-1',
    label: 'B',
    choiceText: 'B案',
    isCorrect: false,
    sortOrder: 2,
    ...AUDIT,
  },
];

function mockQuestions(items: ReturnType<typeof question>[]) {
  mockQuery
    .mockResolvedValueOnce({ items, lastEvaluatedKey: undefined })
    .mockResolvedValue({ items: CHOICES, lastEvaluatedKey: undefined });
}

describe('pickRandom', () => {
  it('指定件数を返し、元配列を変更しない', () => {
    const source = [1, 2, 3, 4, 5];
    const picked = pickRandom(source, 3);

    expect(picked).toHaveLength(3);
    expect(source).toEqual([1, 2, 3, 4, 5]);
  });

  it('全要素が元の集合に含まれ、重複しない', () => {
    const picked = pickRandom([1, 2, 3, 4, 5], 5);

    expect([...picked].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('API-04 ランダム出題リスト生成', () => {
  beforeEach(() => {
    process.env.TABLE_NAME_PREFIX = 'dev';
    process.env.LOG_LEVEL = 'ERROR';
    // mockResolvedValueOnce のキューを次のテストへ持ち越さないため実装ごとリセットする
    jest.resetAllMocks();
  });

  it('qualificationId 未指定は 400', async () => {
    const result = await handler(buildEvent({ questionCount: 10 }), CONTEXT);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.details).toEqual([
      { field: 'qualificationId', reason: 'required' },
    ]);
  });

  it.each([0, 101, 10.5])('questionCount が範囲外（%s）は 400', async (count) => {
    const result = await handler(
      buildEvent({ qualificationId: '1Z0-085-JPN', questionCount: count }),
      CONTEXT,
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.details).toEqual([
      { field: 'questionCount', reason: 'out_of_range' },
    ]);
  });

  it('ボディが不正なJSONは 400', async () => {
    const result = await handler(buildEvent('{壊れたJSON'), CONTEXT);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('出題可能な問題が0件なら 404', async () => {
    mockQuery.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });

    const result = await handler(buildEvent({ qualificationId: '1Z0-085-JPN' }), CONTEXT);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error.code).toBe('NOT_FOUND');
  });

  it('**正解フラグと解説を一切含めない**', async () => {
    mockQuestions([question('q-1')]);

    const result = await handler(buildEvent({ qualificationId: '1Z0-085-JPN' }), CONTEXT);

    expect(result.body).not.toContain('isCorrect');
    expect(result.body).not.toContain('explanation');
    expect(result.body).not.toContain('解説テキスト');

    const body = JSON.parse(result.body);
    expect(Object.keys(body.questions[0].choices[0]).sort()).toEqual([
      'choiceId',
      'choiceText',
      'label',
    ]);
  });

  it('correctCount は返す（UIの「◯つ選んでください」表示用）', async () => {
    mockQuestions([question('q-1')]);

    const body = JSON.parse(
      (await handler(buildEvent({ qualificationId: '1Z0-085-JPN' }), CONTEXT)).body,
    );

    expect(body.questions[0].correctCount).toBe(2);
  });

  it('questionCount 未指定時は全問題を返す', async () => {
    mockQuestions([question('q-1'), question('q-2'), question('q-3')]);

    const body = JSON.parse(
      (await handler(buildEvent({ qualificationId: '1Z0-085-JPN' }), CONTEXT)).body,
    );

    expect(body.questions).toHaveLength(3);
    expect(body.actualCount).toBe(3);
  });

  it('指定件数だけ抽選する', async () => {
    mockQuestions([question('q-1'), question('q-2'), question('q-3'), question('q-4')]);

    const body = JSON.parse(
      (await handler(buildEvent({ qualificationId: '1Z0-085-JPN', questionCount: 2 }), CONTEXT))
        .body,
    );

    expect(body.questions).toHaveLength(2);
    expect(body.actualCount).toBe(2);
  });

  it('対象問題が指定件数に満たない場合は取得できた全件を返し actualCount に反映する', async () => {
    mockQuestions([question('q-1'), question('q-2')]);

    const body = JSON.parse(
      (await handler(buildEvent({ qualificationId: '1Z0-085-JPN', questionCount: 20 }), CONTEXT))
        .body,
    );

    expect(body.questions).toHaveLength(2);
    expect(body.actualCount).toBe(2);
  });

  it('isActive=true でフィルタする', async () => {
    mockQuestions([question('q-1')]);

    await handler(buildEvent({ qualificationId: '1Z0-085-JPN' }), CONTEXT);

    expect(mockQuery.mock.calls[0][0].FilterExpression).toBe('isActive = :isActive');
  });
});
