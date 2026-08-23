/**
 * Amazon Cognito との連携。
 *
 * 対応設計書: 01_docs/02_sd/04_共通設計/認証・認可設計.md
 *             01_docs/02_sd/01_画面設計/個別画面設計書/S-01_ログイン画面.md, S-02_新規登録画面.md
 *
 * SPA用のUser Pool ClientはSRP認証のみを許可しているため、パスワードを
 * ネットワーク上に流さない amazon-cognito-identity-js の authenticateUser を使う。
 */
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

function requireEnv(name: string): string {
  const value = import.meta.env[name] as string | undefined;
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません（.env を確認してください）`);
  }
  return value;
}

let cachedPool: CognitoUserPool | undefined;

export function userPool(): CognitoUserPool {
  if (!cachedPool) {
    cachedPool = new CognitoUserPool({
      UserPoolId: requireEnv('VITE_COGNITO_USER_POOL_ID'),
      ClientId: requireEnv('VITE_COGNITO_CLIENT_ID'),
    });
  }
  return cachedPool;
}

export interface CurrentUser {
  /** Cognito sub。アプリ内の userId と同一 */
  userId: string;
  email: string;
  displayName: string;
}

function toCurrentUser(session: CognitoUserSession): CurrentUser {
  const payload = session.getIdToken().decodePayload();
  return {
    userId: String(payload.sub ?? ''),
    email: String(payload.email ?? ''),
    displayName: String(payload.name ?? payload.email ?? ''),
  };
}

function cognitoUser(email: string): CognitoUser {
  return new CognitoUser({ Username: email, Pool: userPool() });
}

/** サインイン（S-01） */
export function signIn(email: string, password: string): Promise<CurrentUser> {
  return new Promise((resolve, reject) => {
    cognitoUser(email).authenticateUser(
      new AuthenticationDetails({ Username: email, Password: password }),
      {
        onSuccess: (session) => resolve(toCurrentUser(session)),
        onFailure: (error: Error) => reject(error),
      },
    );
  });
}

/** サインアップ（S-02 第1ステップ）。表示名は `name` 属性として登録する */
export function signUp(email: string, password: string, displayName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    userPool().signUp(
      email,
      password,
      [
        new CognitoUserAttribute({ Name: 'email', Value: email }),
        new CognitoUserAttribute({ Name: 'name', Value: displayName }),
      ],
      [],
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

/** 確認コードの検証（S-02 第2ステップ） */
export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cognitoUser(email).confirmRegistration(code, true, (error) =>
      error ? reject(error) : resolve(),
    );
  });
}

/** 確認コードの再送信 */
export function resendConfirmationCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cognitoUser(email).resendConfirmationCode((error) => (error ? reject(error) : resolve()));
  });
}

/** パスワードリセットの開始（S-01 のモーダル） */
export function forgotPassword(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cognitoUser(email).forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (error: Error) => reject(error),
    });
  });
}

/** パスワードリセットの確定 */
export function confirmPassword(email: string, code: string, newPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cognitoUser(email).confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (error: Error) => reject(error),
    });
  });
}

/**
 * 有効なIDトークンを取得する。
 *
 * getSession はトークンの有効期限が切れている場合、リフレッシュトークンを使って
 * 自動的に更新する（認証・認可設計 §1）。リフレッシュも失敗した場合は reject する。
 */
export function currentIdToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const user = userPool().getCurrentUser();
    if (!user) {
      reject(new Error('サインインしていません'));
      return;
    }
    user.getSession((error: Error | null, session: CognitoUserSession | null) => {
      if (error || !session?.isValid()) {
        reject(error ?? new Error('セッションが無効です'));
        return;
      }
      resolve(session.getIdToken().getJwtToken());
    });
  });
}

/** 保存済みセッションから現在のユーザーを復元する。未サインインなら null */
export function restoreSession(): Promise<CurrentUser | null> {
  return new Promise((resolve) => {
    const user = userPool().getCurrentUser();
    if (!user) {
      resolve(null);
      return;
    }
    user.getSession((error: Error | null, session: CognitoUserSession | null) => {
      resolve(error || !session?.isValid() ? null : toCurrentUser(session));
    });
  });
}

/** サインアウト。保持しているトークンを破棄する */
export function signOut(): void {
  userPool().getCurrentUser()?.signOut();
}
