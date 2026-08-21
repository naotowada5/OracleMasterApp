# T-01 OR_M_QUALIFICATION（資格マスタ）

| 項目 | 内容 |
|---|---|
| テーブル名 | OR_M_QUALIFICATION |
| テーブル種類 | M（マスタテーブル） |
| 概要 | Oracle Master の各資格（Bronze DBA / Silver SQL / Silver DBA / Gold DBA 等）を管理するマスタ |
| Phase | Phase 1 |
| プライマリキー | `qualificationId`（パーティションキーのみ、ソートキーなし） |
| GSI | なし（件数が少ないためScan運用） |

## 1. 属性定義

| 属性名 | 型 | キー | 必須 | 説明 |
|---|---|---|---|---|
| qualificationId | String | PK | 必須 | 資格コード。例: `1Z0-085-JPN`（Oracle公式試験コードをそのまま利用） |
| name | String | | 必須 | 資格名称。例: `Oracle Master Bronze DBA` |
| level | String | | 必須 | `bronze` / `silver` / `gold` の列挙値 |
| isActive | Boolean | | 必須 | 有効/無効フラグ。無効化された資格は一覧・出題対象から除外 |
| createdAt | String | | 必須 | 【共通項目・登録日】ISO 8601形式の作成日時 |
| createdBy | String | | 必須 | 【共通項目・登録者】初期データ投入スクリプト経由のため通常は `SYSTEM` |
| updatedAt | String | | 必須 | 【共通項目・更新日】ISO 8601形式の最終更新日時 |
| updatedBy | String | | 必須 | 【共通項目・更新者】通常は `SYSTEM` |

共通項目（`createdAt` / `createdBy` / `updatedAt` / `updatedBy`）の設定規則は [テーブル一覧](../テーブル一覧.md) §共通項目を参照。

## 2. サンプルアイテム

```json
{
  "qualificationId": "1Z0-085-JPN",
  "name": "Oracle Master Bronze DBA",
  "level": "bronze",
  "isActive": true,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "createdBy": "SYSTEM",
  "updatedAt": "2026-06-01T00:00:00.000Z",
  "updatedBy": "SYSTEM"
}
```

## 3. 初期データ（要件定義書 §1.4 準拠）

| qualificationId | name | level |
|---|---|---|
| 1Z0-085-JPN | Oracle Master Bronze DBA | bronze |
| 1Z0-071-JPN | Oracle Master Silver SQL | silver |
| 1Z0-082-JPN | Oracle Master Silver DBA | silver |
| 1Z0-083-JPN | Oracle Master Gold DBA | gold |

## 4. 利用API

- [API-01 資格一覧取得](../../02_API設計/個別API設計書/API-01_資格一覧取得.md)（参照）
- [API-02](../../02_API設計/個別API設計書/API-02_カテゴリ一覧取得.md), [API-03](../../02_API設計/個別API設計書/API-03_問題一覧取得.md), [API-04](../../02_API設計/個別API設計書/API-04_ランダム出題リスト生成.md), [API-05](../../02_API設計/個別API設計書/API-05_問題インポート.md)（存在チェックのための参照）

## 5. 備考

- 件数が4件程度（Phase1想定）と少ないため、GSIは作成せずScanで全件取得する運用とする（要件定義書 §6.3）。
- 新規資格（例: Oracle 26 AI関連資格）追加時は開発者スクリプトによりレコードを追加する。
- 共通項目は監査用の内部項目であり、[API-01](../../02_API設計/個別API設計書/API-01_資格一覧取得.md) のレスポンスには含めない。
