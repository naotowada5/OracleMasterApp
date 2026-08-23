# API-09 セッション取得

| 項目 | 内容 |
|---|---|
| メソッド / パス | `GET /sessions/{sessionId}` |
| Phase | Phase 1 |
| 認証 | 必要（Cognito） |
| 利用画面 | S-09（解答結果） |
| 関連テーブル | OR_T_EXAM_SESSION, OR_T_ANSWER_HISTORY, OR_M_QUESTION, OR_M_CHOICE |

## 1. 概要

指定したセッションのサマリ情報（総問題数・正解数・状態等）と、問題別の回答履歴一覧を取得する。解答結果画面（S-09）で使用する。

回答履歴には、S-09 で問題ごとの振り返り（問題文・選択肢・正解・解説・自分の回答）を表示するために必要な情報を含める。セッションは既に採点済みであるため、正解と解説を開示してよい（[API-08](API-08_セッション更新.md) §7 と同じ考え方）。

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
    {
      "questionId": "q-uuid-1",
      "isCorrect": true,
      "answeredAt": "2026-07-18T10:01:10.000Z",
      "selectedChoiceIds": ["ch-1"],
      "questionText": "次のSQL文で正しいものはどれか。",
      "questionType": "single",
      "explanation": "SELECT文の基本構文は...",
      "choices": [
        {
          "choiceId": "ch-1",
          "label": "A",
          "choiceText": "SELECT * FROM ...",
          "isCorrect": true,
          "sortOrder": 1
        },
        {
          "choiceId": "ch-2",
          "label": "B",
          "choiceText": "INSERT INTO ...",
          "isCorrect": false,
          "sortOrder": 2
        }
      ]
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `totalQuestions` | Number | 総問題数 |
| `correctCount` | Number | 正解数 |
| `status` | String | `in_progress` / `completed` / `expired` |
| `answers[]` | Array | `OR_T_ANSWER_HISTORY` を `answeredAt` 昇順（＝出題順相当）で並べたもの |
| `answers[].isCorrect` | Boolean | 問題別正誤（S-09の「問題別正誤一覧」表示に使用） |
| `answers[].selectedChoiceIds` | Array&lt;String&gt; | ユーザーが選択した選択肢ID。S-09 の詳細表示で「あなたの回答」を示すために使用 |
| `answers[].questionText` | String | 問題文 |
| `answers[].questionType` | String | `single` / `multiple` |
| `answers[].explanation` | String | 事前登録済みの解説テキスト。未登録の場合は空文字 |
| `answers[].choices` | Array | 選択肢一覧（`isCorrect` を含む）。表示順は `sortOrder` 昇順 |

問題データが削除されている等の理由で問題本体を取得できなかった場合は、`questionText`/`explanation` を空文字、`choices` を空配列として返す（結果表示自体は継続できるようにする）。

**レスポンスサイズについて:** `answers[]` は回答数に比例して大きくなる。Phase1 の1セッションあたりの出題数は最大100問（要件定義書 F-03）であり、この規模では問題ありません。Phase3 で進捗管理（F-10）を実装し、過去セッションを一覧表示する場合は、サマリのみを返す別APIの追加を検討する。

## 4. 処理フロー

1. `sessionId` の存在確認、リクエストユーザーと `OR_T_EXAM_SESSION.userId` の一致確認（不一致は403）。
2. `OR_T_EXAM_SESSION` から対象レコードを取得。
3. `OR_T_ANSWER_HISTORY` テーブルの GSI（`sessionId`）を Query し、`answeredAt` 昇順にソートして結合する。
4. 回答履歴に含まれる `questionId` について `OR_M_QUESTION` と `OR_M_CHOICE`（GSI `questionId`）を取得し、問題文・解説・選択肢を各回答に結合する。選択肢は `sortOrder` 昇順とする。
5. 正答率はクライアント側で `correctCount / totalQuestions` から算出する（サーバー側で算出済みの値を含めてもよい。詳細設計時に確定）。

## 5. エラー

| ステータス | コード | 条件 |
|---|---|---|
| 401 | `UNAUTHORIZED` | トークン無効 |
| 403 | `FORBIDDEN` | 他ユーザーの `sessionId` を指定 |
| 404 | `NOT_FOUND` | `sessionId` が存在しない |
| 500 | `INTERNAL_ERROR` | DynamoDB Query 失敗等 |

## 6. 備考

- 未回答のまま時間切れとなった問題（`OR_T_ANSWER_HISTORY` にレコードがない `questionId`）は、S-09側で「未回答（✕扱い）」として表示する。`totalQuestions` と `answers` 件数の差分がその件数に相当する。
