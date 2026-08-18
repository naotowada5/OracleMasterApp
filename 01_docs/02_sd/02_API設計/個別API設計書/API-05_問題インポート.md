# API-05 問題インポート（JSON）

| 項目 | 内容 |
|---|---|
| メソッド / パス | `POST /questions/import` |
| Phase | Phase 3（本設計はインターフェース定義のみ。Phase1・Phase2では未実装） |
| 認証 | 必要（Cognito） |
| 利用画面 | S-04（Phase3） |
| 関連テーブル | OR_M_QUALIFICATION, OR_M_CATEGORY, OR_M_QUESTION, OR_M_CHOICE |

> **注意:** Phase 1・Phase 2 では Lambda 実装・API Gateway ルート登録を行わない。要件定義書 §7.2 の JSON スキーマは、Phase1・Phase2 における開発者スクリプト（`14_script`）の内部フォーマットとしても共通で使用するため、スキーマ自体は本Phaseから確定させる。

## 1. 概要

要件定義書 §7.2 のスキーマに準拠した JSON を受け取り、バリデーション後に `OR_M_QUESTION` / `OR_M_CHOICE`（および必要に応じ `OR_M_CATEGORY`）へ登録する。

## 2. リクエスト

### ボディ（要件定義書 §7.2 準拠）

```json
{
  "qualificationId": "1Z0-071-JPN",
  "questions": [
    {
      "categoryName": "SELECT文の基礎",
      "questionText": "次のSQL文で正しいものはどれか。",
      "questionType": "single",
      "difficulty": "medium",
      "explanation": "...",
      "choices": [
        { "label": "A", "choiceText": "SELECT * FROM ...", "isCorrect": true },
        { "label": "B", "choiceText": "INSERT INTO ...", "isCorrect": false }
      ]
    }
  ]
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `qualificationId` | String | 必須 | 登録先の資格ID（`OR_M_QUALIFICATION` に存在すること） |
| `questions[].categoryName` | String | 任意 | 未登録カテゴリ名の場合は `OR_M_CATEGORY` に新規作成 |
| `questions[].questionText` | String | 必須 | |
| `questions[].questionType` | String | 必須 | `single` / `multiple` |
| `questions[].difficulty` | String | 任意 | `easy` / `medium` / `hard` |
| `questions[].explanation` | String | 必須 | |
| `questions[].choices` | Array | 必須 | 2〜10件。各要素は `label`, `choiceText`, `isCorrect` が必須 |

## 3. レスポンス

### 200 OK

```json
{
  "successCount": 18,
  "failureCount": 2,
  "failures": [
    { "index": 5, "reason": "choices must have at least 2 items" }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `successCount` | Number | 登録成功件数 |
| `failureCount` | Number | 登録失敗件数 |
| `failures[].index` | Number | `questions` 配列内のインデックス |
| `failures[].reason` | String | 失敗理由 |

## 4. 処理フロー

1. JSON スキーマバリデーション（要件定義書 §7.2 の JSON Schema に準拠）。
2. `qualificationId` が `OR_M_QUALIFICATION` に存在するか確認。
3. 各 `questions[]` 要素ごとに、`categoryName` から `OR_M_CATEGORY` を検索、未存在なら新規作成し `categoryId` を採番。
4. `OR_M_QUESTION` に UUID を採番して登録（`isActive=true`）。
5. `OR_M_CHOICE` に選択肢を登録（`isCorrect` 数と `questionType` の整合性チェック: `single` は `isCorrect=true` が1件、`multiple` は1件以上かつ `correctCount` として件数を保存）。
6. 手順3〜5で作成する全レコードに共通項目を設定する。`createdAt`/`updatedAt`=現在時刻、`createdBy`/`updatedBy`=トークンの `sub`（開発者スクリプト経由の投入時は `SYSTEM`）。`OR_M_CHOICE` は親の `OR_M_QUESTION` と同一値を設定する（[テーブル一覧](../../03_データベース設計/テーブル一覧.md) §共通項目）。
7. 要素単位で成功/失敗を判定し、一部失敗があっても成功分は登録を継続する（要件定義書 F-08「成功・失敗件数をフィードバック表示」）。

## 5. エラー

| ステータス | コード | 条件 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | JSON 全体のスキーマ不正、`qualificationId` 未指定 |
| 401 | `UNAUTHORIZED` | トークン無効 |
| 404 | `NOT_FOUND` | 指定 `qualificationId` が存在しない |
| 500 | `INTERNAL_ERROR` | DynamoDB 書き込み失敗等 |

（個々の `questions[]` 要素のバリデーションエラーは 200 OK 内の `failures` として返却し、リクエスト全体は失敗としない）

## 6. 備考

- Phase1・Phase2 での初期データ投入は、本APIを介さず開発者スクリプトが同一スキーマの JSON を直接 DynamoDB に書き込む方式で行う（要件定義書 §2.2, §10.1）。
