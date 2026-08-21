# API-07 試験セッション開始

| 項目 | 内容 |
|---|---|
| メソッド / パス | `POST /sessions` |
| Phase | Phase 1 |
| 認証 | 必要（Cognito） |
| 利用画面 | S-05（出題設定） |
| 関連テーブル | OR_T_EXAM_SESSION |

## 1. 概要

出題設定画面（S-05）で「出題開始」が押下された際に、新規の試験セッションを作成する。

## 2. リクエスト

### ボディ

```json
{
  "qualificationId": "1Z0-085-JPN",
  "totalQuestions": 20,
  "timeLimitMin": 30
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `qualificationId` | String | 必須 | |
| `totalQuestions` | Number | 必須 | [API-04](API-04_ランダム出題リスト生成.md) の `actualCount`（実際の出題数）を設定する |
| `timeLimitMin` | Number | 任意 | 未設定時は `0`（無制限）として保存 |

## 3. レスポンス

### 201 Created

```json
{
  "sessionId": "s-uuid-1",
  "userId": "cognito-sub-xxxx",
  "qualificationId": "1Z0-085-JPN",
  "totalQuestions": 20,
  "timeLimitMin": 30,
  "status": "in_progress",
  "startedAt": "2026-07-18T10:00:00.000Z"
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `sessionId` | String | 発行されたセッションID |
| `userId` | String | 呼び出しユーザーの Cognito sub（トークンから取得。リクエストボディには含めない） |
| `status` | String | 作成直後は常に `in_progress` |
| `startedAt` | String | セッション開始日時（ISO 8601） |

## 4. 処理フロー

1. `qualificationId` / `totalQuestions` の必須チェック。
2. Cognito トークンの `sub` を `userId` として使用する（クライアント指定は無視する。要件定義書 §9.1「ユーザーは自分のデータのみアクセス可能」）。
3. `OR_T_EXAM_SESSION` に新規レコードを作成（`sessionId` はUUID採番、`status=in_progress`、`correctCount=0`、`elapsedSec=0`、`startedAt`=現在時刻）。共通項目 `createdAt`/`updatedAt`=現在時刻、`createdBy`/`updatedBy`=トークンの `sub` を設定する（[テーブル一覧](../../03_データベース設計/テーブル一覧.md) §共通項目）。
4. 作成結果を返却する（共通項目はレスポンスに含めない）。

## 5. エラー

| ステータス | コード | 条件 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `qualificationId`/`totalQuestions` 未指定、範囲外 |
| 401 | `UNAUTHORIZED` | トークン無効 |
| 500 | `INTERNAL_ERROR` | DynamoDB 書き込み失敗 |

## 6. 備考

- 本APIは出題リスト自体は返さない（出題リストは [API-04](API-04_ランダム出題リスト生成.md) で別途取得済みのものをクライアントが保持する）。クライアントは API-04 のレスポンスと本APIの `sessionId` を突き合わせて、S-06 以降の回答送信（[API-08](API-08_セッション更新.md)）に利用する。
