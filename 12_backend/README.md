# 12_backend — Lambda バックエンド (Node.js 22.x / TypeScript)

Oracle Master 資格問題アプリの API 実装。基本設計書 [API設計](../01_docs/02_sd/02_API設計/) に対応する。

対応タスク: [開発タスク一覧](../01_docs/03_dev/開発タスク一覧.md) Step 2（T2-1〜T2-6）

## 構成

```
src/
  common/      共通レイヤー（T2-1）
  handlers/    APIごとのLambdaハンドラ
  models/      DynamoDBアイテムの型定義
  services/    複数ハンドラで共有する処理
tests/
  common/      共通レイヤーの単体テスト
```

## 実装済みハンドラ（`src/handlers`）

| ファイル | API | エンドポイント |
|---|---|---|
| `list-qualifications.ts` | API-01 | `GET /qualifications` |
| `list-categories.ts` | API-02 | `GET /categories` |
| `get-current-user.ts` | API-10 | `GET /users/me` |
| `list-questions.ts` | API-03 | `GET /questions` |
| `generate-random-questions.ts` | API-04 | `POST /questions/random` |
| `create-session.ts` | API-07 | `POST /sessions` |
| `update-session.ts` | API-08 | `PUT /sessions/{sessionId}` |
| `get-session.ts` | API-09 | `GET /sessions/{sessionId}` |

## 共通レイヤー（`src/common`）

| モジュール | 役割 | 対応設計書 |
|---|---|---|
| `config.ts` | テーブル名・GSI名の解決、環境変数の読み取り | 命名規約 §2 |
| `errors.ts` | 業務エラー（`AppError` 系）とエラーコードの定義 | API共通設計 §5, §6 |
| `handler.ts` | 全ハンドラ共通のエラーハンドリング・ロギングのラッパー | エラーハンドリング方針 §2.2 |
| `response.ts` | 成功/エラーレスポンスの組み立て、CORSヘッダ付与 | API共通設計 §4, §9 |
| `auth.ts` | Cognitoクレーム取得、リソース所有者チェック | 認証・認可設計 §2.2, §3 |
| `audit.ts` | 共通項目（登録日/登録者/更新日/更新者）の付与・除去 | テーブル一覧 §共通項目 |
| `dynamodb.ts` | DocumentClient ラッパー（get / query / scan / update / トランザクション） | テーブル一覧 |
| `pagination.ts` | `nextToken` の変換、`limit` の検証 | API共通設計 §7 |
| `logger.ts` | 構造化ログ出力と個人情報のマスキング | ログ・監視設計 §1 |

### ハンドラの実装パターン

```typescript
import { getAuthContext, ok, requestOrigin, withErrorHandling } from '../common';

export const handler = withErrorHandling('API-01', async (event) => {
  const auth = getAuthContext(event);
  // ... 業務ロジック
  return ok({ items: [] }, requestOrigin(event));
});
```

`withErrorHandling` が想定内エラー（`AppError`）を適切なHTTPステータスに、想定外の例外を 500 に変換する。ハンドラ側で try/catch を書く必要はない。

## 設計上の約束

- **共通項目の登録者・更新者はクライアント指定値を使わない。** 認証済みAPIでは Cognito の `sub`、システム起因の書き込みでは `SYSTEM_ACTOR` を設定する
- **共通項目はAPIレスポンスに含めない。** `stripAuditFields` で除去する（`GET /users/me` の `createdAt` のみ `keep` に指定して残す）
- **ログにメールアドレス・表示名を出力しない。** `logger` が自動的にマスクするが、マスク対象キーは小文字で定義すること
- **採点は必ずサーバー側で行う。** 正解集合は `OR_M_CHOICE` から算出し、選択集合との**完全一致のみ正解**とする（要件定義書 F-04、部分点なし）。判定ロジックは `services/scoring-service.ts` に集約している
- **CORSヘッダは Lambda 側でも付与する。** API Gateway が処理するのはプリフライト（OPTIONS）のみで、実リクエストのレスポンスには `requestOrigin(event)` を渡す必要がある

## 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `TABLE_NAME_PREFIX` | 必須 | DynamoDBテーブル名の環境プレフィックス（`dev` / `stg` / `prod`） |
| `ALLOWED_ORIGINS` | 必須 | CORSで許可するオリジンのカンマ区切り。ワイルドカード不可 |
| `ENV_NAME` | 任意 | 環境名。既定 `dev` |
| `LOG_LEVEL` | 任意 | `ERROR` / `WARN` / `INFO` / `DEBUG`。既定 `INFO`。`DEBUG` は開発環境のみ |

## コマンド

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

Lambda デプロイパッケージのビルド。`src/handlers/*.ts` を `dist/<名前>/index.js` にバンドルする。
13_infra の npm スクリプト（`synth:dev` / `deploy:dev` 等）から自動実行されるため、通常は個別に叩く必要はない。

```bash
npm run build:lambda
```

CDK の `NodejsFunction` を使わず事前ビルド方式にしているのは、`NodejsFunction` がローカルバンドリングに失敗すると Docker へフォールバックし、Docker 未導入の環境でデプロイできなくなるため。
