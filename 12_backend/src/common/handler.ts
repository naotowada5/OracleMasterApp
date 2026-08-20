/**
 * 全Lambdaハンドラ共通のラッパー。
 *
 * 対応設計書: 01_docs/02_sd/04_共通設計/エラーハンドリング方針.md §2.2
 *             01_docs/02_sd/04_共通設計/ログ・監視設計.md §1
 *
 * - 想定内エラー（AppError）は対応するHTTPステータス・エラーコードに変換する
 * - 想定外の例外は 500 INTERNAL_ERROR とし、スタックトレースはCloudWatch Logsに
 *   のみ出力してレスポンスには含めない
 * - リクエストID・API名・処理時間をログに記録する
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { AppError, isAppError } from './errors';
import { logger } from './logger';
import { errorResponse } from './response';

export type ApiHandler = (
  event: APIGatewayProxyEvent,
  context: Context,
) => Promise<APIGatewayProxyResult>;

/** リクエストヘッダから Origin を取り出す（ヘッダ名の大小文字を吸収する） */
export function requestOrigin(event: APIGatewayProxyEvent): string | undefined {
  const headers = event.headers ?? {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'origin' && value) {
      return value;
    }
  }
  return undefined;
}

/**
 * ハンドラを共通のエラーハンドリング・ロギングでラップする。
 *
 * @param apiName ログに記録するAPI名（例: `API-01`）
 */
export function withErrorHandling(apiName: string, handler: ApiHandler): ApiHandler {
  return async (event, context) => {
    const startedAt = Date.now();
    const requestId = event.requestContext?.requestId;
    const origin = requestOrigin(event);

    // ユーザー識別子はログ用途にのみ使用する。メールアドレスは記録しない
    const userId = (event.requestContext?.authorizer?.claims as Record<string, string> | undefined)
      ?.sub;

    logger.info('リクエスト開始', {
      requestId,
      apiName,
      userId,
      httpMethod: event.httpMethod,
      path: event.path,
    });

    try {
      const result = await handler(event, context);
      logger.info('リクエスト正常終了', {
        requestId,
        apiName,
        userId,
        statusCode: result.statusCode,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      if (isAppError(error)) {
        // 想定内エラー: 400/403/404/409 等は WARN（ログ・監視設計 §1.1）
        logger.warn('想定内エラー', {
          requestId,
          apiName,
          userId,
          errorCode: error.code,
          statusCode: error.statusCode,
          message: error.message,
          durationMs,
        });
        return errorResponse(error, origin);
      }

      // 想定外エラー: スタックトレースはログにのみ出力する
      logger.error('想定外エラー', {
        requestId,
        apiName,
        userId,
        durationMs,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const internal = new AppError(
        'INTERNAL_ERROR',
        500,
        'エラーが発生しました。時間をおいて再度お試しください',
      );
      return errorResponse(internal, origin);
    }
  };
}
