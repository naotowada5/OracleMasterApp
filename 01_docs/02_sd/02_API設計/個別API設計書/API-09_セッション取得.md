# API-09 セッション取得

| 項目 | 内容 |
|---|---|
| メソッド / パス | `GET /sessions/{sessionId}` |
| Phase | Phase 1 |
| 認証 | 必要（Cognito） |
| 利用画面 | S-09（解答結果） |
| 関連テーブル | ExamSessions, AnswerHistories |

## 1. 概要

指定したセッションのサマリ情報（総問題数・正解数・状態等）と、問題別の回答履歴一覧を取得する。解答結果画面（S-09）で使用する。

## 2. リクエスト

### パスパラメータ

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `sessionId` | String | 必須 | 対象セッションID |

## 3. レスポンス

### 200 OK

```json
{
  "sessionId": "s-uuid-1",
  "qualificationId": "1Z0-085-JPN",
  "totalQuestions": 20,
  "correctCount": 16,
  "timeLimitMin": 30,
  "elapsedSec": 1580,
  "status": "completed",
  "startedAt": "2026-07-18T10:00:00.000Z",
  "finishedAt": "2026-07-18T10:26:20.000Z",
  "answers": [
    { "questionId": "q-uuid-1", "isCorrect": true, "answeredAt": "2026-07-18T10:01:10.000Z" },
    { "questionId": "q-uuid-2", "isCorrect": false, "answeredAt": "2026-07-18T10:02:05.000Z" }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `totalQuestions` | Number | 総問題数 |
| `correctCount` | Number | 正解数 |
| `status` | String | `in_progress` / `completed` / `expired` |
| `answers[]` | Array | `AnswerHistories` を `answeredAt` 昇順（＝出題順相当）で並べたもの |
| `answers[].isCorrect` | Boolean | 問題別正誤（S-09の「問題別正誤一覧」表示に使用） |

## 4. 処理フロー

1. `sessionId` の存在確認、リクエストユーザーと `ExamSessions.userId` の一致確認（不一致は403）。
2. `ExamSessions` から対象レコードを取得。
3. `AnswerHistories` テーブルの GSI（`sessionId`）を Query し、`answeredAt` 昇順にソートして結合する。
4. 正答率はクライアント側で `correctCount / totalQuestions` から算出する（サーバー側で算出済みの値を含めてもよい。詳細設計時に確定）。

## 5. エラー

| ステータス | コード | 条件 |
|---|---|---|
| 401 | `UNAUTHORIZED` | トークン無効 |
| 403 | `FORBIDDEN` | 他ユーザーの `sessionId` を指定 |
| 404 | `NOT_FOUND` | `sessionId` が存在しない |
| 500 | `INTERNAL_ERROR` | DynamoDB Query 失敗等 |

## 6. 備考

- 未回答のまま時間切れとなった問題（`AnswerHistories` にレコードがない `questionId`）は、S-09側で「未回答（✕扱い）」として表示する。`totalQuestions` と `answers` 件数の差分がその件数に相当する。
