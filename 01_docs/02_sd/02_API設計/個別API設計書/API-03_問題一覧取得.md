# API-03 問題一覧取得

| 項目 | 内容 |
|---|---|
| メソッド / パス | `GET /questions` |
| Phase | Phase 1 |
| 認証 | 必要（Cognito） |
| 利用画面 | S-08（問題閲覧） |
| 関連テーブル | OR_M_QUESTION, OR_M_CHOICE |

## 1. 概要

資格・カテゴリでフィルタリングした問題一覧を取得する。問題閲覧画面（S-08）向けのAPIであり、選択肢・正解・解説を含めて返却する（出題用の [API-04](API-04_ランダム出題リスト生成.md) とは異なり、正解を隠さない）。

## 2. リクエスト

### クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `qualificationId` | String | 必須 | 資格ID |
| `categoryId` | String | 任意 | カテゴリID。未指定時は資格内の全カテゴリ対象 |
| `limit` | Number | 任意 | 1ページの最大件数（既定20、最大100） |
| `nextToken` | String | 任意 | ページングトークン（[API共通設計](../API共通設計.md) 参照） |

## 3. レスポンス

### 200 OK

```json
{
  "items": [
    {
      "questionId": "q-uuid-1",
      "qualificationId": "1Z0-085-JPN",
      "categoryId": "c-uuid-1",
      "questionText": "次のSQL文で正しいものはどれか。",
      "questionType": "single",
      "correctCount": 1,
      "difficulty": "medium",
      "explanation": "SELECT文は...",
      "choices": [
        { "choiceId": "ch-1", "label": "A", "choiceText": "SELECT * FROM ...", "isCorrect": true, "sortOrder": 1 },
        { "choiceId": "ch-2", "label": "B", "choiceText": "INSERT INTO ...", "isCorrect": false, "sortOrder": 2 }
      ]
    }
  ],
  "nextToken": null
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `items[].questionId` | String | 問題ID |
| `items[].questionText` | String | 問題文 |
| `items[].questionType` | String | `single` / `multiple` |
| `items[].correctCount` | Number | 複数選択時の正解数 |
| `items[].difficulty` | String | `easy` / `medium` / `hard` |
| `items[].explanation` | String | 解説テキスト |
| `items[].choices` | Array | 選択肢一覧（`isCorrect` を含む） |
| `nextToken` | String/null | 次ページ取得用トークン |

## 4. 処理フロー

1. `qualificationId` の必須チェック。
2. `categoryId` 指定時は `OR_M_QUESTION` テーブルの GSI（`categoryId`）を Query、未指定時は GSI（`qualificationId`）を Query。
3. 取得した各問題について `OR_M_CHOICE` テーブルの GSI（`questionId`）を Query し、選択肢を結合する（`sortOrder` 昇順）。
4. `isActive=true` の問題のみ返却する。
5. `limit`/`nextToken` に基づきページングを行う。

## 5. エラー

| ステータス | コード | 条件 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `qualificationId` 未指定、`limit` が範囲外 |
| 401 | `UNAUTHORIZED` | トークン無効 |
| 500 | `INTERNAL_ERROR` | DynamoDB Query 失敗等 |

## 6. 備考

- 本APIは学習目的の閲覧用であり、`OR_T_EXAM_SESSION`/`OR_T_ANSWER_HISTORY` は一切更新しない。
- 出題（採点対象）には本APIを使わず、[API-04](API-04_ランダム出題リスト生成.md) を使用すること（正解情報の露出範囲が異なるため）。
