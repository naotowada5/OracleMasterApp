import { RemovalPolicy } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

/**
 * 環境名。要件定義書 §10.3 / システム構成・環境設計 §3 の dev / stg / prod に対応する。
 */
export type EnvName = 'dev' | 'stg' | 'prod';

export const ENV_NAMES: readonly EnvName[] = ['dev', 'stg', 'prod'];

export interface EnvironmentConfig {
  /** 環境名。DynamoDBテーブル名のプレフィックス・API Gatewayのステージ名にも使用する */
  readonly envName: EnvName;
  /** CORSで許可するフロントエンドのオリジン（ワイルドカード禁止。API共通設計 §9） */
  readonly allowedOrigins: string[];
  /** API Gateway ステージのスロットリング設定（API共通設計 §10） */
  readonly throttling: { readonly rateLimit: number; readonly burstLimit: number };
  /** CloudWatch Logs の保持期間 */
  readonly logRetention: RetentionDays;
  /** スタック削除時のデータリソースの扱い（本番は保持） */
  readonly removalPolicy: RemovalPolicy;
  /** API Gatewayのアクセスログに実行トレース（リクエスト/レスポンス本文）を含めるか。本番は無効 */
  readonly dataTraceEnabled: boolean;
  /** アラート通知先メールアドレス（未指定時はSNSトピックのみ作成しサブスクリプションは張らない） */
  readonly alarmEmail?: string;
}

/**
 * テーブル名を命名規約に従って組み立てる。
 *
 * `{環境プレフィックス}-OR_{テーブル種類}_{テーブル名}`（命名規約 §2.1）
 */
export function tableName(envName: EnvName, logicalTableName: string): string {
  return `${envName}-${logicalTableName}`;
}

export interface BuildConfigOptions {
  readonly envName: EnvName;
  /** `-c frontendOrigin=https://...` で与えるフロントエンドのオリジン */
  readonly frontendOrigin?: string;
  /** `-c alarmEmail=ops@example.com` で与えるアラート通知先 */
  readonly alarmEmail?: string;
}

/** dev のみローカル開発サーバー（Vite）からのアクセスを既定で許可する */
const LOCAL_DEV_ORIGIN = 'http://localhost:5173';

export function buildConfig(options: BuildConfigOptions): EnvironmentConfig {
  const { envName, frontendOrigin, alarmEmail } = options;

  if (envName !== 'dev' && !frontendOrigin) {
    throw new Error(
      `env=${envName} では CORS 許可オリジンの指定が必須です。` +
        `\`cdk deploy -c env=${envName} -c frontendOrigin=https://<Amplifyのドメイン>\` の形式で指定してください` +
        '（API共通設計 §9: ワイルドカード `*` は使用しない）。',
    );
  }

  const allowedOrigins =
    envName === 'dev'
      ? [LOCAL_DEV_ORIGIN, ...(frontendOrigin ? [frontendOrigin] : [])]
      : [frontendOrigin!];

  switch (envName) {
    case 'dev':
      return {
        envName,
        allowedOrigins,
        throttling: { rateLimit: 50, burstLimit: 100 },
        logRetention: RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
        dataTraceEnabled: true,
        alarmEmail,
      };
    case 'stg':
      return {
        envName,
        allowedOrigins,
        throttling: { rateLimit: 100, burstLimit: 200 },
        logRetention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
        dataTraceEnabled: true,
        alarmEmail,
      };
    case 'prod':
      return {
        envName,
        allowedOrigins,
        // 同時接続100ユーザー（要件定義書 §8.1）に対して余裕を持たせた値
        throttling: { rateLimit: 200, burstLimit: 400 },
        logRetention: RetentionDays.THREE_MONTHS,
        removalPolicy: RemovalPolicy.RETAIN,
        dataTraceEnabled: false,
        alarmEmail,
      };
  }
}
