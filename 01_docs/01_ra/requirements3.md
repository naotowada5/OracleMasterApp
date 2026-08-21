# Oracle Master 資格問題アプリ 要件定義書

**文書バージョン:** 1.3
**作成日:** 2026年5月19日
**改訂日:** 2026年8月18日
**ステータス:** 改訂ドラフト

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| 1.0 | 2026-05-19 | 初版作成 |
| 1.1 | 2026-07-05 | ヒアリングに基づき以下を反映:<br>・Phase1認証方式をCognitoありで確定<br>・プラットフォーム戦略をPWA/Webファーストに変更(ネイティブ化はPhase2)<br>Phase3実装と明記<br>・Phase1初期データ投入方法(開発者スクリプトによる直接投入)を明記<br>・複数選択問題の採点仕様(完全一致のみ正解)を明記<br>・画面ID(S-04〜S-09)の不整合を修正 |
| 1.2 | 2026-08-18 | 基本設計での決定を反映:<br>・DynamoDBテーブル名を命名規約 `OR_{テーブル種類}_{テーブル名}`（M=マスタ / T=トランザクション / W=ワーク）に統一（§6.1, §6.2, §6.3）<br>・全テーブルに共通項目（登録日 `createdAt` / 登録者 `createdBy` / 更新日 `updatedAt` / 更新者 `updatedBy`）を追加（§6.2） |
| 1.3 | 2026-08-18 | Lambdaランタイムを Node.js 20.x から **22.x** に変更（§5.2, §10.1）。20.x が 2026-04-30 に非推奨化され、2027-02-01 以降は関数の新規作成が不可となるため |

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [対象範囲と前提条件](#2-対象範囲と前提条件)
3. [機能要件](#3-機能要件)
4. [画面設計](#4-画面設計)
5. [システムアーキテクチャ](#5-システムアーキテクチャ)
6. [データベース設計](#6-データベース設計)
7. [API設計](#7-api設計)
8. [非機能要件](#8-非機能要件)
9. [セキュリティ要件](#9-セキュリティ要件)
10. [開発・運用方針](#10-開発運用方針)
11. [スケジュール・フェーズ計画](#11-スケジュールフェーズ計画)
12. [用語集](#12-用語集)

---

## 1. プロジェクト概要

### 1.1 目的

Oracle Master 資格取得を目指す学習者向けに、PC・スマートフォンのブラウザで手軽に問題演習ができる 1問1答形式の Web アプリケーション（PWA）を開発する。
AI を活用した問題生成機能と解説機能により、効率的な学習体験を提供することを目的とする。

### 1.2 背景

Oracle Master 資格は、日本国内での Oracle データベース技術者の標準的な資格であり、Bronze・Silver・Gold の各レベルに対応した試験が存在する。
市場に存在する既存の学習ツールは PC ブラウザ向けが多く、通勤・移動中などのスキマ時間にスマートフォンで学習できるアプリへの需要がある。まずは Web（PWA）として素早くリリースし、利用状況を見ながらネイティブアプリ化する方針とする。

### 1.3 対象ユーザー

- Oracle Master 資格取得を目指す学習者（初学者〜上級者）
- 資格保有者でリフレッシュ学習を行いたい方
- IT 系教育機関・研修担当者（将来的な法人利用も視野に入れる）

### 1.4 対応資格

| 資格名 | 資格コード | 難易度 |
|---|---|---|
| Oracle Master Bronze DBA | 1Z0-085-JPN | 入門 |
| Oracle Master Silver SQL | 1Z0-071-JPN | 中級 |
| Oracle Master Silver DBA | 1Z0-082-JPN | 中級 |
| Oracle Master Gold DBA | 1Z0-083-JPN | 上級 |

Phase1 は上記 4 資格すべてに対応する。ただし、Phase1 リリース時点で全資格分の問題データ（各資格500問以上）が揃っていない場合は、資格ごとに順次データを拡充する運用とする（[3.2 F-08](#f-08-問題インポートjson) 参照）。

> **将来対応予定:** Oracle 26 AI 関連資格など、新規資格にも順次対応予定。

---

## 2. 対象範囲と前提条件

### 2.1 対象範囲（スコープ）

**本開発フェーズ（Phase 1）の対象:**
- Web アプリ（React）。PC ブラウザ・スマートフォンブラウザ対応
- PWA 対応（Web App Manifest・Service Worker によるホーム画面追加、疑似ネイティブ UX）
- AWS サーバーレスバックエンド（API Gateway / Lambda / DynamoDB）
- ユーザー認証（Amazon Cognito）によるログイン必須設計
- 問題出題・採点・解説機能（解説は事前登録済みテキストを表示）
- 初期問題データは開発者がスクリプトにより DynamoDB へ直接投入（アプリ機能としてのインポート UI は Phase3）

**Phase 2:**
- 既存 Web（React）資産をベースにした iOS / Android ネイティブアプリ化（React Native または Flutter）
- オフライン対応（ローカルキャッシュ）

**Phase 3:**
- 問題インポート機能（JSON、アプリ内 UI からのセルフサービス投入）
- AI による問題生成支援機能（Anthropic Claude API 連携、F-09）
- 進捗管理・履歴保存（F-10）
- 学習進捗グラフ・分析機能
- プッシュ通知（学習リマインダー）

### 2.2 前提条件

- AWS アカウントが準備済みであること
- Anthropic Claude API キーが取得済みであること（Phase3 の AI 問題生成・AI オンデマンド解説機能で使用）
- アプリストア（Apple App Store / Google Play Store）への申請は Phase2 ネイティブ化以降に別途対応
- Phase1 の初期問題データ投入は開発者によるスクリプト実行を前提とし、非エンジニアによるデータ投入は行わない

---

## 3. 機能要件

### 3.1 機能一覧

| 機能 ID | 機能名 | 優先度 | Phase |
|---|---|---|---|
| F-01 | ユーザー認証（ログイン・新規登録） | 高 | Phase 1 |
| F-02 | メイン画面 | 高 | Phase 1 |
| F-03 | 問題スタート（出題設定） | 高 | Phase 1 |
| F-04 | 問題出題（1問1答） | 高 | Phase 1 |
| F-05 | 解説表示 | 高 | Phase 1 |
| F-06 | 試験結果表示 | 高 | Phase 1 |
| F-07 | 問題閲覧 | 中 | Phase 1 |
| F-08 | 問題インポート（JSON） | 中 | Phase 3 |
| F-09 | AI 問題生成 | 中 | Phase 3 |
| F-10 | 進捗管理・履歴保存 | 中 | Phase 3 |

### 3.2 機能詳細

#### F-01: ユーザー認証

- メールアドレス + パスワードによるログイン
- 新規ユーザー登録（メール認証）
- パスワードリセット機能
- Amazon Cognito によるトークン管理
- Phase1 から必須機能として実装（未ログイン状態でのアプリ利用不可）

#### F-02: メイン画面

- アプリ起動後に表示されるホーム画面
- 問題作成・インポート / 問題スタート / 問題閲覧 の 3 機能へのナビゲーションボタン
- 問題作成・インポートはPhase3で実装のため、Phase1・Phase2では非活性
- ログインユーザー名を表示

#### F-03: 問題スタート（出題設定）

- 出題する資格種別をプルダウンで選択（DynamoDB の資格マスタより動的取得）
- 出題数を数値入力（初期値は20。1～100問まで設定可能。）
- 制限時間を設定（未設定可。設定単位: 分）
- 「出題開始」ボタンで問題出題画面へ遷移
- Phase2では、試験モード（試験時間と模擬試験問題が設定）を実装予定

#### F-04: 問題出題（1問1答）

- 問題文・選択肢を画面に表示
- 単一選択問題: 選択肢タップで即時正誤判定 → 解説画面へ
- 複数選択問題: 選択肢タップで選択状態を保持し、「決定」ボタンで正誤判定 → 解説画面へ
  - **採点仕様:** 選択した選択肢の集合と正解選択肢の集合が完全に一致した場合のみ「正解」と判定する（部分点・部分正解の扱いはなし）
- 選択肢は最大 10 択まで対応
- 出題番号（例：3/20）と残り時間（制限時間設定時）を表示
- 問題はランダムに出題（設定条件に基づいてフィルタリング）

#### F-05: 解説表示

- 正解・不正解の判定表示（◯/✕ アイコンとカラー）
- 正解の選択肢のハイライト
- 詳細解説テキスト（事前登録済み）の表示
- 「次の問題へ」ボタンで次の問題へ進む
- 最終問題の場合は「結果を見る」ボタン

#### F-06: 試験結果表示

- 総問題数・正解数・不正解数・正答率を表示
- 問題別の正誤一覧（問題番号・正誤）
- 「ホームへ戻る」ボタン
- 「もう一度挑戦」ボタン（同じ設定で再挑戦。出題内容はランダムのため、前回とは違う問題が出題）

#### F-07: 問題閲覧

- 資格種別、大問でフィルタリング
- 問題一覧のリスト表示（問題文プレビュー）
- 一覧から問題押下で問題詳細画面（問題文・全選択肢・正解・解説）

#### F-08: 問題インポート（JSON）

- Phase3実装予定（アプリ内 UI からのセルフサービス投入機能）
- 既定 JSON フォーマットのファイルを選択してインポート
- インポート前にバリデーションを実行
- 成功・失敗件数をフィードバック表示
- 補足: Phase1・Phase2 の期間中は、本機能が未実装のため、問題データの投入・更新は開発者がスクリプトにより DynamoDB へ直接反映する運用とする

#### F-09: AI 問題生成

- Phase3実装予定
- 資格種別・大問カテゴリ・問題難易度・出題数を入力フォームで指定
- Anthropic Claude API に問題生成をリクエスト
- 生成された問題プレビューを表示（修正も可能）
- 「DBに保存」ボタンで Lambda 経由で DynamoDB に登録

#### F-10: 進捗管理・履歴保存

- Phase3実装予定
- 過去の問題実績をユーザごとに保存
- 実施時間を日別で管理

---

## 4. 画面設計

### 4.1 画面一覧

| 画面 ID | 画面名 | 説明 |
|---|---|---|
| S-01 | ログイン画面 | メールアドレス・パスワード入力 |
| S-02 | 新規登録画面 | ユーザー情報入力・メール認証 |
| S-03 | メイン画面 | ホーム。3つの機能へのナビゲーション |
| S-04 | 問題作成・インポート画面 | JSON インポートと AI 生成（Phase3） |
| S-05 | 出題設定画面 | 出題内容の設定 |
| S-06 | 出題画面 | 問題文と選択肢の表示 |
| S-07 | 解説画面 | 正誤判定と解説テキスト |
| S-08 | 問題閲覧画面 | 問題一覧・詳細の参照 |
| S-09 | 解答結果画面 | 試験終了後のスコア表示 |

### 4.2 画面遷移図

```
[S-01 ログイン画面]
        │ ログインボタン押下
        ▼
[S-03 メイン画面] ◄─────────────────────────────────┐
        │                                             │
        ├─[問題スタートボタン]→[S-05 出題設定画面] │
        │                          │                  │
        │                          │ 出題開始         │
        │                          ▼                  │
        │                   [S-06 出題画面] ←────────┐│
        │                          │                  ││
        │                          │ 選択肢押下        ││
        │                          ▼                  ││
        │                   [S-07 解説画面] ──────────┘│
        │                          │ 全問終了 or 時間切れ │
        │                          ▼                    │
        │                   [S-09 解答結果画面] ────────────┘
        │
        ├─[問題閲覧ボタン]→[S-08 問題閲覧画面]
        │
        └─[問題作成・インポートボタン]→[S-04 問題作成・インポート画面]（Phase3で活性化）
```

### 4.3 主要画面のワイヤーフレーム説明

#### S-05 出題設定画面
```
┌─────────────────────────┐
│  ＜ 出題設定             │
├─────────────────────────┤
│  資格種別               │
│  [▼ Bronze (1Z0-085)] │
│                         │
│  出題数                 │
│  [  20  問] （空白=全問）│
│                         │
│  制限時間               │
│  [  30  分] （空白=無制限│
│                         │
│  ┌─────────────────┐    │
│  │    出題開始      │    │
│  └─────────────────┘    │
└─────────────────────────┘
```

#### S-06 出題画面（単一選択の例）
```
┌─────────────────────────┐
│  問題 5 / 20  残り 24:31 │
├─────────────────────────┤
│  次のSQL文で正しいものは？│
│  ...（問題文）...        │
│                         │
│  A. SELECT * FROM ...   │
│  B. INSERT INTO ...     │
│  C. UPDATE SET ...      │
│  D. DELETE FROM ...     │
└─────────────────────────┘
```

#### S-06 出題画面（複数選択の例）
```
┌─────────────────────────┐
│  問題 8 / 20  残り 21:05 │
├─────────────────────────┤
│  [複数選択] 正しいものを │
│  2つ選んでください        │
│                         │
│  ☐ A. ...               │
│  ☑ B. ...               │
│  ☐ C. ...               │
│  ☑ D. ...               │
│  ☐ E. ...               │
│                         │
│  ┌────────────────┐      │
│  │      決定      │      │
│  └────────────────┘      │
└─────────────────────────┘
```

---

## 5. システムアーキテクチャ

### 5.1 全体構成

```
┌──────────────────────────────────────────────────────┐
│  クライアント（PCブラウザ / スマートフォンブラウザ, PWA）│
└─────────────────────┬────────────────────────────────┘
                      │ HTTPS / REST
                      ▼
┌──────────────────────────────────────────────────────┐
│                   AWS Cloud                          │
│
│  AWS Amplify ---------------- Webアプリホスティング   │
│     React / TypeScript（PWA）│
│                                                      │
│                                                      │
│  Amazon Cognito ──────── 認証・認可                  │
│                                                      │
│  Amazon API Gateway ───── REST エンドポイント管理     │
│         │                                            │
│         ▼                                            │
│  AWS Lambda ────────── ビジネスロジック               │
│         │                                            │
│         ├── Amazon DynamoDB ── 問題・進捗データ      │
│         ├── Amazon S3        ── 画像・JSONファイル   │
│         └── Anthropic Claude API ── AI 問題生成     │
│                                                      │
│  AWS Amplify ─────────── ホスティング・CI/CD         │
└──────────────────────────────────────────────────────┘
```

### 5.2 AWS サービス構成詳細

| サービス | 用途 | 設定概要 |
|---|---|---|
| Amazon Cognito | ユーザー認証 | User Pool + Identity Pool。JWT トークン発行 |
| Amazon API Gateway | REST API 管理 | ステージ: dev / prod。Cognito オーソライザー設定 |
| AWS Lambda | ビジネスロジック | Node.js 22.x。問題取得・採点・（Phase3）AI 問題生成・AI解説 |
| Amazon DynamoDB | データストア | オンデマンドキャパシティ。7テーブル構成 |
| Amazon S3 | ファイルストレージ | 解説画像・JSON インポートファイル保存 |
| AWS Amplify | ホスティング / CD | Web（PWA）のビルド・配布管理 |
| AWS CloudWatch | ログ・監視 | Lambda ログ収集。アラート設定 |

---

## 6. データベース設計

### 6.1 テーブル一覧

テーブル名は `OR_{テーブル種類}_{テーブル名}` の命名規約に従う。テーブル種類は `M`=マスタテーブル / `T`=トランザクションテーブル / `W`=ワークテーブルとする（Phase1 では `W` に該当するテーブルはない）。実際のデプロイ時は環境プレフィックス（`dev-` / `stg-` / `prod-`）を付与する。

| テーブル名 | 種類 | 概要 |
|---|---|---|
| OR_M_QUALIFICATION | M | 資格マスタ |
| OR_M_CATEGORY | M | 大問カテゴリマスタ |
| OR_M_QUESTION | M | 問題テーブル |
| OR_M_CHOICE | M | 選択肢テーブル |
| OR_M_USER | M | ユーザーテーブル |
| OR_T_EXAM_SESSION | T | 試験セッションテーブル |
| OR_T_ANSWER_HISTORY | T | 回答履歴テーブル |

### 6.2 テーブル詳細

#### 共通項目（全テーブル必須）

以下の4項目は全テーブルに設定する。各テーブルの属性定義にも再掲する。

| 論理名 | 属性名 | 型 | 説明 |
|---|---|---|---|
| 登録日 | createdAt | String | レコード作成日時（ISO 8601, UTC） |
| 登録者 | createdBy | String | レコードを作成した主体の識別子。認証済みAPI経由は Cognito `sub`、初期データ投入スクリプト等のシステム起因は `SYSTEM` |
| 更新日 | updatedAt | String | レコード最終更新日時（ISO 8601, UTC）。作成時は `createdAt` と同値 |
| 更新者 | updatedBy | String | レコードを最後に更新した主体の識別子。作成時は `createdBy` と同値 |

#### OR_M_QUALIFICATION（資格マスタ）

| 属性名 | 型 | キー | 説明 |
|---|---|---|---|
| qualificationId | String | PK | 例: `1Z0-085-JPN` |
| name | String | | 資格名称 例: `Oracle Master Bronze DBA` |
| level | String | | `bronze` / `silver` / `gold` |
| isActive | Boolean | | 有効/無効フラグ |
| createdAt | String | | 【共通項目】登録日（ISO 8601 形式） |
| createdBy | String | | 【共通項目】登録者 |
| updatedAt | String | | 【共通項目】更新日 |
| updatedBy | String | | 【共通項目】更新者 |

#### OR_M_CATEGORY（大問カテゴリマスタ）

| 属性名 | 型 | キー | 説明 |
|---|---|---|---|
| categoryId | String | PK | UUID |
| qualificationId | String | GSI | 資格 ID（外部参照） |
| categoryName | String | | 例: `SELECT文の基礎` |
| sortOrder | Number | | 表示順 |
| createdAt | String | | 【共通項目】登録日 |
| createdBy | String | | 【共通項目】登録者 |
| updatedAt | String | | 【共通項目】更新日 |
| updatedBy | String | | 【共通項目】更新者 |

#### OR_M_QUESTION（問題テーブル）

| 属性名 | 型 | キー | 説明 |
|---|---|---|---|
| questionId | String | PK | UUID |
| qualificationId | String | GSI | 資格 ID |
| categoryId | String | GSI | カテゴリ ID |
| questionText | String | | 問題文 |
| questionType | String | | `single` / `multiple` |
| correctCount | Number | | 複数選択時の正解数 |
| explanation | String | | 解説テキスト（事前登録） |
| difficulty | String | | `easy` / `medium` / `hard` |
| isActive | Boolean | | 公開/非公開 |
| createdAt | String | | 【共通項目】登録日 |
| createdBy | String | | 【共通項目】登録者 |
| updatedAt | String | | 【共通項目】更新日 |
| updatedBy | String | | 【共通項目】更新者 |

#### OR_M_CHOICE（選択肢テーブル）

| 属性名 | 型 | キー | 説明 |
|---|---|---|---|
| choiceId | String | PK | UUID |
| questionId | String | GSI | 問題 ID |
| label | String | | 選択肢ラベル（A / B / C ...）|
| choiceText | String | | 選択肢テキスト |
| isCorrect | Boolean | | 正解フラグ |
| sortOrder | Number | | 表示順（シャッフル用の基準順）|
| createdAt | String | | 【共通項目】登録日（親の OR_M_QUESTION と同一値） |
| createdBy | String | | 【共通項目】登録者（親の OR_M_QUESTION と同一値） |
| updatedAt | String | | 【共通項目】更新日 |
| updatedBy | String | | 【共通項目】更新者 |

#### OR_M_USER（ユーザーテーブル）

| 属性名 | 型 | キー | 説明 |
|---|---|---|---|
| userId | String | PK | Cognito Sub（UUID）|
| email | String | GSI | メールアドレス |
| displayName | String | | 表示名 |
| lastLoginAt | String | | 最終ログイン日時 |
| createdAt | String | | 【共通項目】登録日（＝初回登録日時） |
| createdBy | String | | 【共通項目】登録者 |
| updatedAt | String | | 【共通項目】更新日 |
| updatedBy | String | | 【共通項目】更新者 |

#### OR_T_EXAM_SESSION（試験セッションテーブル）

| 属性名 | 型 | キー | 説明 |
|---|---|---|---|
| sessionId | String | PK | UUID |
| userId | String | GSI | ユーザー ID |
| qualificationId | String | | 対象資格 |
| totalQuestions | Number | | 出題数 |
| correctCount | Number | | 正解数 |
| timeLimitMin | Number | | 制限時間（分）。0=無制限 |
| elapsedSec | Number | | 経過時間（秒）|
| status | String | | `in_progress` / `completed` / `expired` |
| startedAt | String | | 業務上の開始日時 |
| finishedAt | String | | 業務上の終了日時 |
| createdAt | String | | 【共通項目】登録日 |
| createdBy | String | | 【共通項目】登録者 |
| updatedAt | String | | 【共通項目】更新日 |
| updatedBy | String | | 【共通項目】更新者 |

#### OR_T_ANSWER_HISTORY（回答履歴テーブル）

| 属性名 | 型 | キー | 説明 |
|---|---|---|---|
| historyId | String | PK | UUID |
| sessionId | String | GSI | セッション ID |
| questionId | String | | 問題 ID |
| selectedChoiceIds | List | | 選択した選択肢 ID リスト |
| isCorrect | Boolean | | 正解フラグ（選択項目と正解項目の完全一致で判定） |
| answeredAt | String | | 業務上の回答日時 |
| createdAt | String | | 【共通項目】登録日 |
| createdBy | String | | 【共通項目】登録者 |
| updatedAt | String | | 【共通項目】更新日 |
| updatedBy | String | | 【共通項目】更新者 |

### 6.3 DynamoDB アクセスパターン

| アクセスパターン | テーブル / GSI | キー条件 |
|---|---|---|
| 資格一覧取得 | OR_M_QUALIFICATION | Scan（件数少） |
| 資格別問題取得（出題） | OR_M_QUESTION / GSI(qualificationId) | qualificationId = :qid |
| カテゴリ別問題取得 | OR_M_QUESTION / GSI(categoryId) | categoryId = :cid |
| 問題の選択肢取得 | OR_M_CHOICE / GSI(questionId) | questionId = :qid |
| ユーザーのセッション履歴 | OR_T_EXAM_SESSION / GSI(userId) | userId = :uid |
| セッション別回答履歴 | OR_T_ANSWER_HISTORY / GSI(sessionId) | sessionId = :sid |

---

## 7. API 設計

### 7.1 エンドポイント一覧

| メソッド | エンドポイント | 機能 | 認証 |
|---|---|---|---|
| GET | /qualifications | 資格一覧取得 | 必要 |
| GET | /categories?qualificationId={id} | カテゴリ一覧取得 | 必要 |
| GET | /questions | 問題一覧取得（フィルタ対応） | 必要 |
| POST | /questions/random | ランダム出題リスト生成 | 必要 |
| POST | /questions/import | 問題インポート（JSON、Phase3） | 必要 |
| POST | /questions/generate | AI 問題生成（Phase3） | 必要 |
| POST | /sessions | 試験セッション開始 | 必要 |
| PUT | /sessions/{sessionId} | セッション更新（回答記録） | 必要 |
| GET | /sessions/{sessionId} | セッション取得 | 必要 |
| GET | /users/me | ユーザー情報取得 | 必要 |

Phase1 は Cognito 認証を必須とするため、全エンドポイントに Cognito オーソライザーを適用する（資格・カテゴリ一覧取得のような参照系 API も含む）。

### 7.2 問題インポート用 JSON スキーマ（Phase3 実装 / Phase1初期投入時の内部フォーマットとしても使用）

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "QuestionImport",
  "type": "object",
  "required": ["qualificationId", "questions"],
  "properties": {
    "qualificationId": { "type": "string" },
    "questions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["questionText", "questionType", "choices", "explanation"],
        "properties": {
          "categoryName": { "type": "string" },
          "questionText": { "type": "string" },
          "questionType": { "enum": ["single", "multiple"] },
          "difficulty": { "enum": ["easy", "medium", "hard"] },
          "explanation": { "type": "string" },
          "choices": {
            "type": "array",
            "minItems": 2,
            "maxItems": 10,
            "items": {
              "type": "object",
              "required": ["label", "choiceText", "isCorrect"],
              "properties": {
                "label": { "type": "string" },
                "choiceText": { "type": "string" },
                "isCorrect": { "type": "boolean" }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## 8. 非機能要件

### 8.1 性能要件

| 項目 | 目標値 |
|---|---|
| API レスポンスタイム（通常時） | 500ms 以内（p95） |
| API レスポンスタイム（AI 生成・AI解説、Phase3） | 10秒 以内 |
| 同時接続ユーザー数 | 100 ユーザー（Phase 1）|
| 問題データ件数 | 各資格 500 問以上（Phase1リリース後、順次拡充可） |
| Web アプリ初回表示時間 | 3秒 以内（PWAキャッシュ利用時はそれ以下） |

### 8.2 可用性要件

| 項目 | 目標値 |
|---|---|
| サービス稼働率 | 99.5% 以上（月間） |
| 計画メンテナンス | 月 1 回・深夜帯（通知あり） |
| RTO（目標復旧時間） | 2 時間以内 |
| RPO（目標復旧時点） | 24 時間以内 |

### 8.3 スケーラビリティ

- DynamoDB オンデマンドキャパシティによる自動スケール
- Lambda 並行実行によるスケールアウト
- 将来的なユーザー増加（100 ユーザー超）に対応した設計

### 8.4 対応ブラウザ・デバイス（Phase1）

| プラットフォーム | 対応バージョン |
|---|---|
| PCブラウザ | Chrome / Edge / Safari 各最新2バージョン |
| スマートフォンブラウザ | iOS Safari 15 以上、Android Chrome 最新2バージョン |
| PWAホーム画面追加 | iOS / Android の標準ブラウザ機能で対応 |
| 画面サイズ | 5インチ〜6.7インチのスマートフォン、PC画面 |
| タブレット | 考慮するが優先度は低 |

> Phase2 でネイティブアプリ化する際は、iOS 15.0 以上 / Android 9.0（API Level 28）以上を目安とする。

### 8.5 ユーザビリティ

- 日本語 UI（全画面対応）
- フォントサイズ: 標準サイズ（アクセシビリティ設定は Phase 2）
- ダークモード: 対応（OS の設定に追従）
- オフライン: 問題データのローカルキャッシュ（Phase2で本格対応。PhaseではService WorkerによるアプリシェルキャッシュのみPhase1で対応）

---

## 9. セキュリティ要件

### 9.1 認証・認可

- Amazon Cognito による JWT 認証（アクセストークン有効期限: 1時間）
- リフレッシュトークンによる自動延長（有効期限: 30日）
- API Gateway での Cognito オーソライザー適用（全 API、Phase1から必須）
- ユーザーは自分のデータのみアクセス可能（Lambda 内でユーザー ID 検証）

### 9.2 通信セキュリティ

- 全通信 HTTPS/TLS 1.2 以上
- API Gateway に SSL 証明書設定
- クライアント証明書ピンニング（Phase 2 で検討、ネイティブアプリ化時）

### 9.3 データ保護

- DynamoDB 保存時暗号化（AWS 管理キー）
- S3 バケット: パブリックアクセス完全ブロック
- CloudTrail によるオペレーションログ記録
- 個人情報（メールアドレス等）は Cognito で管理し、DynamoDB には最小限の情報のみ保持

### 9.4 脆弱性対策

- Lambda 関数の最小権限 IAM ロール適用
- API Gateway のリクエストバリデーション設定
- Lambda での入力サニタイズ処理実装
- AWS WAF の適用（Phase 2）

---

## 10. 開発・運用方針

### 10.1 技術スタック

| レイヤー | 技術選定 | 理由 |
|---|---|---|
| フロントエンド（Phase1） | React + Web App Manifest / Service Worker（PWA） | 単一コードベースで PC・スマホブラウザに対応。素早くリリース可能 |
| フロントエンド（Phase2） | React Native または Flutter（Phase1のWeb資産をベースにネイティブ化） | ストア配信・プッシュ通知・オフライン対応を強化 |
| バックエンド | Node.js 22.x on Lambda | サーバーレス。コスト効率が高い |
| IaC | AWS CDK（TypeScript） | インフラのコード管理。再現性確保 |
| CI/CD | AWS Amplify / GitHub Actions | 自動ビルド・テスト・デプロイ |
| テスト | Jest（Unit）/ Playwright（E2E、Phase1） | Web 標準ツールチェーン |
| 初期データ投入 | Node.js スクリプト（JSON→DynamoDB 直接投入） | F-08実装前のPhase1・Phase2で使用 |

### 10.2 ブランチ戦略

```
main        ─── 本番リリース用（タグ管理）
  └── develop ─── 開発統合ブランチ
        ├── feature/xxx ─── 機能開発
        └── hotfix/xxx  ─── 緊急修正
```

### 10.3 環境構成

| 環境 | 用途 | AWS リソース |
|---|---|---|
| dev | 開発・単体テスト | DynamoDB（小容量）/ Lambda |
| stg | 結合・受入テスト | dev と同等構成 |
| prod | 本番 | オンデマンドスケール有効 |

### 10.4 監視・アラート

- CloudWatch ダッシュボードで API エラー率・Lambda 実行時間を可視化
- エラー率 5% 超過時に SNS 経由でメールアラート
- Lambda タイムアウト（30秒）超過検知

---

## 11. スケジュール・フェーズ計画

### Phase 1（初期リリース：Web / PWA）

| タスク | 期間 | 担当 |
|---|---|---|
| 要件定義確定・設計 | 2週間 | PM / Dev |
| AWS インフラ構築（CDK） | 1週間 | Infra |
| バックエンド API 開発（Cognito認証含む） | 3週間 | Backend Dev |
| Web（PWA）アプリ開発 | 4週間 | Frontend Dev |
| 初期問題データ投入（開発者スクリプト） | 並行実施 | Backend Dev |
| テスト・バグ修正 | 2週間 | QA |
| リリース | 1週間 | PM |
| **合計** | **約 13週間** | |

### Phase 2（ネイティブ化・機能拡充）

- React Native または Flutter によるネイティブアプリ化（iOS / Android ストア配信）
- 学習進捗グラフ・分析機能
- プッシュ通知（学習リマインダー）
- オフライン対応（ローカルキャッシュ本格対応）
- Oracle 26 AI 資格対応
- AWS WAF 適用

### Phase 3（AI機能・セルフサービス投入）

- 問題インポート機能（F-08、アプリ内 UI）
- AI 問題生成機能（F-09）
- 進捗管理・履歴保存（F-10）

---

## 12. 用語集

| 用語 | 説明 |
|---|---|
| 1問1答 | 1問ずつ出題し、回答後に即時フィードバックを行う出題形式 |
| 単一選択問題 | 選択肢の中から1つだけ正解を選ぶ問題 |
| 複数選択問題 | 選択肢の中から複数の正解を選ぶ問題（完全一致のみ正解） |
| PWA | Progressive Web App。Webアプリをネイティブアプリのような体験で利用できる技術 |
| AI 問題生成 | Anthropic Claude API を利用して自動で問題・解説・選択肢を生成する機能（Phase3） |
| セッション | 1回の試験開始〜終了までの単位 |
| GSI | DynamoDB の Global Secondary Index。クエリ効率化のための補助インデックス |
| IaC | Infrastructure as Code。インフラをコードで管理する手法 |
| JWT | JSON Web Token。認証に使用するトークン形式 |

---

*文書管理: 本ドキュメントは GitHub リポジトリにて管理し、変更時はバージョンを更新すること。*
