/**
 * APIクライアント。
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/API共通設計.md
 *             01_docs/02_sd/04_共通設計/エラーハンドリング方針.md §2.3
 *
 * すべてのリクエストにCognitoのIDトークンを付与し、エラーレスポンスを
 * ApiError に変換する。401 の場合はトークンを破棄して呼び出し元に通知する。
 */
import { currentIdToken, signOut } from '../auth/cognito';

/** API共通設計 §6 の共通エラーコード */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'NETWORK_ERROR';

export interface ApiErrorDetail {
  field: string;
  reason: string;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details: ApiErrorDetail[];

  constructor(
    code: ApiErrorCode,
    statusCode: number,
    message: string,
    details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * エラーコードに対する既定の表示メッセージ。
 * エラーハンドリング方針 §3 の対応表に準拠する。
 */
const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: '入力内容を確認してください',
  UNAUTHORIZED: 'セッションの有効期限が切れました。再度ログインしてください',
  FORBIDDEN: 'この操作を行う権限がありません',
  NOT_FOUND: '指定されたデータが見つかりません',
  CONFLICT: '操作を完了できませんでした',
  INTERNAL_ERROR: 'エラーが発生しました。時間をおいて再度お試しください',
  EXTERNAL_SERVICE_ERROR: '外部サービスとの連携でエラーが発生しました',
  NETWORK_ERROR: '通信エラーが発生しました。時間をおいて再度お試しください',
};

/** ApiError から画面表示用のメッセージを組み立てる */
export function toDisplayMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return DEFAULT_MESSAGES.INTERNAL_ERROR;
  }
  // バリデーションエラーはサーバーが返す具体的な文言を優先する
  if (error.code === 'VALIDATION_ERROR' && error.message) {
    return error.message;
  }
  return DEFAULT_MESSAGES[error.code] ?? error.message;
}

function baseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!value) {
    throw new Error('環境変数 VITE_API_BASE_URL が設定されていません');
  }
  return value.replace(/\/+$/, '');
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = new URL(`${baseUrl()}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * 認証付きでAPIを呼び出す。
 *
 * @throws {ApiError} HTTPエラー、通信断、トークン取得失敗のいずれか
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let idToken: string;
  try {
    idToken = await currentIdToken();
  } catch {
    // リフレッシュにも失敗した場合はサインイン状態を破棄する
    signOut();
    throw new ApiError('UNAUTHORIZED', 401, DEFAULT_MESSAGES.UNAUTHORIZED);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 0, DEFAULT_MESSAGES.NETWORK_ERROR);
  }

  if (response.ok) {
    return (await response.json()) as T;
  }

  // 401 はトークン破棄まで行う（エラーハンドリング方針 §2.3）
  if (response.status === 401) {
    signOut();
    throw new ApiError('UNAUTHORIZED', 401, DEFAULT_MESSAGES.UNAUTHORIZED);
  }

  const parsed = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string; details?: ApiErrorDetail[] };
  } | null;

  const code = (parsed?.error?.code ?? 'INTERNAL_ERROR') as ApiErrorCode;
  throw new ApiError(
    code,
    response.status,
    parsed?.error?.message ?? DEFAULT_MESSAGES[code] ?? DEFAULT_MESSAGES.INTERNAL_ERROR,
    parsed?.error?.details ?? [],
  );
}
