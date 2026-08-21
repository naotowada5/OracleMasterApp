# T-03 OR_M_QUESTION（問題テーブル）

| 項目 | 内容 |
|---|---|
| テーブル名 | OR_M_QUESTION |
| テーブル種類 | M（マスタテーブル） |
| 概要 | 出題される問題本体（問題文・種別・解説等）を管理する |
| Phase | Phase 1 |
| プライマリキー | `questionId`（パーティションキーのみ） |
| GSI | `qualificationId-index`（PK: qualificationId）, `categoryId-index`（PK: categoryId） |

## 1. 属性定義

| 属性名 | 型 | キー | 必須 | 説明 |
|---|---|---|---|---|
| questionId | String | PK | 必須 | UUID |
| qualificationId | String | GSI PK | 必須 | 所属資格ID |
| categoryId | String | GSI PK | 必須 | 所属カテゴリID |
| questionText | String | | 必須 | 問題文 |
| questionType | String | | 必須 | `single`（単一選択）/ `multiple`（複数選択） |
| correctCount | Number | | 必須 | 正解の選択肢数。`single`の場合は常に1 |
| explanation | String | | 必須 | 解説テキスト（事前登録済み。Phase1/2では動的生成しない） |
| difficulty | String | | 任意 | `easy` / `medium` / `hard` |
| isActive | Boolean | | 必須 | 公開/非公開フラグ。falseの問題は出題・閲覧対象から除外 |
| createdAt | String | | 必須 | 【共通項目・登録日】ISO 8601 |
| createdBy | String | | 必須 | 【共通項目・登録者】初期データ投入時は `SYSTEM`、[API-05](../../02_API設計/個別API設計書/API-05_問題インポート.md)/[API-06](../../02_API設計/個別API設計書/API-06_AI問題生成.md) 経由（Phase3）は実行ユーザーの Cognito `sub` |
| updatedAt | String | | 必須 | 【共通項目・更新日】ISO 8601 |
| updatedBy | String | | 必須 | 【共通項目・更新者】 |

共通項目（`createdAt` / `createdBy` / `updatedAt` / `updatedBy`）の設定規則は [テーブル一覧](../テーブル一覧.md) §共通項目を参照。

## 2. GSI定義

| GSI名 | パーティションキー | 用途 |
|---|---|---|
| qualificationId-index | qualificationId | 資格別の出題対象取得（[API-04](../../02_API設計/個別API設計書/API-04_ランダム出題リスト生成.md)） |
| categoryId-index | categoryId | カテゴリ別の問題取得（[API-03](../../02_API設計/個別API設計書/API-03_問題一覧取得.md)） |

## 3. サンプルアイテム

```json
{
  "questionId": "q1e2f3a4-...",
  "qualificationId": "1Z0-071-JPN",
  "categoryId": "c3b1a2d4-...",
  "questionText": "次のSQL文で正しいものはどれか。",
  "questionType": "single",
  "correctCount": 1,
  "explanation": "SELECT文の基本構文は SELECT 列 FROM 表 である。",
  "difficulty": "medium",
  "isActive": true,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "createdBy": "SYSTEM",
  "updatedAt": "2026-06-01T00:00:00.000Z",
  "updatedBy": "SYSTEM"
}
```

## 4. 利用API

- [API-03 問題一覧取得](../../02_API設計/個別API設計書/API-03_問題一覧取得.md)（Query, 閲覧用途・正解含む）
- [API-04 ランダム出題リスト生成](../../02_API設計/個別API設計書/API-04_ランダム出題リスト生成.md)（Query, 出題用途・正解を除いて返却）
- [API-05 問題インポート](../../02_API設計/個別API設計書/API-05_問題インポート.md)（登録, Phase3）
- [API-06 AI問題生成](../../02_API設計/個別API設計書/API-06_AI問題生成.md)（`mode=save` 時に登録, Phase3）

## 5. 備考

- `correctCount` は [API-08 セッション更新](../../02_API設計/個別API設計書/API-08_セッション更新.md) の採点処理では直接使わず、`OR_M_CHOICE.isCorrect=true` の集合との完全一致で判定する（`correctCount` はUI上の「◯つ選んでください」表示用の補助情報）。
- 目標データ件数は各資格500問以上（要件定義書 §8.1）。Phase1リリース時点で不足する場合は資格ごとに順次拡充する。
- 共通項目は監査用の内部項目であり、[API-03](../../02_API設計/個別API設計書/API-03_問題一覧取得.md)/[API-04](../../02_API設計/個別API設計書/API-04_ランダム出題リスト生成.md) のレスポンスには含めない。
