import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth/cognito', () => ({
  currentIdToken: vi.fn(),
  signOut: vi.fn(),
}));

import { currentIdToken, signOut } from '../auth/cognito';
import { ApiError, apiRequest, toDisplayMessage } from './client';

const mockToken = vi.mocked(currentIdToken);
const mockSignOut = vi.mocked(signOut);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('apiRequest', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/dev');
    mockToken.mockResolvedValue('dummy-id-token');
  });

  it('IDトークンを Authorization ヘッダに付与する', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    await apiRequest('/qualifications');

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer dummy-id-token');
  });

  it('クエリパラメータを組み立てる（undefined は除外）', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchSpy);

    await apiRequest('/questions', {
      query: { qualificationId: '1Z0-085-JPN', categoryId: undefined, limit: 20 },
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('qualificationId=1Z0-085-JPN');
    expect(url).toContain('limit=20');
    expect(url).not.toContain('categoryId');
  });

  it('エラーレスポンスを ApiError に変換する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: '出題数は1〜100の範囲で入力してください',
            details: [{ field: 'questionCount', reason: 'out_of_range' }],
          },
        }),
      ),
    );

    await expect(
      apiRequest('/questions/random', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: [{ field: 'questionCount', reason: 'out_of_range' }],
    });
  });

  it('401 のときはトークンを破棄する（エラーハンドリング方針 §2.3）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, {})));

    await expect(apiRequest('/users/me')).rejects.toBeInstanceOf(ApiError);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('トークン取得に失敗した場合もサインアウトして UNAUTHORIZED にする', async () => {
    mockToken.mockRejectedValue(new Error('session expired'));

    await expect(apiRequest('/users/me')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('通信断は NETWORK_ERROR にする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(apiRequest('/qualifications')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

describe('toDisplayMessage', () => {
  it('バリデーションエラーはサーバーの文言を優先する', () => {
    const error = new ApiError('VALIDATION_ERROR', 400, '出題数は1〜100の範囲で入力してください');
    expect(toDisplayMessage(error)).toBe('出題数は1〜100の範囲で入力してください');
  });

  it.each([
    ['FORBIDDEN', 'この操作を行う権限がありません'],
    ['NOT_FOUND', '指定されたデータが見つかりません'],
    ['NETWORK_ERROR', '通信エラーが発生しました。時間をおいて再度お試しください'],
  ] as const)('%s は既定メッセージを返す', (code, expected) => {
    expect(toDisplayMessage(new ApiError(code, 500, 'raw'))).toBe(expected);
  });

  it('ApiError 以外は内部エラー扱いにする（詳細を画面に出さない）', () => {
    expect(toDisplayMessage(new Error('DynamoDB接続に失敗: arn:aws:...'))).toBe(
      'エラーが発生しました。時間をおいて再度お試しください',
    );
  });
});
