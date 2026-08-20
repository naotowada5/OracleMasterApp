import * as path from 'node:path';
import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface ApiStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly userPool: cognito.IUserPool;
}

/**
 * API Gateway（REST）スタック。
 *
 * 対応タスク: T1-5
 * 対応設計書: 01_docs/02_sd/02_API設計/API共通設計.md, API一覧.md
 *
 * Phase1対象の8エンドポイントを、全て Cognito オーソライザー付きで登録する。
 * 統合先は現時点ではダミーLambda（M1疎通確認用）であり、Step 2 で各API実装に差し替える。
 * Phase3対象の /questions/import・/questions/generate はルート登録自体を行わない（API一覧）。
 */
export class ApiStack extends Stack {
  public readonly restApi: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config, userPool } = props;

    // ------------------------------------------------------------------
    // ダミーLambda（Step 2 で各APIの実装に差し替える）
    // ------------------------------------------------------------------
    const placeholderLogGroup = new logs.LogGroup(this, 'PlaceholderFunctionLogGroup', {
      logGroupName: `/aws/lambda/oracle-master-app-${config.envName}-placeholder`,
      retention: config.logRetention,
      removalPolicy: config.removalPolicy,
    });

    const placeholderFunction = new lambda.Function(this, 'PlaceholderFunction', {
      functionName: `oracle-master-app-${config.envName}-placeholder`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'placeholder')),
      // 通常APIのタイムアウト（エラーハンドリング方針 §5）
      timeout: Duration.seconds(10),
      memorySize: 256,
      logGroup: placeholderLogGroup,
      environment: {
        ENV_NAME: config.envName,
      },
    });

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

    const integration = new apigateway.LambdaIntegration(placeholderFunction);
    const methodOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // ------------------------------------------------------------------
    // Phase1対象ルート（API一覧 の API-01〜API-04, API-07〜API-10）
    // ------------------------------------------------------------------
    // API-01 GET /qualifications
    const qualifications = this.restApi.root.addResource('qualifications');
    qualifications.addMethod('GET', integration, methodOptions);

    // API-02 GET /categories
    const categories = this.restApi.root.addResource('categories');
    categories.addMethod('GET', integration, methodOptions);

    // API-03 GET /questions
    const questions = this.restApi.root.addResource('questions');
    questions.addMethod('GET', integration, methodOptions);

    // API-04 POST /questions/random
    const questionsRandom = questions.addResource('random');
    questionsRandom.addMethod('POST', integration, methodOptions);

    // API-07 POST /sessions
    const sessions = this.restApi.root.addResource('sessions');
    sessions.addMethod('POST', integration, methodOptions);

    // API-08 PUT /sessions/{sessionId} / API-09 GET /sessions/{sessionId}
    const sessionById = sessions.addResource('{sessionId}');
    sessionById.addMethod('GET', integration, methodOptions);
    sessionById.addMethod('PUT', integration, methodOptions);

    // API-10 GET /users/me
    const users = this.restApi.root.addResource('users');
    const usersMe = users.addResource('me');
    usersMe.addMethod('GET', integration, methodOptions);

    // Phase3対象の /questions/import・/questions/generate はここでは登録しない。

    new CfnOutput(this, 'ApiEndpoint', {
      value: this.restApi.url,
      description: `API Gateway ベースURL (${config.envName})`,
      exportName: `OracleMasterApp-${config.envName}-ApiEndpoint`,
    });
  }
}
