# API-01 資格一覧取得

| 項目 | 内容 |
|---|---|
| メソッド / パス | `GET /qualifications` |
| Phase | Phase 1 |
| 認証 | 必要（Cognito） |
| 利用画面 | S-05, S-08, S-04（Phase3） |
| 関連テーブル | QualificationMaster |

## 1. 概要

有効な資格（Bronze DBA / Silver SQL / Silver DBA / Gold DBA 等）の一覧を取得する。件数が少ないため DynamoDB は Scan で取得する（要件定義書 §6.3）。

## 2. リクエスト

### クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| なし | - | - | - |

## 3. レスポンス

### 200 OK

```json
{
  "items": [
    {
      "qualificationId": "1Z0-085-JPN",
      "name": "Oracle Master Bronze DBA",
      "level": "bronze",
      "isActive": true
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `items[].qualificationId` | String | 資格ID |
| `items[].name` | String | 資格名称 |
| `items[].level` | String | `bronze` / `silver` / `gold` |
| `items[].isActive` | Boolean | 有効フラグ |

`isActive=false` の資格はレスポンスから除外する（クライアント側でのフィルタではなく、Lambda側で除外して返す）。

## 4. 処理フロー

1. API Gateway が Cognito トークンを検証。
2. Lambda が `QualificationMaster` テーブルを Scan。
3. `isActive=true` のレコードのみ抽出し、`name` の五十音/コード順など既定の並び順でソートして返却する。

## 5. エラー

| ステータス | コード | 条件 |
|---|---|---|
| 401 | `UNAUTHORIZED` | トークン無効 |
| 500 | `INTERNAL_ERROR` | DynamoDB Scan 失敗等 |

## 6. 備考

- 件数が少ない前提（要件定義書 §6.3）のため、ページングは実装しない。
