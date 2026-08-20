/**
 * 実行環境の設定値。すべて Lambda の環境変数から取得する。
 *
 * 対応設計書: 01_docs/02_sd/04_共通設計/命名規約.md §2, システム構成・環境設計.md §3
 */

/** 環境プレフィックスなしのテーブル名（命名規約 §2.1） */
export const TABLES = {
  QUALIFICATION: 'OR_M_QUALIFICATION',
  CATEGORY: 'OR_M_CATEGORY',
  QUESTION: 'OR_M_QUESTION',
  CHOICE: 'OR_M_CHOICE',
  USER: 'OR_M_USER',
  EXAM_SESSION: 'OR_T_EXAM_SESSION',
  ANSWER_HISTORY: 'OR_T_ANSWER_HISTORY',
} as const;

export type LogicalTableName = (typeof TABLES)[keyof typeof TABLES];

/** GSI名（命名規約 §2: `{属性名}-index`） */
export const INDEXES = {
  QUALIFICATION_ID: 'qualificationId-index',
  CATEGORY_ID: 'categoryId-index',
  QUESTION_ID: 'questionId-index',
  SESSION_ID: 'sessionId-index',
  USER_ID: 'userId-index',
  EMAIL: 'email-index',
} as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }
  return value;
}

/**
 * 物理テーブル名を組み立てる。
 *
 * `{環境プレフィックス}-OR_{種類}_{名称}`（命名規約 §2.1）。
 * 13_infra 側の `lib/config/environments.ts#tableName` と同じ規則であり、
 * 変更する場合は両方を揃えること。
 */
export function tableName(logicalName: LogicalTableName): string {
  return `${requireEnv('TABLE_NAME_PREFIX')}-${logicalName}`;
}

/** 現在の環境名（dev / stg / prod） */
export function envName(): string {
  return process.env.ENV_NAME ?? 'dev';
}

/**
 * CORSで許可するオリジン一覧（API共通設計 §9）。
 * ワイルドカードは使用しないため、未設定時は空配列とし許可ヘッダを返さない。
 */
export function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
