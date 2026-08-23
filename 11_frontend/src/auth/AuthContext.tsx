/**
 * 認証状態のコンテキスト。
 *
 * 対応設計書: 01_docs/02_sd/04_共通設計/認証・認可設計.md §1
 *             01_docs/02_sd/01_画面設計/画面遷移図.md（未認証時のガード遷移）
 *
 * 状態管理は React Context と useState で構成する。Phase1 の画面数・状態量では
 * 外部の状態管理ライブラリを導入するほどの複雑さがないため。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as cognito from './cognito';
import type { CurrentUser } from './cognito';

interface AuthContextValue {
  user: CurrentUser | null;
  /** 保存済みセッションの復元中はtrue。この間はガード判定を保留する */
  isRestoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  // リロード時にCognitoの保存済みセッションから復元する
  useEffect(() => {
    let cancelled = false;
    cognito
      .restoreSession()
      .then((restored) => {
        if (!cancelled) setUser(restored);
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setUser(await cognito.signIn(email, password));
  }, []);

  const signOut = useCallback(() => {
    cognito.signOut();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isRestoring, signIn, signOut }),
    [user, isRestoring, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth は AuthProvider の内側で使用してください');
  }
  return context;
}
