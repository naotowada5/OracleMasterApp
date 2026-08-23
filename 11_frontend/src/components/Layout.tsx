/**
 * 画面共通レイアウト。
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/画面一覧.md §画面共通仕様
 * スマートフォン〜PCまで1カラムを基本とするレスポンシブ構成。
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface LayoutProps {
  title: string;
  children: ReactNode;
  /** 戻るボタンの遷移先。指定しない場合は表示しない */
  backTo?: string;
  /** ヘッダーにログアウトを表示するか */
  showSignOut?: boolean;
}

export function Layout({ title, children, backTo, showSignOut = false }: LayoutProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  return (
    <div className="layout">
      <header className="layout__header">
        {backTo ? (
          <button type="button" className="layout__back" onClick={() => navigate(backTo)}>
            ＜
          </button>
        ) : (
          <span className="layout__back-spacer" />
        )}
        <h1 className="layout__title">{title}</h1>
        {showSignOut ? (
          <button
            type="button"
            className="layout__signout"
            onClick={() => {
              signOut();
              navigate('/login');
            }}
          >
            ログアウト
          </button>
        ) : (
          <span className="layout__back-spacer" />
        )}
      </header>
      <main className="layout__main">{children}</main>
    </div>
  );
}
