import type { APIGatewayProxyEvent } from 'aws-lambda';
import { assertOwner, getAuthContext } from '../../src/common/auth';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors';

function eventWithClaims(claims?: Record<string, string>): APIGatewayProxyEvent {
  return {
    requestContext: claims ? { authorizer: { claims } } : {},
  } as unknown as APIGatewayProxyEvent;
}

describe('getAuthContext', () => {
  it('sub を userId として取り出す', () => {
    const auth = getAuthContext(
      eventWithClaims({
        sub: 'cognito-sub-1',
        email: 'user@example.com',
        name: 'テストユーザー',
      }),
    );

    expect(auth).toEqual({
      userId: 'cognito-sub-1',
      email: 'user@example.com',
      displayName: 'テストユーザー',
    });
  });

  it('任意クレームが無くても userId は取得できる', () => {
    expect(getAuthContext(eventWithClaims({ sub: 'cognito-sub-2' }))).toEqual({
      userId: 'cognito-sub-2',
    });
  });

  it('クレームが無い場合は UNAUTHORIZED', () => {
    expect(() => getAuthContext(eventWithClaims())).toThrow(UnauthorizedError);
  });

  it('sub が無い場合は UNAUTHORIZED', () => {
    expect(() => getAuthContext(eventWithClaims({ email: 'user@example.com' }))).toThrow(
      UnauthorizedError,
    );
  });
});

describe('assertOwner', () => {
  const auth = { userId: 'owner-sub' };

  it('所有者が一致すれば通過する', () => {
    expect(() => assertOwner('owner-sub', auth)).not.toThrow();
  });

  it('他ユーザーのリソースは FORBIDDEN', () => {
    expect(() => assertOwner('other-sub', auth)).toThrow(ForbiddenError);
  });

  it('所有者が未設定のリソースも FORBIDDEN', () => {
    expect(() => assertOwner(undefined, auth)).toThrow(ForbiddenError);
  });
});
