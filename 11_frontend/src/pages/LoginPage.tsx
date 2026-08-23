/**
 * S-01 ログイン画面
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/個別画面設計書/S-01_ログイン画面.md
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { confirmPassword, forgotPassword } from '../auth/cognito';
import { ErrorMessage } from '../components/Feedback';

/** Cognitoのエラーを画面表示用のメッセージに変換する（S-01 §6） */
function toMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAuthorizedException':
      return 'メールアドレスまたはパスワードが正しくありません';
    case 'UserNotFoundException':
      // ユーザーの存在有無を推測されないよう、認証失敗と同じ文言にする
      return 'メールアドレスまたはパスワードが正しくありません';
    case 'UserNotConfirmedException':
      return 'メールアドレスの確認が完了していません。確認コードを入力してください';
    case 'PasswordResetRequiredException':
      return 'パスワードのリセットが必要です。「パスワードをお忘れの方」から再設定してください';
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return '試行回数が上限に達しました。しばらく待ってから再度お試しください';
    default:
      return 'ログインに失敗しました。時間をおいて再度お試しください';
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReset, setShowReset] = useState(false);

  // 未認証ガードで飛ばされてきた場合は元の遷移先へ戻す
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }

    setIsSubmitting(true);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <h1 className="auth-page__title">ログイン</h1>

      <form onSubmit={handleSubmit} className="auth-form">
        <label className="field">
          <span className="field__label">メールアドレス</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="field">
          <span className="field__label">パスワード</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <ErrorMessage message={error} />}

        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>

      <div className="auth-page__links">
        <button type="button" className="link" onClick={() => setShowReset(true)}>
          パスワードをお忘れの方
        </button>
        <Link to="/signup" className="link">
          新規登録はこちら
        </Link>
      </div>

      {showReset && <PasswordResetModal onClose={() => setShowReset(false)} />}
    </div>
  );
}

/**
 * パスワードリセット用モーダル（S-01 §4 操作3）。
 * Phase1では専用画面を設けず、この簡易モーダルで対応する。
 */
function PasswordResetModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRequest(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await forgotPassword(email);
      setStep('confirm');
      setMessage('確認コードをメールで送信しました');
    } catch {
      setError('確認コードの送信に失敗しました');
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await confirmPassword(email, code, newPassword);
      setMessage('パスワードを再設定しました。新しいパスワードでログインしてください');
      setStep('request');
    } catch (caught) {
      const name = caught instanceof Error ? caught.name : '';
      setError(
        name === 'InvalidPasswordException'
          ? 'パスワードは8文字以上で、英大文字・英小文字・数字を含めてください'
          : '確認コードが正しくありません',
      );
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="パスワードの再設定">
      <div className="modal__content">
        <h2>パスワードの再設定</h2>

        {step === 'request' ? (
          <form onSubmit={handleRequest}>
            <label className="field">
              <span className="field__label">メールアドレス</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="button button--primary">
              確認コードを送信
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirm}>
            <label className="field">
              <span className="field__label">確認コード</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
            <label className="field">
              <span className="field__label">新しいパスワード</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="button button--primary">
              パスワードを再設定
            </button>
          </form>
        )}

        {message && <p className="feedback feedback--info">{message}</p>}
        {error && <ErrorMessage message={error} />}

        <button type="button" className="link" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
