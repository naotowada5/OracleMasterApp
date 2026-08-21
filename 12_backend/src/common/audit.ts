/**
 * 全テーブル共通の監査項目（登録日・登録者・更新日・更新者）の付与。
 *
 * 対応設計書: 01_docs/02_sd/03_データベース設計/テーブル一覧.md §共通項目
 *
 * 登録者・更新者には認証済みAPIでは Cognito の `sub` を、開発者スクリプトや
 * システム起因の書き込みでは `SYSTEM` を設定する。クライアントが指定した値は
 * 決して使用しない（認証・認可設計 §3）。
 */

/** システム起因の書き込みを表す固定値 */
export const SYSTEM_ACTOR = 'SYSTEM';

/** 共通項目（4項目すべて） */
export interface AuditFields {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** 更新時に上書きする共通項目 */
export type AuditUpdateFields = Pick<AuditFields, 'updatedAt' | 'updatedBy'>;

/**
 * 新規レコード用の共通項目を生成する。
 * 作成時は `updatedAt`/`updatedBy` に `createdAt`/`createdBy` と同値を設定する。
 *
 * @param actor Cognito sub、またはシステム起因の場合は `SYSTEM_ACTOR`
 * @param now   生成時刻。省略時は現在時刻（テスト用に注入可能）
 */
export function createAuditFields(actor: string, now: Date = new Date()): AuditFields {
  const timestamp = now.toISOString();
  return {
    createdAt: timestamp,
    createdBy: actor,
    updatedAt: timestamp,
    updatedBy: actor,
  };
}

/**
 * 更新用の共通項目を生成する。
 * `createdAt`/`createdBy` は更新時に上書きしないため含めない。
 */
export function updateAuditFields(actor: string, now: Date = new Date()): AuditUpdateFields {
  return {
    updatedAt: now.toISOString(),
    updatedBy: actor,
  };
}

/** 共通項目のキー一覧。APIレスポンス組み立て時の除外に使用する */
export const AUDIT_KEYS: readonly (keyof AuditFields)[] = [
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
];

/**
 * DynamoDBのアイテムから共通項目を取り除く。
 *
 * 共通項目は監査用の内部項目でありAPIレスポンスには含めない
 * （API共通設計 §8.1。`GET /users/me` の `createdAt` のみ例外のため、
 * その場合は `keep` に指定する）。
 */
export function stripAuditFields<T extends Record<string, unknown>>(
  item: T,
  keep: readonly (keyof AuditFields)[] = [],
): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    const isAuditKey = (AUDIT_KEYS as readonly string[]).includes(key);
    if (!isAuditKey || (keep as readonly string[]).includes(key)) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}
