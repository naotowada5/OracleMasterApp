/**
 * ルーティング定義と未認証ガード。
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/画面遷移図.md
 *             01_docs/02_sd/01_画面設計/画面一覧.md
 *
 * S-03〜S-09 は認証必須。未ログインでアクセスした場合は S-01 へリダイレクトし、
 * ログイン後に元の遷移先へ復帰させる。
 */
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Loading } from '../components/Feedback';
import { LoginPage } from '../pages/LoginPage';
import { SignUpPage } from '../pages/SignUpPage';
import { HomePage } from '../pages/HomePage';
import { ImportPage } from '../pages/ImportPage';
import { ExamSettingsPage } from '../pages/ExamSettingsPage';
import { ExamPage } from '../pages/ExamPage';
import { ExplanationPage } from '../pages/ExplanationPage';
import { QuestionBrowsePage } from '../pages/QuestionBrowsePage';
import { ResultPage } from '../pages/ResultPage';

/** 認証必須画面のガード */
function RequireAuth({ children }: { children: ReactElement }) {
  const { user, isRestoring } = useAuth();
  const location = useLocation();

  // セッション復元中に判定するとログイン済みでもログイン画面へ飛んでしまう
  if (isRestoring) {
    return <Loading label="セッションを確認しています…" />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/** 認証済みユーザーがログイン画面等へ来た場合はホームへ戻す */
function RedirectIfAuthenticated({ children }: { children: ReactElement }) {
  const { user, isRestoring } = useAuth();

  if (isRestoring) {
    return <Loading label="セッションを確認しています…" />;
  }
  return user ? <Navigate to="/" replace /> : children;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* S-01 / S-02: 認証不要 */}
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/signup"
        element={
          <RedirectIfAuthenticated>
            <SignUpPage />
          </RedirectIfAuthenticated>
        }
      />

      {/* S-03〜S-09: 認証必須 */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/import"
        element={
          <RequireAuth>
            <ImportPage />
          </RequireAuth>
        }
      />
      <Route
        path="/exam/settings"
        element={
          <RequireAuth>
            <ExamSettingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/exam"
        element={
          <RequireAuth>
            <ExamPage />
          </RequireAuth>
        }
      />
      <Route
        path="/exam/explanation"
        element={
          <RequireAuth>
            <ExplanationPage />
          </RequireAuth>
        }
      />
      <Route
        path="/questions"
        element={
          <RequireAuth>
            <QuestionBrowsePage />
          </RequireAuth>
        }
      />
      <Route
        path="/result/:sessionId"
        element={
          <RequireAuth>
            <ResultPage />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
