/**
 * Cognitoクレームの取得。
 *
 * 対応設計書: 01_docs/02_sd/04_共通設計/認証・認可設計.md §2.2, §3
 *
 * クライアントがボディやパスパラメータで userId を指定してきても信用せず、
 * 必ずトークンの `sub` を正とする。
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { ForbiddenError, UnauthorizedError } from './errors';

export interface AuthContext {
  /** Cognito sub。アプリ内の userId と同一 */
  readonly userId: string;
  /** メールアドレス。ログには出力しないこと */
  readonly email?: string;
  /** 表示名（`name` クレーム）。S-02 で入力された値 */
  readonly displayName?: string;
}

/**
 * リクエストからCognitoクレームを取り出す。
 *
 * API Gateway の Cognito オーソライザーを通過したリクエストのみが Lambda に
 * 到達するため、通常ここで失敗することはない。到達した場合は構成不備であり
 * 401 として扱う。
 */
export function getAuthContext(event: APIGatewayProxyEvent): AuthContext {
  const claims = event.requestContext?.authorizer?.claims as Record<string, string> | undefined;
  const userId = claims?.sub;

  if (!userId) {
    throw new UnauthorizedError();
  }

  const email = claims.email;
  const displayName = claims.name;

  return {
    userId,
    ...(email ? { email } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

/**
 * リソースの所有者が呼び出しユーザー自身であることを検証する。
 * 不一致の場合は 403 を送出する（認証・認可設計 §2.2）。
 */
export function assertOwner(resourceUserId: string | undefined, auth: AuthContext): void {
  if (resourceUserId !== auth.userId) {
    throw new ForbiddenError();
  }
}
