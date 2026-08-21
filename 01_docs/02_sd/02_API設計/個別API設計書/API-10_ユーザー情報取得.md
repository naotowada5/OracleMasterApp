# API-10 ユーザー情報取得

| 項目 | 内容 |
|---|---|
| メソッド / パス | `GET /users/me` |
| Phase | Phase 1 |
| 認証 | 必要（Cognito） |
| 利用画面 | S-03（メイン画面） |
| 関連テーブル | OR_M_USER |

## 1. 概要

ログイン中ユーザー自身の情報（表示名等）を取得する。Cognito トークンの `sub` を用いて自分自身のレコードのみ取得する。

## 2. リクエスト

パラメータなし（トークンから `sub` を取得）。

## 3. レスポンス

### 200 OK

```json
{
  "userId": "cognito-sub-xxxx",
  "email": "user@example.com",
  "displayName": "テストユーザー",
  "createdAt": "2026-06-01T00:00:00.000Z",
  "lastLoginAt": "2026-07-18T09:59:00.000Z"
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `userId` | String | Cognito sub |
| `email` | String | メールアドレス（Cognito から取得、OR_M_USERテーブルにも保持） |
| `displayName` | String | 表示名 |
| `createdAt` | String | 初回登録日時（共通項目のうち本項目のみレスポンスに含める） |
| `lastLoginAt` | String | 最終ログイン日時（本APIの呼び出し時に更新する） |

## 4. 処理フロー

1. Cognito トークンの `sub` を `userId` として使用。
2. `OR_M_USER` テーブルから `userId` をキーに取得。
3. レコードが存在しない場合（初回アクセス時）は、Cognito のクレーム（`email` 等）を用いて `OR_M_USER` レコードを新規作成する（初回ログイン時の自動プロビジョニング。またはCognito Post Confirmation Lambdaトリガーで事前作成されている前提でも良いが、本APIは存在しない場合のフォールバック作成も担う）。この際、共通項目 `createdAt`/`updatedAt`=現在時刻、`createdBy`/`updatedBy`=トークンの `sub` を設定する（Post Confirmation Lambda で作成される場合の `createdBy` は `SYSTEM`。[テーブル一覧](../../03_データベース設計/テーブル一覧.md) §共通項目）。
4. `lastLoginAt` を現在時刻に更新する。あわせて共通項目 `updatedAt`=現在時刻、`updatedBy`=トークンの `sub` を更新して返却する。

## 5. エラー

| ステータス | コード | 条件 |
|---|---|---|
| 401 | `UNAUTHORIZED` | トークン無効 |
| 500 | `INTERNAL_ERROR` | DynamoDB 読み書き失敗 |

## 6. 備考

- 本APIは自分自身の情報のみを対象とし、他ユーザーの `userId` を指定する経路は存在しない（要件定義書 §9.1）。
- Phase3（F-10）で進捗履歴を追加する場合も、本APIまたは派生API（例: `GET /users/me/progress`）で対応する想定。
