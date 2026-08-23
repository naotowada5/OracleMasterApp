/**
 * S-09 解答結果画面
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/個別画面設計書/S-09_解答結果画面.md
 *
 * 不正解数は「総問題数 − 正解数」で算出する。時間切れ等で未回答となった問題も
 * 不正解として計上される（S-09 §3）。
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toDisplayMessage } from '../api/client';
import { getSession } from '../api/endpoints';
import type { SessionAnswer, SessionDetail } from '../api/endpoints';
import { AnsweredChoices } from '../components/AnsweredChoices';
import { Layout } from '../components/Layout';
import { ErrorMessage, Loading } from '../components/Feedback';

export function ResultPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  /** 一覧から選択した問題。null なら一覧表示（S-09 §4 操作2） */
  const [selected, setSelected] = useState<SessionAnswer | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setIsLoading(true);

    getSession(sessionId)
      .then((detail) => {
        if (!cancelled) {
          setSession(detail);
          setError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(toDisplayMessage(caught));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, reloadKey]);

  if (isLoading) {
    return (
      <Layout title="結果" backTo="/">
        <Loading />
      </Layout>
    );
  }

  if (error || !session) {
    return (
      <Layout title="結果" backTo="/">
        <ErrorMessage
          message={error ?? '結果の取得に失敗しました'}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </Layout>
    );
  }

  const incorrectCount = session.totalQuestions - session.correctCount;
  const accuracy =
    session.totalQuestions > 0
      ? Math.round((session.correctCount / session.totalQuestions) * 100)
      : 0;

  // 問題別詳細（S-09 §4 操作2）。取得済みデータから表示し、追加のAPI呼び出しはしない
  if (selected) {
    const questionNo = session.answers.indexOf(selected) + 1;
    const correctChoiceIds = selected.choices
      .filter((choice) => choice.isCorrect)
      .map((choice) => choice.choiceId);

    return (
      <Layout title={`問題 ${questionNo} の詳細`}>
        <button type="button" className="link" onClick={() => setSelected(null)}>
          ＜ 結果一覧に戻る
        </button>

        <p
          className={`judgement ${selected.isCorrect ? 'judgement--correct' : 'judgement--wrong'}`}
        >
          {selected.isCorrect ? '◯ 正解' : '✕ 不正解'}
        </p>

        <p className="exam__question-text">{selected.questionText}</p>

        <AnsweredChoices
          choices={selected.choices}
          correctChoiceIds={correctChoiceIds}
          selectedChoiceIds={selected.selectedChoiceIds}
        />

        <section className="explanation">
          <h2 className="explanation__title">解説</h2>
          <p className="explanation__body">
            {selected.explanation.length > 0 ? selected.explanation : '解説は準備中です'}
          </p>
        </section>
      </Layout>
    );
  }

  return (
    <Layout title="結果" backTo="/">
      {/* 異常系: 未終了のまま結果画面に到達した場合（S-09 §6） */}
      {session.status === 'in_progress' && (
        <p className="feedback feedback--warning">
          このセッションはまだ終了していません。取得できた範囲で表示しています。
        </p>
      )}

      <dl className="result__summary">
        <div>
          <dt>総問題数</dt>
          <dd>{session.totalQuestions}</dd>
        </div>
        <div>
          <dt>正解数</dt>
          <dd>{session.correctCount}</dd>
        </div>
        <div>
          <dt>不正解数</dt>
          <dd>{incorrectCount}</dd>
        </div>
        <div>
          <dt>正答率</dt>
          <dd>{accuracy}%</dd>
        </div>
      </dl>

      <section className="result__answers">
        <h2 className="result__answers-title">問題別正誤</h2>
        <ul className="result__grid">
          {session.answers.map((answer, index) => (
            <li key={answer.questionId}>
              <button
                type="button"
                className={`result__cell result__cell--clickable ${answer.isCorrect ? 'result__cell--correct' : 'result__cell--wrong'}`}
                onClick={() => setSelected(answer)}
                aria-label={`問題${index + 1}（${answer.isCorrect ? '正解' : '不正解'}）の詳細を見る`}
              >
                <span className="result__cell-no">Q{index + 1}</span>
                <span className="result__cell-mark">{answer.isCorrect ? '◯' : '✕'}</span>
              </button>
            </li>
          ))}
          {/* 未回答分（回答履歴が無い問題）は✕扱いで表示する（S-09 §6）。
              詳細を持たないため押下不可とする */}
          {Array.from({ length: Math.max(0, session.totalQuestions - session.answers.length) }).map(
            (_, index) => (
              <li key={`unanswered-${index}`}>
                <span className="result__cell result__cell--wrong result__cell--unanswered">
                  <span className="result__cell-no">Q{session.answers.length + index + 1}</span>
                  <span className="result__cell-mark">✕</span>
                </span>
              </li>
            ),
          )}
        </ul>
      </section>

      <div className="result__actions">
        <button
          type="button"
          className="button button--primary button--large"
          onClick={() => navigate('/exam/settings')}
        >
          もう一度挑戦
        </button>
        <button type="button" className="button button--large" onClick={() => navigate('/')}>
          ホームへ戻る
        </button>
      </div>
    </Layout>
  );
}
