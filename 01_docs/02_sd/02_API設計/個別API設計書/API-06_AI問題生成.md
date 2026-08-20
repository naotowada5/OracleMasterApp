# API-06 AI問題生成

| 項目 | 内容 |
|---|---|
| メソッド / パス | `POST /questions/generate` |
| Phase | Phase 3（本設計はインターフェース定義のみ。Phase1・Phase2では未実装） |
| 認証 | 必要（Cognito） |
| 利用画面 | S-04（Phase3） |
| 関連テーブル | OR_M_QUESTION, OR_M_CHOICE（保存時のみ） |
| 外部連携 | Anthropic Claude API |

> **注意:** Phase 1・Phase 2 では Lambda 実装・API Gateway ルート登録を行わない。

## 1. 概要

資格種別・大問カテゴリ・難易度・出題数を指定して Anthropic Claude API に問題生成をリクエストし、生成結果をプレビュー用に返却する。DB への保存はクライアントでの編集後、別途保存要求（本APIのモード切替、または専用の保存確定ステップ）で行う。

## 2. リクエスト

### ボディ

```json
{
  "qualificationId": "1Z0-071-JPN",
  "categoryName": "SELECT文の基礎",
  "difficulty": "medium",
  "count": 5,
  "mode": "preview"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `qualificationId` | String | 必須 | |
| `categoryName` | String | 任意 | 未指定時はAIにカテゴリ提案もあわせて依頼 |
| `difficulty` | String | 必須 | `easy` / `medium` / `hard` |
| `count` | Number | 必須 | 1〜20 |
| `mode` | String | 必須 | `preview`（生成のみ）/ `save`（S-04で編集確定後にDB保存） |
| `questions`（`mode=save` 時のみ） | Array | 条件付き必須 | プレビュー後にユーザーが編集した問題データ（[API-05](API-05_問題インポート.md) と同一スキーマ） |

## 3. レスポンス

### 200 OK（`mode=preview`）

```json
{
  "generated": [
    {
      "questionText": "次のSQL文で正しいものはどれか。",
      "questionType": "single",
      "explanation": "...",
      "choices": [
        { "label": "A", "choiceText": "...", "isCorrect": true }
      ]
    }
  ]
}
```

### 200 OK（`mode=save`）

```json
{
  "savedCount": 5,
  "questionIds": ["q-uuid-1", "q-uuid-2"]
}
```

## 4. 処理フロー

1. 入力バリデーション（`count` は 1〜20。要件定義書 §8.1 の AI 生成APIレスポンス目標 10秒以内を考慮した上限）。
2. `mode=preview` の場合: プロンプトを組み立て Anthropic Claude API を呼び出し、生成結果をパースしてレスポンスとして返す（DynamoDB へは未保存）。
3. `mode=save` の場合: リクエストで受け取った編集済み問題データを [API-05 問題インポート](API-05_問題インポート.md) と同様のロジックで `OR_M_QUESTION`/`OR_M_CHOICE` に登録する。

## 5. エラー

| ステータス | コード | 条件 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `count` が範囲外、`mode` 不正 |
| 401 | `UNAUTHORIZED` | トークン無効 |
| 500 | `INTERNAL_ERROR` | DynamoDB書き込み失敗（`mode=save`時） |
| 503 | `EXTERNAL_SERVICE_ERROR` | Anthropic Claude API の障害・タイムアウト |

## 6. 備考

- Lambda のタイムアウトは要件定義書 §8.1（AI系APIレスポンス10秒以内）および §10.4（Lambdaタイムアウト30秒超過検知）を踏まえて設定する。
- Anthropic Claude API キーは Lambda の環境変数またはAWS Secrets Managerで管理し、コードにハードコードしない（要件定義書 §9.4 最小権限方針に準拠）。
