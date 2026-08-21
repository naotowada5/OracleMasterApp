# API-08 セッション更新（回答記録・採点）

| 項目 | 内容 |
|---|---|
| メソッド / パス | `PUT /sessions/{sessionId}` |
| Phase | Phase 1 |
| 認証 | 必要（Cognito） |
| 利用画面 | S-06（出題）, S-07（解説） |
| 関連テーブル | OR_T_EXAM_SESSION, OR_T_ANSWER_HISTORY, OR_M_CHOICE |

## 1. 概要

S-06 出題画面での1問ごとの回答をサーバーに送信し、サーバー側で正誤判定（採点）を行った上で `OR_T_ANSWER_HISTORY` に記録し、`OR_T_EXAM_SESSION` の進捗（正解数・経過時間・完了状態）を更新する。1回のAPI呼び出しにつき1問分の回答を処理することを基本とする。

## 2. リクエスト

### パスパラメータ

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `sessionId` | String | 必須 | 対象セッションID |

### ボディ（1問分の回答）

```json
{
  "action": "answer",
  "questionId": "q-uuid-1",
  "selectedChoiceIds": ["ch-2", "ch-4"],
  "elapsedSec": 125
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `action` | String | 必須 | `answer`（回答送信） / `finish`（時間切れ等によるセッション強制終了。回答なしで呼ぶ場合に使用） |
| `questionId` | String | `action=answer` 時必須 | |
| `selectedChoiceIds` | Array&lt;String&gt; | `action=answer` 時必須 | 単一選択でも配列形式（要素数1）で送信する |
| `elapsedSec` | Number | 任意 | クライアント計測の経過時間（秒）。サーバー側の `startedAt` との整合チェックに使用 |

## 3. レスポンス

### 200 OK（`action=answer`）

```json
{
  "historyId": "h-uuid-1",
  "questionId": "q-uuid-1",
  "isCorrect": false,
  "correctChoiceIds": ["ch-2", "ch-3"],
  "sessionStatus": "in_progress",
  "sessionCorrectCount": 4,
  "isLastQuestion": false
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `historyId` | String | 作成された回答履歴ID |
| `isCorrect` | Boolean | 採点結果 |
| `correctChoiceIds` | Array&lt;String&gt; | 正解の選択肢ID一覧（S-07 解説画面のハイライト表示に使用） |
| `sessionStatus` | String | 更新後のセッション状態 |
| `sessionCorrectCount` | Number | ここまでの正解数累計 |
| `isLastQuestion` | Boolean | このセッションの `totalQuestions` に達したか（S-07で「結果を見る」ボタン表示の判定に利用可能。クライアント側の出題順管理と併用） |

### 200 OK（`action=finish`）

```json
{
  "sessionStatus": "expired",
  "sessionCorrectCount": 12,
  "finishedAt": "2026-07-18T10:31:00.000Z"
}
```

## 4. 処理フロー（`action=answer`）

1. `sessionId` が存在し、リクエストユーザーの `userId` と `OR_T_EXAM_SESSION.userId` が一致するか検証（不一致は 403）。
2. `OR_T_EXAM_SESSION.status` が `in_progress` であることを確認（`completed`/`expired` の場合は 409）。
3. `questionId` に紐づく `OR_M_CHOICE` を取得し、`isCorrect=true` の選択肢ID集合を算出する。
4. 採点: `selectedChoiceIds` の集合と正解集合が**完全に一致**する場合のみ `isCorrect=true`（単一選択・複数選択いずれも同一ロジック。要件定義書 F-04 の「部分点なし」仕様）。
5. `OR_T_ANSWER_HISTORY` に新規レコードを作成（`historyId` UUID採番、`sessionId`, `questionId`, `selectedChoiceIds`, `isCorrect`, `answeredAt`）。共通項目 `createdAt`/`updatedAt`=現在時刻、`createdBy`/`updatedBy`=トークンの `sub` を設定する（[テーブル一覧](../../03_データベース設計/テーブル一覧.md) §共通項目）。
6. `isCorrect=true` の場合、`OR_T_EXAM_SESSION.correctCount` をインクリメントする。あわせて `OR_T_EXAM_SESSION` の `updatedAt`=現在時刻、`updatedBy`=トークンの `sub` を更新する（`createdAt`/`createdBy` は上書きしない）。
7. 制限時間超過（`elapsedSec` がセッションの `timeLimitMin*60` を超えている）を検知した場合は、本回答は記録した上で `OR_T_EXAM_SESSION.status` を `expired` に更新し、`finishedAt` を設定する。

## 5. 処理フロー（`action=finish`）

1. 認可チェック（手順4-1と同様）。
2. `OR_T_EXAM_SESSION.status` を `expired`（時間切れ）または `completed`（全問終了）に更新し、`finishedAt` を設定する。共通項目 `updatedAt`/`updatedBy` も更新する。
3. 既に `completed`/`expired` の場合は冪等に現状のステータスを返す（エラーにしない）。

## 6. エラー

| ステータス | コード | 条件 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `action`不正、`selectedChoiceIds` が空配列（`action=answer`時） |
| 401 | `UNAUTHORIZED` | トークン無効 |
| 403 | `FORBIDDEN` | 他ユーザーの `sessionId` を指定 |
| 404 | `NOT_FOUND` | `sessionId`/`questionId` が存在しない |
| 409 | `CONFLICT` | 既に `completed`/`expired` のセッションへの `action=answer` |
| 500 | `INTERNAL_ERROR` | DynamoDB 書き込み失敗 |

## 7. 備考

- 採点処理は必ずサーバー（Lambda）側で行い、クライアントには問題一覧取得時点（[API-04](API-04_ランダム出題リスト生成.md)）で正解を渡さない設計とする（不正な採点操作の防止）。
- 同一 `questionId` に対する重複回答送信（多重タップ等）を考慮し、`sessionId`+`questionId` の組み合わせで冪等性を担保する実装（例: 既存 `OR_T_ANSWER_HISTORY` があれば上書きせず既存結果を返す）を詳細設計で検討する。
