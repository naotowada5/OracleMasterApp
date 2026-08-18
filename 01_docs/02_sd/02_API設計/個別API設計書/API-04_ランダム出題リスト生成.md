# API-04 ランダム出題リスト生成

| 項目 | 内容 |
|---|---|
| メソッド / パス | `POST /questions/random` |
| Phase | Phase 1 |
| 認証 | 必要（Cognito） |
| 利用画面 | S-05（出題設定） |
| 関連テーブル | OR_M_QUESTION, OR_M_CHOICE |

## 1. 概要

出題設定画面（S-05）で指定された資格・出題数の条件に基づき、出題対象の問題をランダムに抽選して返す。**正解フラグ（`isCorrect`）は含めない**（クライアントに正解を渡さないため）。

## 2. リクエスト

### ボディ

```json
{
  "qualificationId": "1Z0-085-JPN",
  "questionCount": 20
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `qualificationId` | String | 必須 | 資格ID |
| `questionCount` | Number | 任意 | 1〜100。未指定時は対象資格の全問題を出題対象とする |

## 3. レスポンス

### 200 OK

```json
{
  "questions": [
    {
      "questionId": "q-uuid-1",
      "questionText": "次のSQL文で正しいものはどれか。",
      "questionType": "single",
      "correctCount": 1,
      "choices": [
        { "choiceId": "ch-1", "label": "A", "choiceText": "SELECT * FROM ..." },
        { "choiceId": "ch-2", "label": "B", "choiceText": "INSERT INTO ..." }
      ]
    }
  ],
  "actualCount": 20
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `questions[].questionId` | String | 問題ID |
| `questions[].questionText` | String | 問題文 |
| `questions[].questionType` | String | `single` / `multiple` |
| `questions[].correctCount` | Number | 複数選択時に選ぶべき正解数（UIの「◯つ選んでください」表示に使用。正解IDそのものは含まない） |
| `questions[].choices` | Array | 選択肢一覧（`isCorrect` は含めない。表示順は `sortOrder` 準拠） |
| `actualCount` | Number | 実際に抽選できた問題数（対象問題数が `questionCount` に満たない場合は丸められる） |

## 4. 処理フロー

1. `qualificationId` の必須チェック、`questionCount` の範囲チェック（1〜100、任意）。
2. `OR_M_QUESTION` テーブルの GSI（`qualificationId`）を Query し、`isActive=true` の問題を取得。
3. 取得件数が `questionCount` 以上の場合はランダムに `questionCount` 件を抽出。件数が満たない場合は取得できた全件を返し、`actualCount` にその件数を設定する。
4. 各問題について `OR_M_CHOICE` テーブルを Query し、`isCorrect` を除いた選択肢情報を結合する。
5. 選択肢の表示順は `sortOrder` に従うか、クライアント側でシャッフルするかは詳細設計で決定する（本APIは `sortOrder` 順のまま返す）。

## 5. エラー

| ステータス | コード | 条件 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `qualificationId` 未指定、`questionCount` が範囲外（1〜100以外） |
| 401 | `UNAUTHORIZED` | トークン無効 |
| 404 | `NOT_FOUND` | 対象資格の出題可能な問題が0件 |
| 500 | `INTERNAL_ERROR` | DynamoDB Query 失敗等 |

## 6. 備考

- 本APIのレスポンスには正解情報を一切含めない。正誤判定は [API-08 セッション更新](API-08_セッション更新.md) にてサーバー側で行う。
- 本APIは `OR_T_EXAM_SESSION`/`OR_T_ANSWER_HISTORY` を更新しない（出題リストの生成のみ）。セッションの作成は [API-07](API-07_試験セッション開始.md) で別途行う。
