# 11_frontend — React PWA

Oracle Master 資格問題アプリのフロントエンド（Phase1）。React 18 + TypeScript + Vite。

対応設計書は `01_docs/02_sd/01_画面設計/` 配下。画面 S-01〜S-09 を実装している。

## セットアップ

```bash
npm install
```

`.env.example` を `.env` にコピーし、デプロイ済み環境の値を入れる。値は
`13_infra` のデプロイ出力（CloudFormation の Outputs）から取得できる。

| 変数 | 内容 |
| --- | --- |
| `VITE_API_BASE_URL` | API Gateway のステージURL |
| `VITE_COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `VITE_COGNITO_CLIENT_ID` | SPA用アプリクライアントID |

`.env` は機密を含むためコミットしない（`.gitignore` 済み）。

## コマンド

```bash
npm run dev
```

開発サーバを http://localhost:5173 で起動する。ポートは API Gateway の
CORS 許可オリジンと揃えているため変更しないこと
（`13_infra/lib/config/environments.ts` の `LOCAL_DEV_ORIGIN`）。

```bash
npm test
npm run typecheck
npm run build
```

## E2Eテスト（T5-2）

```bash
npm run test:e2e
```

Playwright で `e2e/` 配下を実行する。初回のみブラウザの取得が必要。

```bash
npx playwright install chromium
```

### 実行方式

テストは `--mode e2e` で起動した専用の開発サーバ（ポート5174）に対して走る。
このモードでは `.env.e2e` が `.env` を上書きするため、**AWS環境にも認証情報にも
依存しない**。CI でもローカルでも同じ結果になる。

外部依存の置き換え方は 2 つある。

- **Cognito**: `e2e/fixtures/app.ts` の `seedSession()` が、有効期限内のダミー
  トークンを `localStorage` に直接書き込む。`amazon-cognito-identity-js` は
  キャッシュ済みトークンが有効ならネットワークに出ないため、実在の User Pool を
  必要としない。署名は検証されない（検証は API Gateway 側の責務）。
- **API**: `ApiMock` が `/api/` 配下のリクエストをインターセプトし、各API設計書
  どおりのレスポンスを返す。送信内容は記録され、`api.callsTo()` で検証できる。
  個別テストで応答を差し替えるときは `api.stub()` / `api.stubError()` を使う。

### プロジェクト構成

要件定義書 §8.4 の対応ブラウザを網羅する。

| プロジェクト | 対象 | エンジン |
| --- | --- | --- |
| `chromium` | PC Chrome | Chromium |
| `edge` | PC Edge（実機のチャネルを使用） | Chromium |
| `webkit` | PC Safari | WebKit |
| `mobile` | Android Chrome（375×812） | Chromium |
| `mobile-safari` | iOS Safari（iPhone 13） | WebKit |

Firefox は対応表に含まれないため既定では実行しない。有効にするには
`PW_FIREFOX=1` を付ける。ただし Playwright 同梱の Firefox は起動に Microsoft
Visual C++ 再頒布可能パッケージを要求し、未導入の Windows では
`browserType.launch: spawn UNKNOWN` で失敗する。

### テストの内容

| ファイル | 確認内容 |
| --- | --- |
| `e2e/auth-guard.spec.ts` | S-03〜S-09 の未認証ガード、ログアウト時のトークン破棄、401時の挙動 |
| `e2e/exam-flow.spec.ts` | S-03→S-05→S-06→S-07→S-09 の通し操作、部分正解時の赤枠表示、S-09 の問題別詳細、S-08 の絞り込み |
| `e2e/abnormal.spec.ts` | 入力チェック、多重送信、制限時間切れ、未回答、取得失敗からの復帰 |
| `e2e/layout.spec.ts` | 横スクロールが出ないこと、PWAマニフェスト |

### 注意点

- 開発サーバは React の StrictMode で動くため `useEffect` が2回走る。呼び出し
  **回数**に依存したモックを書くと不安定になるので、明示的なフラグで切り替える。
- APIモックのURLマッチにグロブ（`**/api/**`）を使うと、Vite が配信する
  `/src/api/*.ts` まで巻き込んでアプリが起動しなくなる。パス前方一致で判定している。

## 非機能テスト（T5-3）

```bash
npm run test:perf
```

**本番ビルドを配信して**計測する（Service Worker は `import.meta.env.PROD` の
ときだけ登録されるため、開発サーバでは PWA を確認できない）。確認するのは
初回表示時間、オフライン起動、マニフェストのアイコン実在、APIレスポンスを
キャッシュしないこと。

## PWAアイコン

`public/icons/` の2ファイルは `scripts/generate-icons.mjs` で生成している。
画像ライブラリを増やさずに済むよう、Node標準の zlib だけでPNGを組み立て、
4倍のスーパーサンプリングで輪郭を滑らかにしている。

```bash
node scripts/generate-icons.mjs          # 採用案を public/icons/ へ出力
node scripts/generate-icons.mjs --all    # 全案を public/icons/candidates/ へ出力
```

採用しているのは「問題カード＋チェック」（`card`）。デザインを変える場合は
スクリプト内の `DESIGNS` に追加し、`ADOPTED` を差し替える。色は `global.css`
の `--color-primary` / `--color-correct` と揃えてある。maskable アイコンでは
外周が切り取られるため、要素は中央80%に収めること。

## 既知の環境問題（Windows + Node.js 24）

本プロジェクトの想定ランタイムは **Node.js 22.x**（`.nvmrc`）。Node.js 24 系の
Windows 版には、**パスに非ASCII文字を含むディレクトリを `fs.rm` /`fs.rmSync` の
`recursive: true` で削除するとプロセスごと落ちる**不具合がある（終了コード
0xC0000409。エラーではなく即死するため try/catch では拾えない）。本リポジトリの
パスは `資格問題アプリ` を含むため直撃する。

Vite の `emptyOutDir` がこの API を使っており、`dist` に1ファイルでも残っていると
`vite build` が必ず失敗する。回避のため `npm run build` の先頭で
`scripts/clean.mjs` を実行し、`fs.rmSync` を使わずに `dist` を削除している。
Node.js 22 に揃えればこのスクリプトは不要になる。
