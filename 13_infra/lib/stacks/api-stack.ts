import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

/**
 * 12_backend のビルド成果物（dist）のルート。
 *
 * ハンドラは 12_backend の `npm run build:lambda` で事前にバンドルしておく。
 * CDK の NodejsFunction を使わないのは、ローカルバンドリング失敗時に Docker へ
 * フォールバックし、Docker 未導入の環境でデプロイできなくなるため。
 */
const BACKEND_DIST = path.join(__dirname, '..', '..', '..', '12_backend', 'dist');

export interface ApiStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly userPool: cognito.IUserPool;
  /** 環境プレフィックスなしのテーブル名をキーとしたテーブル参照（DataStack から受け取る） */
  readonly tables: Record<string, dynamodb.ITableV2>;
}

/** 実装済みAPIの定義 */
interface ApiDefinition {
  /** API設計書のID（追跡用） */
  readonly apiId: string;
  /** CDK上の論理ID */
  readonly id: string;
  /** 12_backend/src/handlers 配下のファイル名（拡張子なし） */
  readonly entry: string;
  /** 読み取り権限を付与するテーブル（環境プレフィックスなしの名前） */
  readonly readTables: string[];
  /** 読み書き権限を付与するテーブル */
  readonly readWriteTables: string[];
}

/**
 * API Gateway（REST）スタック。
 *
 * 対応タスク: T1-5（枠組み）, T2-2〜T2-4（各APIのLambda登録）
 * 対応設計書: 01_docs/02_sd/02_API設計/API共通設計.md, API一覧.md
 *
 * Phase1対象の8エンドポイントを全て Cognito オーソライザー付きで登録する。
 * Phase3対象の /questions/import・/questions/generate は登録しない（API一覧）。
 */
export class ApiStack extends Stack {
  public readonly restApi: apigateway.RestApi;

  private readonly config: EnvironmentConfig;
  private readonly tables: Record<string, dynamodb.ITableV2>;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config, userPool, tables } = props;
    this.config = config;
    this.tables = tables;

    // ------------------------------------------------------------------
    // REST API 本体
    // ------------------------------------------------------------------
    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogGroup', {
      logGroupName: `/aws/apigateway/oracle-master-app-${config.envName}`,
      retention: config.logRetention,
      removalPolicy: config.removalPolicy,
    });

    this.restApi = new apigateway.RestApi(this, 'RestApi', {
      restApiName: `oracle-master-app-${config.envName}`,
      description: `Oracle Master 資格問題アプリ API (${config.envName})`,
      deployOptions: {
        // API共通設計 §1: ステージ名は環境名に一致させる
        stageName: config.envName,
        throttlingRateLimit: config.throttling.rateLimit,
        throttlingBurstLimit: config.throttling.burstLimit,
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: config.dataTraceEnabled,
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogGroup),
        // ログ・監視設計 §1: メソッド・パス・ステータス・レイテンシ・呼び出しユーザー(sub)
        accessLogFormat: apigateway.AccessLogFormat.custom(
          JSON.stringify({
            requestId: apigateway.AccessLogField.contextRequestId(),
            httpMethod: apigateway.AccessLogField.contextHttpMethod(),
            path: apigateway.AccessLogField.contextPath(),
            status: apigateway.AccessLogField.contextStatus(),
            responseLatency: apigateway.AccessLogField.contextResponseLatency(),
            userSub: apigateway.AccessLogField.contextAuthorizerClaims('sub'),
          }),
        ),
      },
      // API共通設計 §9: 許可オリジンはフロントエンドのURLに限定（ワイルドカード禁止）
      defaultCorsPreflightOptions: {
        allowOrigins: config.allowedOrigins,
        allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
        allowCredentials: false,
      },
    });

    // ------------------------------------------------------------------
    // Cognito オーソライザー（API共通設計 §2: 全ルートに適用・参照系も例外なし）
    // ------------------------------------------------------------------
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      authorizerName: `oracle-master-app-${config.envName}-authorizer`,
      cognitoUserPools: [userPool],
    });

    const methodOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // ------------------------------------------------------------------
    // 実装済みAPI（T2-2 参照系）
    // ------------------------------------------------------------------
    const listQualifications = this.createApiFunction({
      apiId: 'API-01',
      id: 'ListQualificationsFunction',
      entry: 'list-qualifications',
      readTables: ['OR_M_QUALIFICATION'],
      readWriteTables: [],
    });

    const listCategories = this.createApiFunction({
      apiId: 'API-02',
      id: 'ListCategoriesFunction',
      entry: 'list-categories',
      readTables: ['OR_M_QUALIFICATION', 'OR_M_CATEGORY'],
      readWriteTables: [],
    });

    const getCurrentUser = this.createApiFunction({
      apiId: 'API-10',
      id: 'GetCurrentUserFunction',
      entry: 'get-current-user',
      readTables: [],
      // 初回アクセス時のレコード作成と lastLoginAt 更新を行うため書き込みも必要
      readWriteTables: ['OR_M_USER'],
    });

    // ------------------------------------------------------------------
    // 実装済みAPI（T2-3 問題閲覧・出題系）
    // ------------------------------------------------------------------
    const listQuestions = this.createApiFunction({
      apiId: 'API-03',
      id: 'ListQuestionsFunction',
      entry: 'list-questions',
      readTables: ['OR_M_QUESTION', 'OR_M_CHOICE'],
      readWriteTables: [],
    });

    const generateRandomQuestions = this.createApiFunction({
      apiId: 'API-04',
      id: 'GenerateRandomQuestionsFunction',
      entry: 'generate-random-questions',
      readTables: ['OR_M_QUESTION', 'OR_M_CHOICE'],
      readWriteTables: [],
    });

    // ------------------------------------------------------------------
    // 実装済みAPI（T2-4 セッション・採点系）
    // ------------------------------------------------------------------
    const createSession = this.createApiFunction({
      apiId: 'API-07',
      id: 'CreateSessionFunction',
      entry: 'create-session',
      readTables: [],
      readWriteTables: ['OR_T_EXAM_SESSION'],
    });

    const updateSession = this.createApiFunction({
      apiId: 'API-08',
      id: 'UpdateSessionFunction',
      entry: 'update-session',
      // 採点のため選択肢、解説の返却のため問題の読み取りが必要。
      // 正解集合は必ずサーバー側で算出する
      readTables: ['OR_M_QUESTION', 'OR_M_CHOICE'],
      readWriteTables: ['OR_T_EXAM_SESSION', 'OR_T_ANSWER_HISTORY'],
    });

    const getSession = this.createApiFunction({
      apiId: 'API-09',
      id: 'GetSessionFunction',
      entry: 'get-session',
      // S-09 の問題別詳細表示のため、問題本体と選択肢の読み取りが必要
      readTables: ['OR_T_EXAM_SESSION', 'OR_T_ANSWER_HISTORY', 'OR_M_QUESTION', 'OR_M_CHOICE'],
      readWriteTables: [],
    });

    // ------------------------------------------------------------------
    // ルート登録（API一覧 の API-01〜API-04, API-07〜API-10）
    // ------------------------------------------------------------------
    // API-01 GET /qualifications
    const qualifications = this.restApi.root.addResource('qualifications');
    qualifications.addMethod(
      'GET',
      new apigateway.LambdaIntegration(listQualifications),
      methodOptions,
    );

    // API-02 GET /categories
    const categories = this.restApi.root.addResource('categories');
    categories.addMethod('GET', new apigateway.LambdaIntegration(listCategories), methodOptions);

    // API-03 GET /questions
    const questions = this.restApi.root.addResource('questions');
    questions.addMethod('GET', new apigateway.LambdaIntegration(listQuestions), methodOptions);

    // API-04 POST /questions/random
    const questionsRandom = questions.addResource('random');
    questionsRandom.addMethod(
      'POST',
      new apigateway.LambdaIntegration(generateRandomQuestions),
      methodOptions,
    );

    // API-07 POST /sessions
    const sessions = this.restApi.root.addResource('sessions');
    sessions.addMethod('POST', new apigateway.LambdaIntegration(createSession), methodOptions);

    // API-08 PUT /sessions/{sessionId}, API-09 GET /sessions/{sessionId}
    const sessionById = sessions.addResource('{sessionId}');
    sessionById.addMethod('GET', new apigateway.LambdaIntegration(getSession), methodOptions);
    sessionById.addMethod('PUT', new apigateway.LambdaIntegration(updateSession), methodOptions);

    // API-10 GET /users/me
    const users = this.restApi.root.addResource('users');
    const usersMe = users.addResource('me');
    usersMe.addMethod('GET', new apigateway.LambdaIntegration(getCurrentUser), methodOptions);

    // Phase3対象の /questions/import・/questions/generate はここでは登録しない。

    new CfnOutput(this, 'ApiEndpoint', {
      value: this.restApi.url,
      description: `API Gateway ベースURL (${config.envName})`,
      exportName: `OracleMasterApp-${config.envName}-ApiEndpoint`,
    });
  }

  /** 全Lambda共通の環境変数（12_backend/README.md 参照） */
  private commonEnvironment(): Record<string, string> {
    return {
      ENV_NAME: this.config.envName,
      // テーブル名は `{環境プレフィックス}-OR_...`（命名規約 §2.1）
      TABLE_NAME_PREFIX: this.config.envName,
      ALLOWED_ORIGINS: this.config.allowedOrigins.join(','),
      // DEBUG は本番では出力しない（ログ・監視設計 §1.1）
      LOG_LEVEL: this.config.envName === 'prod' ? 'INFO' : 'DEBUG',
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
    };
  }

  /** 12_backend のハンドラをバンドルしてLambda関数を作成し、必要な権限を付与する */
  private createApiFunction(definition: ApiDefinition): lambda.Function {
    const logGroup = new logs.LogGroup(this, `${definition.id}LogGroup`, {
      logGroupName: `/aws/lambda/oracle-master-app-${this.config.envName}-${definition.entry}`,
      retention: this.config.logRetention,
      removalPolicy: this.config.removalPolicy,
    });

    const assetPath = path.join(BACKEND_DIST, definition.entry);
    if (!existsSync(assetPath)) {
      throw new Error(
        `${definition.apiId} のビルド成果物が見つかりません: ${assetPath}
` + '12_backend で  を実行してください（13_infra の npm スクリプト経由なら自動実行されます）。',
      );
    }

    const fn = new lambda.Function(this, definition.id, {
      functionName: `oracle-master-app-${this.config.envName}-${definition.entry}`,
      description: `${definition.apiId} (${definition.entry})`,
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromAsset(assetPath),
      handler: 'index.handler',
      // 通常APIのタイムアウト（エラーハンドリング方針 §5）
      timeout: Duration.seconds(10),
      memorySize: 256,
      logGroup,
      environment: this.commonEnvironment(),
    });

    // 最小権限: そのAPIが実際に触るテーブルにのみ権限を与える（要件定義書 §9.4）
    for (const name of definition.readTables) {
      this.requireTable(name).grantReadData(fn);
    }
    for (const name of definition.readWriteTables) {
      this.requireTable(name).grantReadWriteData(fn);
    }

    return fn;
  }

  private requireTable(logicalName: string): dynamodb.ITableV2 {
    const table = this.tables[logicalName];
    if (!table) {
      throw new Error(`テーブル ${logicalName} が DataStack から渡されていません`);
    }
    return table;
  }
}
