# T-05 Users（ユーザーテーブル）

| 項目 | 内容 |
|---|---|
| テーブル名 | Users |
| 概要 | アプリ内で保持する最小限のユーザー情報。認証情報自体は Amazon Cognito が管理する |
| Phase | Phase 1 |
| プライマリキー | `userId`（パーティションキーのみ） |
| GSI | `email-index`（PK: email） |

## 1. 属性定義

| 属性名 | 型 | キー | 必須 | 説明 |
|---|---|---|---|---|
| userId | String | PK | 必須 | Amazon Cognito の `sub`（UUID形式）。Cognitoと1:1で対応 |
| email | String | GSI PK | 必須 | メールアドレス（Cognitoのユーザー名と同一値を保持） |
| displayName | String | | 必須 | 表示名（S-03等で表示） |
| createdAt | String | | 必須 | 初回登録日時（ISO 8601） |
| lastLoginAt | String | | 必須 | 最終ログイン日時（[API-10](../../02_API設計/個別API設計書/API-10_ユーザー情報取得.md) 呼び出しの都度更新） |

## 2. GSI定義

| GSI名 | パーティションキー | 用途 |
|---|---|---|
| email-index | email | メールアドレスによるユーザー検索（現状Phase1 APIからは未使用。運用調査・将来機能向け） |

## 3. サンプルアイテム

```json
{
  "userId": "5f1e2d3c-cognito-sub",
  "email": "user@example.com",
  "displayName": "テストユーザー",
  "createdAt": "2026-06-01T00:00:00.000Z",
  "lastLoginAt": "2026-07-18T09:59:00.000Z"
}
```

## 4. 利用API

- [API-10 ユーザー情報取得](../../02_API設計/個別API設計書/API-10_ユーザー情報取得.md)（取得・初回作成・`lastLoginAt`更新）

## 5. 個人情報の取り扱い（要件定義書 §9.3 準拠）

- パスワード等の認証情報は本テーブルには一切保持せず、Amazon Cognito のみで管理する。
- 保持する個人情報は `email` と `displayName` のみに限定する（最小限の情報のみ保持）。

## 6. 備考

- `userId` は Cognito Post Confirmation Lambda トリガー、または初回 `GET /users/me` 呼び出し時にレコード作成される（[API-10](../../02_API設計/個別API設計書/API-10_ユーザー情報取得.md) 処理フロー参照）。
