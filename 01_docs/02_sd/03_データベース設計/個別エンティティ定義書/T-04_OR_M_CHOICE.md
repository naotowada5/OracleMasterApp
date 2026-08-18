# T-04 OR_M_CHOICE（選択肢テーブル）

| 項目 | 内容 |
|---|---|
| テーブル名 | OR_M_CHOICE |
| テーブル種類 | M（マスタテーブル） |
| 概要 | 各問題に紐づく選択肢（最大10択）を管理する |
| Phase | Phase 1 |
| プライマリキー | `choiceId`（パーティションキーのみ） |
| GSI | `questionId-index`（PK: questionId） |

## 1. 属性定義

| 属性名 | 型 | キー | 必須 | 説明 |
|---|---|---|---|---|
| choiceId | String | PK | 必須 | UUID |
| questionId | String | GSI PK | 必須 | 所属する問題ID |
| label | String | | 必須 | 選択肢ラベル（A / B / C ... 最大J相当まで） |
| choiceText | String | | 必須 | 選択肢の文言 |
| isCorrect | Boolean | | 必須 | 正解フラグ |
| sortOrder | Number | | 必須 | 表示順（シャッフル前の基準順） |
| createdAt | String | | 必須 | 【共通項目・登録日】ISO 8601。親の `OR_M_QUESTION` と同一値を設定 |
| createdBy | String | | 必須 | 【共通項目・登録者】親の `OR_M_QUESTION` と同一値を設定 |
| updatedAt | String | | 必須 | 【共通項目・更新日】ISO 8601 |
| updatedBy | String | | 必須 | 【共通項目・更新者】 |

共通項目（`createdAt` / `createdBy` / `updatedAt` / `updatedBy`）の設定規則は [テーブル一覧](../テーブル一覧.md) §共通項目を参照。

## 2. GSI定義

| GSI名 | パーティションキー | 用途 |
|---|---|---|
| questionId-index | questionId | 問題に紐づく選択肢一覧の取得（出題・閲覧・採点すべてで使用） |

## 3. サンプルアイテム

```json
{
  "choiceId": "ch1a2b3c-...",
  "questionId": "q1e2f3a4-...",
  "label": "A",
  "choiceText": "SELECT * FROM employees;",
  "isCorrect": true,
  "sortOrder": 1,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "createdBy": "SYSTEM",
  "updatedAt": "2026-06-01T00:00:00.000Z",
  "updatedBy": "SYSTEM"
}
```

## 4. 利用API

- [API-03 問題一覧取得](../../02_API設計/個別API設計書/API-03_問題一覧取得.md)（Query, `isCorrect` を含めて返却）
- [API-04 ランダム出題リスト生成](../../02_API設計/個別API設計書/API-04_ランダム出題リスト生成.md)（Query, `isCorrect` を除いて返却）
- [API-08 セッション更新](../../02_API設計/個別API設計書/API-08_セッション更新.md)（Query, 採点時の正解集合算出に使用）
- [API-05 問題インポート](../../02_API設計/個別API設計書/API-05_問題インポート.md) / [API-06 AI問題生成](../../02_API設計/個別API設計書/API-06_AI問題生成.md)（登録, Phase3）

## 5. 制約

- 1問あたりの選択肢は2〜10件（要件定義書 §7.2 スキーマの `minItems`/`maxItems`）。
- `questionType=single` の問題は `isCorrect=true` の選択肢が必ず1件。
- `questionType=multiple` の問題は `isCorrect=true` の選択肢が2件以上（`OR_M_QUESTION.correctCount` と件数が一致すること）。

## 6. 備考

- 選択肢の登録は `OR_M_QUESTION` の登録と同一のDynamoDB TransactWriteItemsで行い、孤立した `OR_M_CHOICE` レコードが発生しないようにする（[ER図](../ER図.md) の参照整合性方針参照）。共通項目も親の問題レコードと同一値で揃える。
- 共通項目は監査用の内部項目であり、[API-03](../../02_API設計/個別API設計書/API-03_問題一覧取得.md)/[API-04](../../02_API設計/個別API設計書/API-04_ランダム出題リスト生成.md) のレスポンス（`choices[]`）には含めない。
