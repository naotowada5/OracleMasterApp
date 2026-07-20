# T-07 AnswerHistories（回答履歴テーブル）

| 項目 | 内容 |
|---|---|
| テーブル名 | AnswerHistories |
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
  "answeredAt": "2026-07-18T10:01:10.000Z"
}
```

## 4. 利用API

- [API-08 セッション更新](../../02_API設計/個別API設計書/API-08_セッション更新.md)（作成: 回答送信の都度1レコード作成） 
- [API-09 セッション取得](../../02_API設計/個別API設計書/API-09_セッション取得.md)（Query: 問題別正誤一覧の取得）

## 5. 備考

- 同一 `sessionId` + `questionId` の重複回答（多重送信）は、[API-08](../../02_API設計/個別API設計書/API-08_セッション更新.md) 側で冪等性を担保する実装方針とする（詳細設計で確定）。
- 未回答（時間切れ等で回答されなかった問題）はレコード自体が作成されない。`ExamSessions.totalQuestions` と本テーブルの件数の差分が未回答数となる。
