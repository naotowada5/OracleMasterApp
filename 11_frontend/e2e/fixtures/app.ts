/**
 * E2Eテスト共通のフィクスチャ。
 *
 * 対応設計書: 01_docs/03_dev/開発タスク一覧.md T5-2
 *
 * 2つの外部依存をテスト内で完結させる。
 *  - Cognito: 有効なセッションを localStorage に直接書き込んで復元させる。
 *    amazon-cognito-identity-js はキャッシュされたトークンが有効なら
 *    ネットワークに出ないため、実際のUser Poolを必要としない。
 *  - API: Playwright のリクエストインターセプトで置き換える。設計書どおりの
 *    レスポンスを返しつつ、送信内容を記録して検証できるようにする。
 */
import { test as base, type Page, type Route } from '@playwright/test';
import * as data from './test-data';

/** .env.e2e と一致させること */
const CLIENT_ID = 'e2etestclientid000000000000';
const USER_POOL_ID = 'ap-northeast-1_e2etest';
/** VITE_API_BASE_URL のパス部分 */
const API_PREFIX = '/api';

// ---------------------------------------------------------------- Cognito

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64').replace(/=+$/, '');
}

/**
 * 検証可能な署名を持たないダミーJWT。
 * クライアントは payload をデコードするだけで署名検証はしない（検証はAPI Gateway側）。
 */
function fakeJwt(payload: Record<string, unknown>): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return [
    base64url({ alg: 'RS256', typ: 'JWT', kid: 'e2e' }),
    base64url({
      iss: `https://cognito-idp.ap-northeast-1.amazonaws.com/${USER_POOL_ID}`,
      aud: CLIENT_ID,
      iat: nowSec,
      exp: nowSec + 3600,
      ...payload,
    }),
    'e2e-signature-not-verified',
  ].join('.');
}

/** サインイン済みの状態を作る。expiresInSec に負値を渡すと期限切れを再現できる */
export async function seedSession(page: Page, expiresInSec = 3600): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + expiresInSec;
  const username = data.TEST_USER.email;

  const idToken = fakeJwt({
    sub: data.TEST_USER.userId,
    email: data.TEST_USER.email,
    name: data.TEST_USER.displayName,
    token_use: 'id',
    exp,
  });
  const accessToken = fakeJwt({
    sub: data.TEST_USER.userId,
    username,
    token_use: 'access',
    exp,
  });

  const prefix = `CognitoIdentityServiceProvider.${CLIENT_ID}`;
  const entries: Record<string, string> = {
    [`${prefix}.LastAuthUser`]: username,
    [`${prefix}.${username}.idToken`]: idToken,
    [`${prefix}.${username}.accessToken`]: accessToken,
    [`${prefix}.${username}.refreshToken`]: 'e2e-refresh-token',
    [`${prefix}.${username}.clockDrift`]: '0',
  };

  // addInitScript はページ読み込みの前に走るため、初回描画から認証済みになる。
  // ただし遷移のたびに実行されるので、sessionStorage の目印で1度だけに絞る。
  // そうしないとログアウト後の遷移でトークンが復活してしまう。
  await page.addInitScript((seed) => {
    if (window.sessionStorage.getItem('__e2e_session_seeded__')) return;
    window.sessionStorage.setItem('__e2e_session_seeded__', '1');
    for (const [key, value] of Object.entries(seed)) {
      window.localStorage.setItem(key, value);
    }
  }, entries);
}

// ---------------------------------------------------------------- API

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body?: Record<string, unknown>;
}

interface StubMatcher {
  method: string;
  /** 完全一致の文字列、または正規表現 */
  path: string | RegExp;
}

type Responder = (route: Route, request: RecordedRequest) => Promise<void>;

/** 記録された回答（API-09 のレスポンス組み立てに使う） */
interface RecordedAnswer {
  questionId: string;
  isCorrect: boolean;
  selectedChoiceIds: string[];
}

export class ApiMock {
  readonly requests: RecordedRequest[] = [];
  readonly answers: RecordedAnswer[] = [];
  private readonly stubs: { matcher: StubMatcher; responder: Responder }[] = [];

  /** 指定APIの応答を差し替える。後から登録したものが優先される */
  stub(matcher: StubMatcher, responder: Responder): void {
    this.stubs.unshift({ matcher, responder });
  }

  /** エラーレスポンスを返させる簡易版（API共通設計 §6 のエラー形式） */
  stubError(matcher: StubMatcher, status: number, code: string, message: string): void {
    this.stub(matcher, async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code, message, details: [] } }),
      });
    });
  }

  /** 指定パスへのリクエストだけを抽出する */
  callsTo(method: string, path: string | RegExp): RecordedRequest[] {
    return this.requests.filter(
      (request) =>
        request.method === method &&
        (typeof path === 'string' ? request.path === path : path.test(request.path)),
    );
  }

  private findStub(request: RecordedRequest): Responder | undefined {
    return this.stubs.find(
      ({ matcher }) =>
        matcher.method === request.method &&
        (typeof matcher.path === 'string'
          ? matcher.path === request.path
          : matcher.path.test(request.path)),
    )?.responder;
  }

  private defaultResponse(request: RecordedRequest): unknown {
    const { method, path, query, body } = request;

    if (method === 'GET' && path === '/users/me') return data.userProfile;
    if (method === 'GET' && path === '/qualifications') return data.qualifications;

    if (method === 'GET' && path === '/categories') {
      return {
        items: data.categories.items.filter(
          (category) => category.qualificationId === query.qualificationId,
        ),
      };
    }

    if (method === 'GET' && path === '/questions') {
      // categoryId 指定時は絞り込む（S-08 §4 操作2）
      const items = query.categoryId
        ? data.questionList.items.filter((q) => q.categoryId === query.categoryId)
        : data.questionList.items;
      return { items, nextToken: null };
    }

    if (method === 'POST' && path === '/questions/random') return data.randomQuestions;
    if (method === 'POST' && path === '/sessions') return data.createdSession;

    if (method === 'PUT' && path.startsWith('/sessions/')) {
      if (body?.action === 'finish') {
        return {
          sessionStatus: 'completed',
          sessionCorrectCount: this.answers.filter((a) => a.isCorrect).length,
          finishedAt: '2026-08-23T10:02:00.000Z',
        };
      }
      const questionId = String(body?.questionId ?? '');
      const selectedChoiceIds = (body?.selectedChoiceIds as string[] | undefined) ?? [];
      const result = data.buildAnswerResult(questionId, selectedChoiceIds);
      // 同一問題への再送信は上書きし、二重計上しない（API-08 の冪等性）
      const existing = this.answers.findIndex((a) => a.questionId === questionId);
      const record = { questionId, isCorrect: result.isCorrect, selectedChoiceIds };
      if (existing >= 0) this.answers[existing] = record;
      else this.answers.push(record);
      return { ...result, sessionCorrectCount: this.answers.filter((a) => a.isCorrect).length };
    }

    if (method === 'GET' && path.startsWith('/sessions/')) {
      return data.buildSessionDetail(this.answers);
    }

    return null;
  }

  async install(page: Page): Promise<void> {
    // グロブ（**/api/**）だと Vite が配信する /src/api/*.ts まで巻き込むため、
    // APIのパス接頭辞に前方一致する URL だけを対象にする
    await page.route(
      (url) => url.pathname.startsWith(`${API_PREFIX}/`),
      async (route) => {
        const raw = route.request();
        const url = new URL(raw.url());
        const request: RecordedRequest = {
          method: raw.method(),
          path: url.pathname.slice(API_PREFIX.length),
          query: Object.fromEntries(url.searchParams),
          ...(raw.postData() ? { body: JSON.parse(raw.postData() as string) } : {}),
        };
        this.requests.push(request);

        const stub = this.findStub(request);
        if (stub) {
          await stub(route, request);
          return;
        }

        const payload = this.defaultResponse(request);
        if (payload === null) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'NOT_FOUND',
                message: `未定義のモック: ${request.method} ${request.path}`,
              },
            }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payload),
        });
      },
    );
  }
}

// ---------------------------------------------------------------- fixtures

interface AppFixtures {
  /** APIモック。テスト開始時に自動的にインストールされる */
  api: ApiMock;
  /** false にすると認証シードを行わない（未認証ガードの検証用） */
  authenticated: boolean;
}

export const test = base.extend<AppFixtures>({
  authenticated: [true, { option: true }],

  // 依存フィクスチャなしの定義。Playwright の作法として第1引数は必ず分割代入で受ける
  // eslint-disable-next-line no-empty-pattern
  api: async ({}, use) => {
    await use(new ApiMock());
  },

  page: async ({ page, api, authenticated }, use) => {
    await api.install(page);
    if (authenticated) {
      await seedSession(page);
    }
    await use(page);
  },
});

export { expect } from '@playwright/test';
export { data };
