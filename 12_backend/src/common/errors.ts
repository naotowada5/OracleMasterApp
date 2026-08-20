/**
 * 業務エラーの定義。
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/API共通設計.md §5, §6
 *             01_docs/02_sd/04_共通設計/エラーハンドリング方針.md §2.2
 */

/** API共通設計 §6 の共通エラーコード */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'EXTERNAL_SERVICE_ERROR';

/** フィールド単位のバリデーションエラー詳細（API共通設計 §4.2） */
export interface ErrorDetail {
  field: string;
  reason: string;
}

/**
 * 想定内エラーの基底クラス。
 * これを継承した例外は共通ハンドラが対応するHTTPステータスに変換する。
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: ErrorDetail[];

  constructor(code: ErrorCode, statusCode: number, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/** 400: リクエストパラメータのバリデーションエラー */
export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

/** 401: 未認証・トークン無効（通常はAPI Gatewayが返すため、到達は想定外） */
export class UnauthorizedError extends AppError {
  constructor(message = '認証情報が確認できませんでした') {
    super('UNAUTHORIZED', 401, message);
  }
}

/** 403: 他ユーザーのリソースへのアクセス（認証・認可設計 §2.2） */
export class ForbiddenError extends AppError {
  constructor(message = 'この操作を行う権限がありません') {
    super('FORBIDDEN', 403, message);
  }
}

/** 404: リソースが存在しない */
export class NotFoundError extends AppError {
  constructor(message = '指定されたデータが見つかりません') {
    super('NOT_FOUND', 404, message);
  }
}

/** 409: 状態不整合（例: 完了済みセッションへの回答送信） */
export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', 409, message);
  }
}

/** 503: DynamoDB / Claude API 等の外部依存エラー */
export class ExternalServiceError extends AppError {
  constructor(message = '外部サービスとの連携でエラーが発生しました') {
    super('EXTERNAL_SERVICE_ERROR', 503, message);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
