/**
 * APIレスポンスの組み立て。
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/API共通設計.md §4, §9
 */
import type { APIGatewayProxyResult } from 'aws-lambda';
import { allowedOrigins } from './config';
import type { AppError, ErrorCode, ErrorDetail } from './errors';

/** 一覧系APIの共通レスポンス形式（API共通設計 §4.1） */
export interface ListResponse<T> {
  items: T[];
  nextToken: string | null;
}

/** エラーレスポンス形式（API共通設計 §4.2） */
export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
}

/**
 * CORSヘッダを組み立てる。
 *
 * API Gateway が処理するのはプリフライト（OPTIONS）のみで、実リクエストの
 * レスポンスには Lambda 側でヘッダを付与する必要がある。許可リストに含まれる
 * オリジンのみをそのまま返し、ワイルドカードは使用しない（API共通設計 §9）。
 */
export function corsHeaders(requestOrigin?: string): Record<string, string> {
  if (!requestOrigin) {
    return {};
  }
  if (!allowedOrigins().includes(requestOrigin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': requestOrigin,
    Vary: 'Origin',
  };
}

function buildResponse(
  statusCode: number,
  body: unknown,
  requestOrigin?: string,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(requestOrigin),
    },
    body: JSON.stringify(body),
  };
}

/** 200 OK */
export function ok(body: unknown, requestOrigin?: string): APIGatewayProxyResult {
  return buildResponse(200, body, requestOrigin);
}

/** 201 Created（POST /sessions 等） */
export function created(body: unknown, requestOrigin?: string): APIGatewayProxyResult {
  return buildResponse(201, body, requestOrigin);
}

/** エラーレスポンス */
export function errorResponse(error: AppError, requestOrigin?: string): APIGatewayProxyResult {
  const body: ErrorResponseBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
  return buildResponse(error.statusCode, body, requestOrigin);
}
