# Postman による API 動作確認

dev 環境のAPIをPostmanから叩くための手順。

## ファイル

| ファイル | 内容 |
|---|---|
| `OracleMasterApp.postman_collection.json` | リクエスト定義（コレクション） |
| `OracleMasterApp-dev.postman_environment.json` | dev環境の変数（環境） |

## 事前準備

### 1. バックエンドをデプロイする

Postmanから叩く前に、実装済みのLambdaがdev環境に載っている必要がある。

```bash
cd 13_infra && npm run deploy:dev
```

`12_backend` のビルドが自動で走り、`OracleMasterApp-dev-Api` スタックが更新される。

### 2. 動作確認用データを投入する

`OR_M_QUALIFICATION` が空のままだと API-01 は空配列、API-02 は404を返す。確認用データの投入は次を実行する。

投入手順は [dev環境データ投入](#dev環境データ投入) を参照。

### 3. テストユーザーを用意する

[疎通確認手順](../../../13_infra/docs/疎通確認手順.md) の STEP 3・STEP 4 でCognitoにユーザーを作成し、パスワードを確定しておく。

## Postmanでの手順

1. Postman で **Import** を押し、上記2ファイルをまとめて読み込む
2. 右上の環境セレクタで **OracleMasterApp dev** を選択する
3. 環境変数を編集し、`username`（メールアドレス）と `password` を入力する
4. **「00 ログイン（IDトークン取得）」** を実行する
   - Cognito の `InitiateAuth` を直接呼び、成功するとテストスクリプトが `idToken` を環境変数に自動保存する
   - 以降のリクエストはコレクション共通のBearer認証でこのトークンを使うため、手動でヘッダを設定する必要はない
5. 各リクエストを実行する

IDトークンの有効期限は1時間。401が返るようになったら「00 ログイン」を再実行する。

## コレクションの構成

| フォルダ | 内容 |
|---|---|
| 00 ログイン | IDトークンの取得と環境変数への保存 |
| 実装済み（T2-2 参照系） | API-01 資格一覧 / API-02 カテゴリ一覧 / API-10 ユーザー情報 |
| 異常系の確認 | 401（認証なし）、400（必須パラメータ欠落）、404（資格不在）、403（Phase3ルート未登録） |
| 未実装（ダミーLambdaが応答） | 現在は該当なし（Phase1対象8APIはすべて実装済み） |

各リクエストにはテストスクリプトを入れてあり、実行すると Test Results タブで設計どおりの応答かを自動判定する。主な検証内容は次のとおり。

- 共通項目（`createdBy` / `updatedAt` / `updatedBy`）がレスポンスに含まれないこと（API共通設計 §8.1）
- API-10 は `createdAt` のみ返すこと（同 §8.1 の例外）
- API-01 が `isActive=false` の資格を除外すること
- API-02 が `sortOrder` 昇順で返すこと
- エラー時に `error.code` と `error.details` が設計どおりの形式であること

**Runner** でコレクション全体を一括実行すれば、実装済み分の回帰確認になる。

## 注意

- 環境ファイルには **パスワードを保存しないこと**。`password` は `secret` 型にしてあるが、リポジトリにコミットする値としては空のままにしておく
- `idToken` も同様に空でコミットする（ログイン実行時に自動で入る）
- `baseUrl` / `cliClientId` はスタック出力から取得した公開値であり秘匿情報ではない。環境を作り直した場合は次で最新値を確認する

```bash
aws cloudformation describe-stacks --stack-name OracleMasterApp-dev-Api --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text
```

```bash
aws cloudformation describe-stacks --stack-name OracleMasterApp-dev-Auth --query "Stacks[0].Outputs[?OutputKey=='CliTestClientId'].OutputValue" --output text
```

## dev環境データ投入

投入は `14_script` で行う（T3-1）。詳細は [14_script/README.md](../../../14_script/README.md) を参照。

```bash
cd 14_script && npm run import:dev
```
