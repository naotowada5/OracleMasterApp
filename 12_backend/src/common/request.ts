/**
 * リクエスト解析のヘルパー。
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/API共通設計.md §3, §4
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { ValidationError } from './errors';

/**
 * リクエストボディをJSONとして解析する。
 *
 * ボディが空、またはJSONとして不正な場合は 400 とする
 * （エラーハンドリング方針 §2.2 の「想定内エラーは明示的に検知する」）。
 */
export function parseJsonBody<T = Record<string, unknown>>(event: APIGatewayProxyEvent): T {
  if (!event.body) {
    throw new ValidationError('リクエストボディが空です');
  }

  try {
    const parsed: unknown = JSON.parse(event.body);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('object ではありません');
    }
    return parsed as T;
  } catch {
    throw new ValidationError('リクエストボディの形式が不正です');
  }
}

/**
 * 必須の文字列項目を取り出す。
 *
 * @param field エラー詳細に含めるフィールド名
 */
export function requireString(value: unknown, field: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${label}を指定してください`, [{ field, reason: 'required' }]);
  }
  return value;
}

/**
 * 任意の整数項目を範囲チェック付きで取り出す。未指定時は undefined。
 */
export function optionalIntInRange(
  value: unknown,
  field: string,
  label: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label}は${min}〜${max}の範囲で入力してください`, [
      { field, reason: 'out_of_range' },
    ]);
  }
  return value;
}
