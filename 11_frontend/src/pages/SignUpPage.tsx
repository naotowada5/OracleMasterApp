/**
 * S-02 新規登録画面
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/個別画面設計書/S-02_新規登録画面.md
 *
 * 表示名は Cognito の `name` 属性として登録する。バックエンドは初回の
 * GET /users/me でこのクレームから OR_M_USER の displayName を作成する（API-10）。
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { confirmSignUp, resendConfirmationCode, signUp } from '../auth/cognito';
import { ErrorMessage } from '../components/Feedback';

/** S-02 §5 入力チェック仕様 */
function validateSignUp(values: {
  displayName: string;
  email: string;
  password: string;
  passwordConfirm: string;
}): string | null {
  if (values.displayName.length < 1 || values.displayName.length > 50) {
    return '表示名は1〜50文字で入力してください';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    return 'メールアドレスの形式が正しくありません';
  }
  // Cognitoのパスワードポリシー（認証・認可設計 §4）と揃える
  if (
    values.password.length < 8 ||
    !/[A-Z]/.test(values.password) ||
    !/[a-z]/.test(values.password) ||
    !/[0-9]/.test(values.password)
  ) {
    return 'パスワードは8文字以上で、英大文字・英小文字・数字を含めてください';
  }
  if (values.password !== values.passwordConfirm) {
    return 'パスワードが一致しません';
  }
  return null;
}

function toMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'UsernameExistsException':
      return 'このメールアドレスは既に登録されています';
    case 'InvalidPasswordException':
      return 'パスワードは8文字以上で、英大文字・英小文字・数字を含めてください';
    case 'CodeMismatchException':
      return '確認コードが正しくありません';
    case 'ExpiredCodeException':
      return '確認コードの有効期限が切れています。再送信してください';
    default:
      return '登録に失敗しました。時間をおいて再度お試しください';
  }
}

export function SignUpPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignUp(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const validationError = validateSignUp({ displayName, email, password, passwordConfirm });
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      await signUp(email, password, displayName);
      setStep('confirm');
      setMessage('確認コードをメールで送信しました');
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(code)) {
      setError('確認コードは数字6桁で入力してください');
      return;
    }

    setIsSubmitting(true);
    try {
      await confirmSignUp(email, code);
      // 登録完了後はログイン画面へ（S-02 §4 操作2）
      navigate('/login', {
        replace: true,
        state: { notice: '登録が完了しました。ログインしてください' },
      });
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    try {
      await resendConfirmationCode(email);
      setMessage('確認コードを再送信しました');
    } catch {
      setError('確認コードの再送信に失敗しました');
    }
  }

  return (
    <div className="auth-page">
      <h1 className="auth-page__title">新規登録</h1>

      {step === 'form' ? (
        <form onSubmit={handleSignUp} className="auth-form">
          <label className="field">
            <span className="field__label">表示名</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              required
            />
          </label>

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
              autoComplete="new-password"
              required
            />
          </label>

          <label className="field">
            <span className="field__label">パスワード（確認）</span>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          {error && <ErrorMessage message={error} />}

          <button type="submit" className="button button--primary" disabled={isSubmitting}>
            {isSubmitting ? '登録中…' : '登録する'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleConfirm} className="auth-form">
          <p>確認コードを入力してください</p>

          <label className="field">
            <span className="field__label">確認コード</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              required
            />
          </label>

          {message && <p className="feedback feedback--info">{message}</p>}
          {error && <ErrorMessage message={error} />}

          <button type="submit" className="button button--primary" disabled={isSubmitting}>
            {isSubmitting ? '確認中…' : '確認する'}
          </button>

          <button type="button" className="link" onClick={handleResend}>
            コードを再送信
          </button>
        </form>
      )}

      <div className="auth-page__links">
        <Link to="/login" className="link">
          ログイン画面へ戻る
        </Link>
      </div>
    </div>
  );
}
