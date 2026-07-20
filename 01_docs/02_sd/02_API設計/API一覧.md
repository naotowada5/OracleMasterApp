# API一覧

要件定義書 §7.1 のエンドポイント一覧をもとに、Phase・利用画面・個別設計書を整理したもの。全エンドポイントに Cognito オーソライザーを適用する（要件定義書 §7.1 注記、参照系APIも例外なし）。

| API ID | メソッド | エンドポイント | 機能 | Phase | 主な利用画面 | 個別設計書 |
|---|---|---|---|---|---|---|
| API-01 | GET | /qualifications | 資格一覧取得 | Phase 1 | S-05, S-08, S-04 | [API-01_資格一覧取得.md](個別API設計書/API-01_資格一覧取得.md) |
| API-02 | GET | /categories | カテゴリ一覧取得 | Phase 1 | S-08, S-04 | [API-02_カテゴリ一覧取得.md](個別API設計書/API-02_カテゴリ一覧取得.md) |
| API-03 | GET | /questions | 問題一覧取得（フィルタ対応） | Phase 1 | S-08 | [API-03_問題一覧取得.md](個別API設計書/API-03_問題一覧取得.md) |
| API-04 | POST | /questions/random | ランダム出題リスト生成 | Phase 1 | S-05 | [API-04_ランダム出題リスト生成.md](個別API設計書/API-04_ランダム出題リスト生成.md) |
| API-05 | POST | /questions/import | 問題インポート（JSON） | Phase 3 | S-04 | [API-05_問題インポート.md](個別API設計書/API-05_問題インポート.md) |
| API-06 | POST | /questions/generate | AI問題生成 | Phase 3 | S-04 | [API-06_AI問題生成.md](個別API設計書/API-06_AI問題生成.md) |
| API-07 | POST | /sessions | 試験セッション開始 | Phase 1 | S-05 | [API-07_試験セッション開始.md](個別API設計書/API-07_試験セッション開始.md) |
| API-08 | PUT | /sessions/{sessionId} | セッション更新（回答記録・採点） | Phase 1 | S-06, S-07 | [API-08_セッション更新.md](個別API設計書/API-08_セッション更新.md) |
| API-09 | GET | /sessions/{sessionId} | セッション取得 | Phase 1 | S-09 | [API-09_セッション取得.md](個別API設計書/API-09_セッション取得.md) |
| API-10 | GET | /users/me | ユーザー情報取得 | Phase 1 | S-03 | [API-10_ユーザー情報取得.md](個別API設計書/API-10_ユーザー情報取得.md) |

## Phase 1 実装対象

API-01, 02, 03, 04, 07, 08, 09, 10 の 8 API。

API-05（問題インポート）, API-06（AI問題生成）は Phase 3 実装であり、Phase 1 では Lambda 実装・API Gateway ルート登録を行わない（インターフェース仕様のみ本設計に記載）。

## 共通仕様

API 共通のリクエスト/レスポンス形式、認証方式、エラーレスポンス形式については [API共通設計.md](API共通設計.md) を参照。
