import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

export interface AuthStackProps extends StackProps {
  readonly config: EnvironmentConfig;
}

/**
 * 認証基盤（Amazon Cognito）スタック。
 *
 * 対応タスク: T1-2
 * 対応設計書: 01_docs/02_sd/04_共通設計/認証・認可設計.md
 *
 * User Pool は環境ごとに別プールとする（システム構成・環境設計 §3）。
 */
export class AuthStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { config } = props;

    // ------------------------------------------------------------------
    // User Pool（認証・認可設計 §1, §4）
    // ------------------------------------------------------------------
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `oracle-master-app-${config.envName}`,
      selfSignUpEnabled: true,
      // メールアドレス＋パスワード認証（F-01）
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        // S-02 で入力する「表示名」。GET /users/me が OR_M_USER を自動作成する際に
        // `name` クレームから displayName を取得する（API-10 処理フロー）。
        fullname: { required: false, mutable: true },
      },
      // 8文字以上、英大文字・英小文字・数字を含む（認証・認可設計 §4）
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailSubject: 'Oracle Master 資格問題アプリ 確認コード',
        emailBody: '確認コードは {####} です。アプリの画面に入力してください。',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      removalPolicy: config.removalPolicy,
    });

    // ------------------------------------------------------------------
    // User Pool Client（React SPA。クライアントシークレットは持たせない）
    // ------------------------------------------------------------------
    this.userPoolClient = this.userPool.addClient('SpaClient', {
      userPoolClientName: `oracle-master-app-spa-${config.envName}`,
      generateSecret: false,
      authFlows: { userSrp: true },
      // 認証・認可設計 §1 のトークン有効期限
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      // ユーザーの存在有無を推測されないようにする
      preventUserExistenceErrors: true,
    });

    // ------------------------------------------------------------------
    // 疎通確認（CLI）用クライアント — dev環境限定
    //
    // SPAクライアントは SRP 認証のみを許可しているため、AWS CLI から直接
    // IDトークンを取得できない。開発時の疎通確認（T1-7, T2-6）のために、
    // dev環境に限りパスワード直接認証を許可したクライアントを別途用意する。
    // stg/prod には作成しない。
    // ------------------------------------------------------------------
    if (config.envName === 'dev') {
      const cliTestClient = this.userPool.addClient('CliTestClient', {
        userPoolClientName: `oracle-master-app-cli-test-${config.envName}`,
        generateSecret: false,
        authFlows: { userPassword: true, adminUserPassword: true },
        idTokenValidity: Duration.hours(1),
        accessTokenValidity: Duration.hours(1),
        refreshTokenValidity: Duration.days(1),
        preventUserExistenceErrors: true,
      });

      new CfnOutput(this, 'CliTestClientId', {
        value: cliTestClient.userPoolClientId,
        description: '疎通確認（CLI）用のUser Pool Client ID。dev環境限定・アプリからは使用しない',
      });
    }

    // ------------------------------------------------------------------
    // Identity Pool（要件定義書 §5.2）
    //
    // Phase1 の API 呼び出しは API Gateway の Cognito User Pool Authorizer による
    // IDトークン検証のみで完結するため、認証済みロールには権限を付与しない
    // （要件定義書 §9.4 最小権限方針）。将来 S3 への直接アクセス等が必要になった
    // 時点で、このロールに必要最小限の権限を追加する。
    // ------------------------------------------------------------------
    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `oracle_master_app_${config.envName}`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
          serverSideTokenCheck: true,
        },
      ],
    });

    const authenticatedRole = new iam.Role(this, 'AuthenticatedRole', {
      roleName: `oracle-master-app-${config.envName}-cognito-authenticated`,
      // CloudFormation の Description は ASCII/Latin-1 のみ許容されるため英語で記述する
      description: 'Authenticated role for Cognito Identity Pool (no extra permissions in Phase 1)',
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: { 'cognito-identity.amazonaws.com:aud': this.identityPool.ref },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });

    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: { authenticated: authenticatedRole.roleArn },
    });

    // ------------------------------------------------------------------
    // フロントエンド（11_frontend）の設定値として払い出す
    // ------------------------------------------------------------------
    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `OracleMasterApp-${config.envName}-UserPoolId`,
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID（React SPA用）',
      exportName: `OracleMasterApp-${config.envName}-UserPoolClientId`,
    });

    new CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: `OracleMasterApp-${config.envName}-IdentityPoolId`,
    });
  }
}
