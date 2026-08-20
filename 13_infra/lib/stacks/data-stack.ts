import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { EnvironmentConfig, tableName } from '../config/environments';

export interface DataStackProps extends StackProps {
  readonly config: EnvironmentConfig;
}

interface GsiDefinition {
  readonly indexName: string;
  readonly partitionKey: string;
}

interface TableDefinition {
  /** CDK上の論理ID */
  readonly id: string;
  /** 命名規約 §2.1 に従う環境プレフィックスなしのテーブル名 */
  readonly name: string;
  readonly partitionKey: string;
  readonly gsis: readonly GsiDefinition[];
}

/**
 * テーブル定義。テーブル一覧（01_docs/02_sd/03_データベース設計/テーブル一覧.md）および
 * 各個別エンティティ定義書（T-01〜T-07）の PK / GSI をそのまま反映したもの。
 *
 * DynamoDB はキー属性以外スキーマレスのため、キー以外の属性（共通項目 createdAt /
 * createdBy / updatedAt / updatedBy を含む）はテーブル定義には現れない。
 */
const TABLE_DEFINITIONS: readonly TableDefinition[] = [
  // T-01 資格マスタ（GSIなし。件数が少ないためScan運用）
  {
    id: 'QualificationTable',
    name: 'OR_M_QUALIFICATION',
    partitionKey: 'qualificationId',
    gsis: [],
  },
  // T-02 大問カテゴリマスタ
  {
    id: 'CategoryTable',
    name: 'OR_M_CATEGORY',
    partitionKey: 'categoryId',
    gsis: [{ indexName: 'qualificationId-index', partitionKey: 'qualificationId' }],
  },
  // T-03 問題テーブル
  {
    id: 'QuestionTable',
    name: 'OR_M_QUESTION',
    partitionKey: 'questionId',
    gsis: [
      { indexName: 'qualificationId-index', partitionKey: 'qualificationId' },
      { indexName: 'categoryId-index', partitionKey: 'categoryId' },
    ],
  },
  // T-04 選択肢テーブル
  {
    id: 'ChoiceTable',
    name: 'OR_M_CHOICE',
    partitionKey: 'choiceId',
    gsis: [{ indexName: 'questionId-index', partitionKey: 'questionId' }],
  },
  // T-05 ユーザーテーブル
  {
    id: 'UserTable',
    name: 'OR_M_USER',
    partitionKey: 'userId',
    gsis: [{ indexName: 'email-index', partitionKey: 'email' }],
  },
  // T-06 試験セッションテーブル
  {
    id: 'ExamSessionTable',
    name: 'OR_T_EXAM_SESSION',
    partitionKey: 'sessionId',
    gsis: [{ indexName: 'userId-index', partitionKey: 'userId' }],
  },
  // T-07 回答履歴テーブル
  {
    id: 'AnswerHistoryTable',
    name: 'OR_T_ANSWER_HISTORY',
    partitionKey: 'historyId',
    gsis: [{ indexName: 'sessionId-index', partitionKey: 'sessionId' }],
  },
];

/**
 * データストア（DynamoDB / S3）スタック。
 *
 * 対応タスク: T1-3, T1-4
 * 対応設計書: 01_docs/02_sd/03_データベース設計/テーブル一覧.md
 */
export class DataStack extends Stack {
  /** 環境プレフィックスなしのテーブル名をキーとしたテーブル参照 */
  public readonly tables: Record<string, dynamodb.TableV2>;
  public readonly assetBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { config } = props;

    // ------------------------------------------------------------------
    // DynamoDB 7テーブル
    //   - オンデマンドキャパシティ（要件定義書 §5.2）
    //   - 保存時暗号化: AWS管理キー（要件定義書 §9.3）
    //   - PITR: RPO 24時間以内の要件（ログ・監視設計 §4）を満たすため全環境で有効化
    // ------------------------------------------------------------------
    this.tables = {};

    for (const definition of TABLE_DEFINITIONS) {
      const table = new dynamodb.TableV2(this, definition.id, {
        tableName: tableName(config.envName, definition.name),
        partitionKey: { name: definition.partitionKey, type: dynamodb.AttributeType.STRING },
        billing: dynamodb.Billing.onDemand(),
        encryption: dynamodb.TableEncryptionV2.awsManagedKey(),
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
        removalPolicy: config.removalPolicy,
        globalSecondaryIndexes: definition.gsis.map((gsi) => ({
          indexName: gsi.indexName,
          partitionKey: { name: gsi.partitionKey, type: dynamodb.AttributeType.STRING },
          // Lambda側で結合せず1回のQueryで完結させるため全属性を射影する
          projectionType: dynamodb.ProjectionType.ALL,
        })),
      });

      this.tables[definition.name] = table;
    }

    // ------------------------------------------------------------------
    // S3バケット（解説画像 / Phase3のJSONインポートファイル）
    //   - パブリックアクセス完全ブロック（システム構成・環境設計 §5）
    // ------------------------------------------------------------------
    this.assetBucket = new s3.Bucket(this, 'AssetBucket', {
      bucketName: `oracle-master-app-${config.envName}-assets-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: config.removalPolicy,
      // dev/stg（RemovalPolicy.DESTROY）ではスタック削除時にオブジェクトごと削除する。
      // prod（RETAIN）ではバケットを残すため自動削除しない。
      autoDeleteObjects: config.removalPolicy === RemovalPolicy.DESTROY,
    });

    new CfnOutput(this, 'AssetBucketName', {
      value: this.assetBucket.bucketName,
      description: '解説画像・インポートファイル用S3バケット',
    });

    for (const definition of TABLE_DEFINITIONS) {
      new CfnOutput(this, `${definition.id}Name`, {
        value: this.tables[definition.name].tableName,
        description: `DynamoDBテーブル名: ${definition.name}`,
      });
    }
  }
}
