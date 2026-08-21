/**
 * API-10 ユーザー情報取得（GET /users/me）
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/個別API設計書/API-10_ユーザー情報取得.md
 *
 * トークンの `sub` で自分自身のレコードのみを取得する。レコードが存在しない
 * 初回アクセス時は Cognito のクレームから自動作成する（Post Confirmation
 * Lambda トリガーで事前作成済みの場合のフォールバックも兼ねる）。
 */
import { createAuditFields, updateAuditFields } from '../common/audit';
import { getAuthContext, type AuthContext } from '../common/auth';
import { TABLES, tableName } from '../common/config';
import { getItem, putItem, updateItem } from '../common/dynamodb';
import { requestOrigin, withErrorHandling } from '../common/handler';
import { logger } from '../common/logger';
import { ok } from '../common/response';
import type { UserItem } from '../models';

/**
 * API-10 のレスポンス。共通項目のうち `createdAt` のみ含める
 * （API共通設計 §8.1 の例外）。
 */
interface UserResponse {
  userId: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string;
}

function toResponse(item: UserItem): UserResponse {
  return {
    userId: item.userId,
    email: item.email,
    displayName: item.displayName,
    createdAt: item.createdAt,
    lastLoginAt: item.lastLoginAt,
  };
}

/**
 * 表示名を決定する。
 *
 * S-02 で入力された表示名は Cognito の `name` クレームに入る。クレームが無い
 * ユーザー（管理者がCLIで作成した場合等）はメールアドレスのローカル部で代替する。
 */
function resolveDisplayName(auth: AuthContext): string {
  if (auth.displayName) {
    return auth.displayName;
  }
  const localPart = auth.email?.split('@')[0];
  return localPart && localPart.length > 0 ? localPart : auth.userId;
}

/** 初回アクセス時のレコード自動作成 */
async function provisionUser(auth: AuthContext, now: Date): Promise<UserItem> {
  const item: UserItem = {
    userId: auth.userId,
    email: auth.email ?? '',
    displayName: resolveDisplayName(auth),
    lastLoginAt: now.toISOString(),
    // 自動プロビジョニングのため登録者は本人（テーブル一覧 §共通項目）
    ...createAuditFields(auth.userId, now),
  };

  await putItem(tableName(TABLES.USER), item, 'attribute_not_exists(userId)');
  logger.info('ユーザーレコードを自動作成しました', { userId: auth.userId });
  return item;
}

/** `lastLoginAt` と共通項目の更新（API-10 は呼び出しの都度更新する） */
async function touchLastLogin(auth: AuthContext, now: Date): Promise<UserItem | undefined> {
  const audit = updateAuditFields(auth.userId, now);

  return updateItem<UserItem>({
    TableName: tableName(TABLES.USER),
    Key: { userId: auth.userId },
    UpdateExpression:
      'SET lastLoginAt = :lastLoginAt, updatedAt = :updatedAt, updatedBy = :updatedBy',
    ExpressionAttributeValues: {
      ':lastLoginAt': now.toISOString(),
      ':updatedAt': audit.updatedAt,
      ':updatedBy': audit.updatedBy,
    },
    ReturnValues: 'ALL_NEW',
  });
}

export const handler = withErrorHandling('API-10', async (event) => {
  const auth = getAuthContext(event);
  const now = new Date();
  const origin = requestOrigin(event);

  const existing = await getItem<UserItem>(tableName(TABLES.USER), { userId: auth.userId });

  if (!existing) {
    try {
      const created = await provisionUser(auth, now);
      return ok(toResponse(created), origin);
    } catch (error) {
      // 同時リクエストで既に作成済みの場合は、作成をあきらめて更新経路に合流する
      if (!(error instanceof Error) || error.name !== 'ConditionalCheckFailedException') {
        throw error;
      }
      logger.warn('ユーザーレコードが同時に作成されました。更新経路で継続します', {
        userId: auth.userId,
      });
    }
  }

  const updated = await touchLastLogin(auth, now);
  if (!updated) {
    // ReturnValues=ALL_NEW を指定しているため通常ここには到達しない
    throw new Error('ユーザーレコードの更新結果を取得できませんでした');
  }

  return ok(toResponse(updated), origin);
});
