# T-02 OR_M_CATEGORY（大問カテゴリマスタ）

| 項目 | 内容 |
|---|---|
| テーブル名 | OR_M_CATEGORY |
| テーブル種類 | M（マスタテーブル） |
| 概要 | 資格ごとの大問カテゴリ（例: SELECT文の基礎、トランザクション制御 等）を管理するマスタ |
| Phase | Phase 1 |
| プライマリキー | `categoryId`（パーティションキーのみ） |
| GSI | `qualificationId-index`（PK: qualificationId） |

## 1. 属性定義

| 属性名 | 型 | キー | 必須 | 説明 |
|---|---|---|---|---|
| categoryId | String | PK | 必須 | UUID |
| qualificationId | String | GSI PK | 必須 | 所属する資格ID（`OR_M_QUALIFICATION` を参照） |
| categoryName | String | | 必須 | カテゴリ名。例: `SELECT文の基礎` |
| sortOrder | Number | | 必須 | 表示順（同一資格内で昇順ソート） |
| createdAt | String | | 必須 | 【共通項目・登録日】ISO 8601 |
| createdBy | String | | 必須 | 【共通項目・登録者】初期データ投入時は `SYSTEM`、[API-05](../../02_API設計/個別API設計書/API-05_問題インポート.md) 経由の自動作成時（Phase3）は実行ユーザーの Cognito `sub` |
| updatedAt | String | | 必須 | 【共通項目・更新日】ISO 8601 |
| updatedBy | String | | 必須 | 【共通項目・更新者】 |

共通項目（`createdAt` / `createdBy` / `updatedAt` / `updatedBy`）の設定規則は [テーブル一覧](../テーブル一覧.md) §共通項目を参照。

## 2. GSI定義

| GSI名 | パーティションキー | 用途 |
|---|---|---|
| qualificationId-index | qualificationId | 資格別のカテゴリ一覧取得（[API-02](../../02_API設計/個別API設計書/API-02_カテゴリ一覧取得.md)） |

## 3. サンプルアイテム

```json
{
  "categoryId": "c3b1a2d4-...",
  "qualificationId": "1Z0-071-JPN",
  "categoryName": "SELECT文の基礎",
  "sortOrder": 1,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "createdBy": "SYSTEM",
  "updatedAt": "2026-06-01T00:00:00.000Z",
  "updatedBy": "SYSTEM"
}
```

## 4. 利用API

- [API-02 カテゴリ一覧取得](../../02_API設計/個別API設計書/API-02_カテゴリ一覧取得.md)（Query）
- [API-05 問題インポート](../../02_API設計/個別API設計書/API-05_問題インポート.md)（`categoryName` 未存在時の新規作成、Phase3）

## 5. 備考

- `categoryName` はインポート時に資格内で重複しないよう、Lambda側で既存カテゴリの検索（GSI Query + 名称一致）を行ってから新規作成するかを判定する。
- 共通項目は監査用の内部項目であり、[API-02](../../02_API設計/個別API設計書/API-02_カテゴリ一覧取得.md) のレスポンスには含めない。
