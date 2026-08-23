/**
 * エラー表示とローディング表示の共通部品。
 *
 * 対応設計書: 01_docs/02_sd/04_共通設計/エラーハンドリング方針.md §2.3
 */
import type { ApiErrorDetail } from '../api/client';

export function Loading({ label = '読み込み中…' }: { label?: string }) {
  return (
    <p className="feedback feedback--loading" role="status">
      {label}
    </p>
  );
}

interface ErrorMessageProps {
  message: string;
  /** フィールド単位のバリデーションエラー（API共通設計 §4.2） */
  details?: ApiErrorDetail[];
  /** 再試行ボタンを表示する場合のハンドラ */
  onRetry?: () => void;
}

export function ErrorMessage({ message, details, onRetry }: ErrorMessageProps) {
  return (
    <div className="feedback feedback--error" role="alert">
      <p>{message}</p>
      {details && details.length > 0 && (
        <ul className="feedback__details">
          {details.map((detail) => (
            <li key={`${detail.field}-${detail.reason}`}>
              {detail.field}: {detail.reason}
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry}>
          再読み込み
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="feedback feedback--empty">{message}</p>;
}
