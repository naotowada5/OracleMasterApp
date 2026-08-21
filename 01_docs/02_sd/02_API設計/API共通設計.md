# API共通設計

全 API に共通するインターフェース仕様を定義する。個別API設計書では、本書との差分・固有仕様のみを記載する。

## 1. ベースURL・ステージ

| 環境 | ベースURL（例） | 備考 |
|---|---|---|
| dev | `https://{api-id}.execute-api.{region}.amazonaws.com/dev` | 開発用（要件定義書 §10.3） |
| stg | `https://{api-id}.execute-api.{region}.amazonaws.com/stg` | 結合・受入テスト用 |
| prod | `https://{api-id}.execute-api.{region}.amazonaws.com/prod` | 本番 |

実際のカスタムドメイン（例: `api.oracle-master-app.example.com`）を利用する場合は、AWS CDK スタックのアウトプットとして払い出す。

## 2. 認証

- 全エンドポイントに Amazon Cognito オーソライザー（API Gateway Cognito User Pool Authorizer）を適用する（要件定義書 §7.1、資格・カテゴリ一覧取得のような参照系APIも例外なし）。
- リクエストヘッダに Cognito が発行した ID トークン（JWT）を付与する。

```
Authorization: Bearer {IDトークン}
```

- トークン検証は API Gateway のオーソライザーで行い、Lambda 到達前に 401 を返す。
- Lambda 内では、Cognito クレームの `sub`（ユーザーID）を用いて、リクエスト対象データがそのユーザー自身のものであるかを検証する（例: `OR_T_EXAM_SESSION.userId` が呼び出しユーザーの `sub` と一致するか。要件定義書 §9.1）。
- 詳細は [認証・認可設計](../04_共通設計/認証・認可設計.md) を参照。

## 3. 共通リクエストヘッダ

| ヘッダ | 必須 | 説明 |
|---|---|---|
| `Authorization` | 必須 | `Bearer {IDトークン}` |
| `Content-Type` | POST/PUT時必須 | `application/json` |
| `Accept-Language` | 任意 | Phase1は日本語固定のため未使用 |

## 4. 共通レスポンス形式

### 4.1 成功時

HTTP ステータス 200 系。レスポンスボディは各APIごとの JSON オブジェクトを直接返す（共通エンベロープでラップしない）。

一覧系APIのページング情報は以下の形式で返却する。

```json
{
  "items": [ /* ... */ ],
  "nextToken": "opaque-pagination-token-or-null"
}
```

### 4.2 エラー時

全APIで共通のエラーレスポンス形式を用いる。

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "出題数は1〜100の範囲で入力してください",
    "details": [
      { "field": "questionCount", "reason": "out_of_range" }
    ]
  }
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `error.code` | String | エラー種別コード（§6 参照） |
| `error.message` | String | ユーザー/開発者向けメッセージ（日本語） |
| `error.details` | Array（任意） | フィールド単位のバリデーションエラー等 |

詳細は [エラーハンドリング方針](../04_共通設計/エラーハンドリング方針.md) を参照。

## 5. 共通HTTPステータスコード

| ステータス | 意味 | 発生条件 |
|---|---|---|
| 200 | OK | 正常応答（GET/PUT） |
| 201 | Created | リソース新規作成（POST /sessions 等） |
| 400 | Bad Request | リクエストパラメータ不正、バリデーションエラー |
| 401 | Unauthorized | Cognito トークン未指定・無効・期限切れ |
| 403 | Forbidden | 他ユーザーのリソースへのアクセス試行 |
| 404 | Not Found | 指定したリソースIDが存在しない |
| 409 | Conflict | 状態不整合（例: 完了済みセッションへの回答送信） |
| 429 | Too Many Requests | API Gateway スロットリング |
| 500 | Internal Server Error | Lambda内の予期しない例外 |
| 503 | Service Unavailable | 依存サービス（DynamoDB, Claude API等）の一時的な障害 |

## 6. 共通エラーコード一覧

| コード | 説明 | 対応するHTTPステータス |
|---|---|---|
| `VALIDATION_ERROR` | リクエストパラメータのバリデーションエラー | 400 |
| `UNAUTHORIZED` | 未認証・トークン無効 | 401 |
| `FORBIDDEN` | 他ユーザーリソースへのアクセス | 403 |
| `NOT_FOUND` | リソースが存在しない | 404 |
| `CONFLICT` | 状態不整合 | 409 |
| `INTERNAL_ERROR` | サーバー内部エラー | 500 |
| `EXTERNAL_SERVICE_ERROR` | DynamoDB/Claude API等の外部依存エラー | 503 |

## 7. ページング方式

一覧取得系（`GET /questions` 等）は DynamoDB の `LastEvaluatedKey` を Base64 エンコードした `nextToken` によるカーソルベースページングとする。

| パラメータ | 説明 |
|---|---|
| `limit` | 1ページあたりの最大件数（既定値20、最大100） |
| `nextToken` | 前回レスポンスの `nextToken` を指定して次ページを取得。初回は省略 |

## 8. 日時・数値フォーマット

- 日時: ISO 8601（`YYYY-MM-DDTHH:mm:ss.sssZ`, UTC）
- ID: UUID v4文字列（`qualificationId` のみ要件定義書に基づき資格コード文字列 例:`1Z0-085-JPN`）

### 8.1 共通項目（監査項目）の取り扱い

全DynamoDBテーブルは共通項目 `createdAt`（登録日）/ `createdBy`（登録者）/ `updatedAt`（更新日）/ `updatedBy`（更新者）を保持する（[テーブル一覧](../03_データベース設計/テーブル一覧.md) §共通項目）。APIとしては以下を共通ルールとする。

- 共通項目は監査用の内部項目とし、**原則としてAPIレスポンスには含めない**（例外: [API-10](個別API設計書/API-10_ユーザー情報取得.md) の `createdAt`）。
- `createdBy` / `updatedBy` はクライアントからのリクエストで指定させず、必ずCognitoトークンの `sub` をLambda側で設定する（[認証・認可設計](../04_共通設計/認証・認可設計.md) §3）。
- 更新系APIは `updatedAt` / `updatedBy` を必ず更新し、`createdAt` / `createdBy` は上書きしない。

## 9. CORS

Amplify でホスティングするフロントエンドのオリジンのみ許可する（`Access-Control-Allow-Origin` を環境ごとのフロントエンドURLに限定。ワイルドカード `*` は使用しない）。

## 10. スロットリング・レート制御

- API Gateway のステージ単位でスロットリング（バーストリミット・レートリミット）を設定し、想定同時接続100ユーザー（要件定義書 §8.1）に対して十分な余裕を持たせる。
- 具体的な閾値は AWS CDK（`13_infra`）のインフラ設計で定義する。
