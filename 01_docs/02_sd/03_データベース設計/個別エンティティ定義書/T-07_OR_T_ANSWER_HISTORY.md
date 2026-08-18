# T-07 OR_T_ANSWER_HISTORY（回答履歴テーブル）

| 項目 | 内容 |
|---|---|
| テーブル名 | OR_T_ANSWER_HISTORY |
| テーブル種類 | T（トランザクションテーブル） |
| 概要 | セッション内で回答した各問題の選択内容・正誤結果を記録する |
| Phase | Phase 1 |
| プライマリキー | `historyId`（パーティションキーのみ） |
| GSI | `sessionId-index`（PK: sessionId） |

## 1. 属性定義

| 属性名 | 型 | キー | 必須 | 説明 |
|---|---|---|---|---|
| historyId | String | PK | 必須 | UUID |
| sessionId | String | GSI PK | 必須 | 所属セッションID |
| questionId | String | | 必須 | 回答対象の問題ID |
| selectedChoiceIds | List&lt;String&gt; | | 必須 | 選択した選択肢IDのリスト（単一選択でも要素数1のリストとして保持） |
| isCorrect | Boolean | | 必須 | 正誤フラグ。選択項目の集合と正解項目の集合の**完全一致**で判定（要件定義書 F-04） |
| answeredAt | String | | 必須 | 回答日時（ISO 8601） |
| createdAt | String | | 必須 | 【共通項目・登録日】レコード作成日時（ISO 8601）。業務上の回答日時は `answeredAt` を正とする |
| createdBy | String | | 必須 | 【共通項目・登録者】回答したユーザーの `userId`（Cognito `sub`） |
| updatedAt | String | | 必須 | 【共通項目・更新日】ISO 8601。作成時は `createdAt` と同値 |
| updatedBy | String | | 必須 | 【共通項目・更新者】回答したユーザーの `userId` |

共通項目（`createdAt` / `createdBy` / `updatedAt` / `updatedBy`）の設定規則は [テーブル一覧](../テーブル一覧.md) §共通項目を参照。本テーブルは原則として追記のみ（更新しない）ため、`updatedAt`/`updatedBy` は作成時の値のまま推移する。

## 2. GSI定義

| GSI名 | パーティションキー | 用途 |
|---|---|---|
| sessionId-index | sessionId | セッション別の回答履歴一覧取得（[API-09](../../02_API設計/個別API設計書/API-09_セッション取得.md)） |

## 3. サンプルアイテム

```json
{
  "historyId": "h1a2b3c4-...",
  "sessionId": "s1a2b3c4-...",
  "questionId": "q1e2f3a4-...",
  "selectedChoiceIds": ["ch1a2b3c-..."],
  "isCorrect": true,
  "answeredAt": "2026-07-18T10:01:10.000Z",
  "createdAt": "2026-07-18T10:01:10.000Z",
  "createdBy": "5f1e2d3c-cognito-sub",
  "updatedAt": "2026-07-18T10:01:10.000Z",
  "updatedBy": "5f1e2d3c-cognito-sub"
}
```

## 4. 利用API

- [API-08 セッション更新](../../02_API設計/個別API設計書/API-08_セッション更新.md)（作成: 回答送信の都度1レコード作成）
- [API-09 セッション取得](../../02_API設計/個別API設計書/API-09_セッション取得.md)（Query: 問題別正誤一覧の取得）

## 5. 備考

- 同一 `sessionId` + `questionId` の重複回答（多重送信）は、[API-08](../../02_API設計/個別API設計書/API-08_セッション更新.md) 側で冪等性を担保する実装方針とする（詳細設計で確定）。
- 未回答（時間切れ等で回答されなかった問題）はレコード自体が作成されない。`OR_T_EXAM_SESSION.totalQuestions` と本テーブルの件数の差分が未回答数となる。
- 共通項目は監査用の内部項目であり、[API-08](../../02_API設計/個別API設計書/API-08_セッション更新.md)/[API-09](../../02_API設計/個別API設計書/API-09_セッション取得.md) のレスポンスには含めない。
