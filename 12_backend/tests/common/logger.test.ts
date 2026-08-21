import { maskSensitive } from '../../src/common/logger';

describe('maskSensitive', () => {
  it('メールアドレスをマスクする（ログ・監視設計 §1.2）', () => {
    expect(maskSensitive({ userId: 'sub-1', email: 'user@example.com' })).toEqual({
      userId: 'sub-1',
      email: '***',
    });
  });

  it('表示名・パスワード・Authorizationヘッダもマスクする', () => {
    expect(
      maskSensitive({
        displayName: 'テストユーザー',
        password: 'secret',
        Authorization: 'Bearer eyJ...',
      }),
    ).toEqual({ displayName: '***', password: '***', Authorization: '***' });
  });

  it('ネストした構造・配列も再帰的にマスクする', () => {
    expect(maskSensitive({ users: [{ sub: 'a', email: 'a@example.com' }] })).toEqual({
      users: [{ sub: 'a', email: '***' }],
    });
  });

  it('マスク対象外の値はそのまま残す', () => {
    expect(maskSensitive({ questionId: 'q-1', correctCount: 2, isCorrect: true })).toEqual({
      questionId: 'q-1',
      correctCount: 2,
      isCorrect: true,
    });
  });
});
