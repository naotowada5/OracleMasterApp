# API-02 カテゴリ一覧取得

| 項目 | 内容 |
|---|---|
| メソッド / パス | `GET /categories?qualificationId={id}` |
| Phase | Phase 1 |
| 認証 | 必要（Cognito） |
| 利用画面 | S-08, S-04（Phase3） |
| 関連テーブル | OR_M_CATEGORY |

## 1. 概要

指定した資格に紐づく大問カテゴリの一覧を取得する。

## 2. リクエスト

### クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `qualificationId` | String | 必須 | 資格ID（例: `1Z0-085-JPN`） |

## 3. レスポンス

### 200 OK

```json
{
  "items": [
    {
      "categoryId": "b3f1c2...",
      "qualificationId": "1Z0-085-JPN",
      "categoryName": "SELECT文の基礎",
      "sortOrder": 1
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `items[].categoryId` | String | カテゴリID（UUID） |
| `items[].qualificationId` | String | 資格ID |
| `items[].categoryName` | String | カテゴリ名 |
| `items[].sortOrder` | Number | 表示順 |

`sortOrder` 昇順でソートして返却する。

## 4. 処理フロー

1. `qualificationId` の必須チェック。
2. `OR_M_CATEGORY` テーブルの GSI（`qualificationId`）に対して Query。
3. `sortOrder` 昇順にソートして返却。

## 5. エラー

| ステータス | コード | 条件 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `qualificationId` 未指定 |
| 401 | `UNAUTHORIZED` | トークン無効 |
| 404 | `NOT_FOUND` | 指定した `qualificationId` が `OR_M_QUALIFICATION` に存在しない（該当資格自体が無い場合。カテゴリが0件の場合は空配列を返し404にはしない） |
| 500 | `INTERNAL_ERROR` | DynamoDB Query 失敗等 |

## 6. 備考

- 「すべて」フィルタ（S-08）はクライアント側で `qualificationId` のみ指定しカテゴリ絞り込みを行わないことで実現する（本APIへの `categoryId` 指定は不要）。
