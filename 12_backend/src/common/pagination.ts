/**
 * カーソルベースページング。
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/API共通設計.md §7
 *
 * DynamoDB の `LastEvaluatedKey` を Base64 エンコードしたものを `nextToken` として扱う。
 */
import { ValidationError } from './errors';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export type DynamoKey = Record<string, unknown>;

/** `LastEvaluatedKey` を `nextToken` に変換する。未指定時は null */
export function encodeNextToken(lastEvaluatedKey: DynamoKey | undefined): string | null {
  if (!lastEvaluatedKey) {
    return null;
  }
  return Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString('base64');
}

/** `nextToken` を `ExclusiveStartKey` に戻す。不正な値は 400 とする */
export function decodeNextToken(nextToken: string | undefined | null): DynamoKey | undefined {
  if (!nextToken) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(nextToken, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(decoded);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('object ではありません');
    }
    return parsed as DynamoKey;
  } catch {
    throw new ValidationError('nextToken の形式が不正です', [
      { field: 'nextToken', reason: 'invalid_format' },
    ]);
  }
}

/**
 * `limit` クエリパラメータを検証して確定する。
 * 未指定時は既定値20、範囲外（1未満・100超）は 400。
 */
export function resolveLimit(rawLimit: string | undefined | null): number {
  if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
    return DEFAULT_LIMIT;
  }
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ValidationError(`limit は1〜${MAX_LIMIT}の範囲で指定してください`, [
      { field: 'limit', reason: 'out_of_range' },
    ]);
  }
  return limit;
}
