/**
 * 構造化ログ出力。
 *
 * 対応設計書: 01_docs/02_sd/04_共通設計/ログ・監視設計.md §1
 *
 * - CloudWatch Logs にJSON1行で出力する
 * - メールアドレス等の個人情報は出力しない（§1.2）。userId（Cognito sub）のみ記録する
 */

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

/** DEBUG は開発環境でのみ有効化する（ログ・監視設計 §1.1） */
function currentLevel(): LogLevel {
  const configured = (process.env.LOG_LEVEL ?? 'INFO').toUpperCase();
  return configured in LEVEL_PRIORITY ? (configured as LogLevel) : 'INFO';
}

/**
 * ログに含めてはならない個人情報のキー（ログ・監視設計 §1.2）。
 * 大小文字を無視して照合するため、要素はすべて小文字で定義すること。
 */
const MASKED_KEYS = new Set(['email', 'password', 'displayname', 'name', 'authorization']);

/** 個人情報に該当するキーを再帰的にマスクする */
export function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(maskSensitive);
  }
  if (value !== null && typeof value === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      masked[key] = MASKED_KEYS.has(key.toLowerCase()) ? '***' : maskSensitive(item);
    }
    return masked;
  }
  return value;
}

export interface LogContext {
  /** API Gateway のリクエストID */
  requestId?: string | undefined;
  /** API名（例: API-01） */
  apiName?: string | undefined;
  /** Cognito sub。メールアドレスは記録しない */
  userId?: string | undefined;
  [key: string]: unknown;
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVEL_PRIORITY[level] > LEVEL_PRIORITY[currentLevel()]) {
    return;
  }
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ? (maskSensitive(context) as LogContext) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  error: (message: string, context?: LogContext) => write('ERROR', message, context),
  warn: (message: string, context?: LogContext) => write('WARN', message, context),
  info: (message: string, context?: LogContext) => write('INFO', message, context),
  debug: (message: string, context?: LogContext) => write('DEBUG', message, context),
};
