# 14_script — 初期データ投入スクリプト

問題データを DynamoDB に投入する開発者向けスクリプト。Phase 3 で問題インポート API（[API-05](../01_docs/02_sd/02_API設計/個別API設計書/API-05_問題インポート.md)）が実装されるまで、Phase 1・Phase 2 における唯一のデータ投入手段となる（要件定義書 §2.2）。

対応タスク: [開発タスク一覧](../01_docs/03_dev/開発タスク一覧.md) Step 3（T3-1〜T3-4）

## 構成

```
src/
  import-questions.mjs   投入スクリプト本体
  schema.mjs             インポートJSONの検証
  purge.mjs              マスタデータの全削除（作り直し用）
data/
  1Z0-071-JPN.json       Oracle Master Silver SQL
  1Z0-082-JPN.json       Oracle Master Silver DBA
  1Z0-085-JPN.json       Oracle Master Bronze DBA
tests/
  schema.test.mjs        バリデータの単体テスト
```

## データ形式

`data/` のJSONは、要件定義書 §7.2「問題インポート用 JSON スキーマ」に準拠する。**Phase 3 の API-05 が受け取るフォーマットと同一**であり、将来インポートUIを実装した際もこのファイルをそのまま流し込める。

```json
{
  "qualificationId": "1Z0-082-JPN",
  "qualificationName": "Oracle Master Silver DBA",
  "level": "silver",
  "questions": [
    {
      "categoryName": "Oracleインスタンスの構造",
      "questionText": "問題文",
      "questionType": "multiple",
      "difficulty": "medium",
      "explanation": "解説テキスト",
      "choices": [
        { "label": "A", "choiceText": "選択肢A", "isCorrect": true },
        { "label": "B", "choiceText": "選択肢B", "isCorrect": false }
      ]
    }
  ]
}
```

`qualificationName` と `level` は本スクリプト独自の拡張で、資格マスタ（`OR_M_QUALIFICATION`）も同時に登録するために使う。API-05 のスキーマには無い項目のため、Phase 3 でインポートUIに流用する際は無視される。

### 検証される制約

`npm run validate` で以下を確認する（[T-04 §5](../01_docs/02_sd/03_データベース設計/個別エンティティ定義書/T-04_OR_M_CHOICE.md) の制約に対応）。

- `questionType` は `single` / `multiple`、`difficulty` は `easy` / `medium` / `hard`
- 選択肢は2〜10件、ラベルの重複なし
- `questionType=single` の正解はちょうど1件
- `questionType=multiple` の正解は2件以上
- `explanation` は必須（Phase 1/2 では解説を動的生成しないため）

## コマンド

依存関係の取得:

```bash
npm install
```

AWSへ接続せず検証だけ行う（データ追加時はまずこれ）:

```bash
npm run validate
```

dev 環境へ投入する:

```bash
npm run import:dev
```

特定のファイルのみ投入する:

```bash
node src/import-questions.mjs --env dev --file data/1Z0-071-JPN.json
```

バリデータの単体テスト:

```bash
npm test
```

マスタデータを全削除して作り直す（トランザクション系テーブルには触れない）:

```bash
npm run purge:dev
```

## 設計上の約束

- **投入は冪等**。IDは資格ID・問題文・ラベルから決定的に生成するため、同じデータを何度投入しても重複レコードが増えず上書きになる。問題文を変更した場合は別レコードとして登録される点に注意（その場合は `purge` してから投入し直す）
- **共通項目の登録者・更新者は `SYSTEM`**（[テーブル一覧](../01_docs/02_sd/03_データベース設計/テーブル一覧.md) §共通項目）。スクリプト経由の書き込みであり、特定のユーザーに帰属しないため
- **選択肢の共通項目は親の問題と同一値**にする（[T-04](../01_docs/02_sd/03_データベース設計/個別エンティティ定義書/T-04_OR_M_CHOICE.md) 備考）
- **`correctCount` はJSONに書かず、`isCorrect=true` の件数から自動算出する**。手入力による不整合を防ぐため
- **`categoryName` 未指定の問題は「未分類」カテゴリにまとめる**（API-05 の挙動に合わせる）

## サンプルデータについて

`data/` に入っているのは開発・結合テスト用のサンプル（計34問）であり、本番相当の分量ではない。要件定義書 §8.1 の目標は各資格500問以上で、これはリリース直前までに順次拡充する（T3-4）。

出題内容は Oracle Master Silver DBA / Silver SQL の学習範囲（インスタンス構造、プロセス・アーキテクチャ、メモリー構造、管理ツール、初期化パラメータと起動停止、論理・物理構造、SELECT文、WHERE句と演算子、ソート、結合とサブクエリ）を対象としている。

問題を追加する際は `data/` のJSONに追記し、`npm run validate` を通してから投入する。
