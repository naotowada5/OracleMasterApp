# T-04 Choices（選択肢テーブル）

| 項目 | 内容 |
|---|---|
| テーブル名 | Choices |
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
  "sortOrder": 1
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
- `questionType=multiple` の問題は `isCorrect=true` の選択肢が2件以上（`Questions.correctCount` と件数が一致すること）。

## 6. 備考

- 選択肢の登録は `Questions` の登録と同一のDynamoDB TransactWriteItemsで行い、孤立したChoicesレコードが発生しないようにする（[ER図](../ER図.md) の参照整合性方針参照）。
