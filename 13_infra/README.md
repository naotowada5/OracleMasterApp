# 13_infra — AWS CDK (TypeScript)

Oracle Master 資格問題アプリの AWS インフラ定義。基本設計書 [システム構成・環境設計](../01_docs/02_sd/04_共通設計/システム構成・環境設計.md) に対応する。

対応タスク: [開発タスク一覧](../01_docs/03_dev/開発タスク一覧.md) Step 1（T1-1〜T1-7）

## スタック構成

環境（dev / stg / prod）ごとに以下4スタックを作成する。スタック名は `OracleMasterApp-{env}-{種別}`。

| スタック | 内容 | タスク |
|---|---|---|
| `-Auth` | Cognito User Pool / User Pool Client / Identity Pool | T1-2 |
| `-Data` | DynamoDB 7テーブル、S3バケット | T1-3, T1-4 |
| `-Api` | API Gateway (REST) + Cognito Authorizer + 各APIのLambda | T1-5, T2-2〜T2-4 |
| `-Monitoring` | CloudWatch ダッシュボード / アラーム、SNSトピック | T1-6 |

## バックエンドとの関係

`-Api` スタックの Lambda は `12_backend` のビルド成果物（`12_backend/dist/<ハンドラ名>/`）を参照する。本ディレクトリの npm スクリプト（`synth:dev` / `diff:dev` / `deploy:dev` 等）は実行前に `12_backend` のビルドを自動で行う。

`cdk` コマンドを直接叩く場合は、先に `12_backend` で `npm run build:lambda` を実行すること（未ビルドの場合は synth 時にその旨のエラーになる）。

未実装のAPIはダミーLambdaに接続してある。実装が済んだものから `lib/stacks/api-stack.ts` の `createApiFunction` 定義を追加して差し替える。

## 前提

- Node.js（[.nvmrc](../.nvmrc) 参照）
- AWS 認証情報が設定済みであること（`aws sts get-caller-identity` で確認）
- 対象アカウント・リージョンで CDK ブートストラップ済みであること

```bash
npx cdk bootstrap aws://<アカウントID>/<リージョン>
```

## コンテキストパラメータ

| キー | 必須 | 説明 |
|---|---|---|
| `env` | 必須（既定 `dev`） | 対象環境。`dev` / `stg` / `prod` |
| `frontendOrigin` | stg/prod は必須 | CORS で許可するフロントエンドのオリジン。ワイルドカードは使用しない（[API共通設計](../01_docs/02_sd/02_API設計/API共通設計.md) §9）。dev は `http://localhost:5173` を既定で許可 |
| `alarmEmail` | 任意 | アラート通知先メールアドレス。未指定時は SNS トピックのみ作成（購読者なし） |

## コマンド

```bash
npm install
```

```bash
npm run synth:dev
```

```bash
npm run diff:dev
```

dev 環境へデプロイする（実際に AWS リソースが作成され、課金が発生する）:

```bash
npm run deploy:dev -- -c alarmEmail=<通知先メールアドレス>
```

stg / prod は CORS 許可オリジンの指定が必須:

```bash
npx cdk deploy -c env=prod -c frontendOrigin=https://<Amplifyのドメイン> --all
```

## デプロイ後の確認（T1-7 / マイルストーンM1）

各コマンドの意味・期待される応答・トラブルシューティングまでを [docs/疎通確認手順.md](docs/疎通確認手順.md) に手順化してある。デプロイ後はそちらを上から実行する。

## デプロイ済み環境（dev）

| 項目 | 値 |
|---|---|
| AWSアカウント / リージョン | 006256605452 / ap-northeast-1 |
| APIベースURL | `https://f30rfsp6k5.execute-api.ap-northeast-1.amazonaws.com/dev` |
| Cognito User Pool ID | `ap-northeast-1_vg29EuQ3B` |
| User Pool Client ID（SPA用） | `4je2ja87o50r8kd6voi817eeec` |
| Identity Pool ID | `ap-northeast-1:7817641c-c12f-40a2-be7c-f53a3647e475` |
| アラート用SNSトピック | `arn:aws:sns:ap-northeast-1:006256605452:oracle-master-app-dev-alarm` |

いずれもフロントエンド（`11_frontend`）の設定値として利用する公開値であり、秘匿情報ではない。最新値は常にスタック出力から取得できる。

```bash
aws cloudformation describe-stacks --stack-name OracleMasterApp-dev-Auth --query "Stacks[0].Outputs" --output table
```

## 設計上の補足

- **DynamoDB テーブル名**は `{env}-OR_{種類}_{名称}`（[命名規約](../01_docs/02_sd/04_共通設計/命名規約.md) §2）。テーブル定義はキー属性と GSI のみを持ち、共通項目（`createdAt` / `createdBy` / `updatedAt` / `updatedBy`）を含む非キー属性はスキーマレスのためテンプレートには現れない。
- **CORS プリフライト（OPTIONS）**は認可なし（`AuthorizationType: NONE`）で登録される。ブラウザはプリフライトに `Authorization` ヘッダを付与しないための仕様上の必須事項であり、統合は CORS ヘッダのみを返す Mock 統合でデータアクセスは発生しない。業務メソッド（GET/POST/PUT）はすべて `COGNITO_USER_POOLS`。
- **API Gateway のアクセスログ**を有効化するため、CDK がアカウント単位の CloudWatch ロール（`AWS::ApiGateway::Account`）を作成する（`@aws-cdk/aws-apigateway:disableCloudWatchRole: false`）。この設定はリージョン内のアカウント全体に影響する。
- **Phase3 のエンドポイント**（`/questions/import`, `/questions/generate`）はルート登録しない（[API一覧](../01_docs/02_sd/02_API設計/API一覧.md)）。
- **Identity Pool** の認証済みロールには Phase1 では権限を付与しない。API 呼び出しは User Pool の ID トークンのみで完結する。
