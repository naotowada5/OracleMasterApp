/**
 * S-06 出題画面
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/個別画面設計書/S-06_出題画面.md
 *
 * 単一選択は選択肢タップで即時送信、複数選択は「決定」ボタンで送信する。
 * **正誤判定はクライアントで行わず、必ず API-08 の結果を使う**
 * （クライアントに正解を渡さない設計。要件定義書 §9.1）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toDisplayMessage } from '../api/client';
import { finishSession, submitAnswer } from '../api/endpoints';
import { Layout } from '../components/Layout';
import { ErrorMessage } from '../components/Feedback';
import { useExam } from '../exam/ExamContext';

/** 残り時間を mm:ss 形式にする */
function formatRemaining(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const mm = String(Math.floor(clamped / 60)).padStart(2, '0');
  const ss = String(clamped % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function ExamPage() {
  const navigate = useNavigate();
  const { exam, setLastResult, dismissStartupWarning, clearExam } = useExam();

  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const question = exam?.questions[exam.currentIndex];

  // 経過時間の計測（制限時間ありの場合の残り時間表示にも使う）
  useEffect(() => {
    if (!exam) return;
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - exam.startedAtMs) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [exam]);

  // 問題が変わったら選択状態をリセットする
  useEffect(() => {
    setSelected([]);
    setError(null);
  }, [exam?.currentIndex]);

  const handleSubmit = useCallback(
    async (choiceIds: string[]) => {
      if (!exam || !question || isSubmitting) return;

      setIsSubmitting(true);
      setError(null);
      try {
        const result = await submitAnswer(exam.sessionId, {
          questionId: question.questionId,
          selectedChoiceIds: choiceIds,
          elapsedSec,
        });
        setLastResult(result, choiceIds);
        navigate('/exam/explanation');
      } catch (caught) {
        setError(toDisplayMessage(caught));
      } finally {
        setIsSubmitting(false);
      }
    },
    [exam, question, isSubmitting, elapsedSec, setLastResult, navigate],
  );

  // 終了処理の待機中もタイマーは進み続けるため、多重に走らせない
  const isTimeUpHandled = useRef(false);

  // 制限時間切れ（S-06 §4）: セッションを終了して結果画面へ
  const handleTimeUp = useCallback(async () => {
    if (!exam || isTimeUpHandled.current) return;
    isTimeUpHandled.current = true;
    try {
      await finishSession(exam.sessionId);
    } catch {
      // 終了処理に失敗しても結果画面は開く（結果取得時に状態を確認できる）
    }
    const sessionId = exam.sessionId;
    clearExam();
    navigate(`/result/${sessionId}`, { replace: true });
  }, [exam, clearExam, navigate]);

  const timeLimitSec = (exam?.settings.timeLimitMin ?? 0) * 60;
  const isTimed = timeLimitSec > 0;
  const remainingSec = timeLimitSec - elapsedSec;

  useEffect(() => {
    if (isTimed && remainingSec <= 0) {
      void handleTimeUp();
    }
  }, [isTimed, remainingSec, handleTimeUp]);

  // 直接URLで来た場合など、セッションが無ければ設定画面へ戻す
  if (!exam || !question) {
    return (
      <Layout title="出題" backTo="/">
        <ErrorMessage message="出題セッションが開始されていません" />
        <button type="button" className="button" onClick={() => navigate('/exam/settings')}>
          出題設定へ
        </button>
      </Layout>
    );
  }

  const isMultiple = question.questionType === 'multiple';

  function toggleChoice(choiceId: string) {
    if (isMultiple) {
      setSelected((current) =>
        current.includes(choiceId)
          ? current.filter((id) => id !== choiceId)
          : [...current, choiceId],
      );
    } else {
      // 単一選択は選択と同時に送信する（S-06 §4 操作1）
      setSelected([choiceId]);
      void handleSubmit([choiceId]);
    }
  }

  return (
    <Layout title={`問題 ${exam.currentIndex + 1} / ${exam.questions.length}`}>
      <div className="exam__status">
        {isTimed && <span className="exam__timer">残り {formatRemaining(remainingSec)}</span>}
      </div>

      {/* S-05 で出せなかった出題数の警告をここで伝える（S-05 §5） */}
      {exam.startupWarning && (
        <p className="feedback feedback--warning" role="status">
          {exam.startupWarning}
          <button
            type="button"
            className="feedback__dismiss"
            onClick={dismissStartupWarning}
            aria-label="警告を閉じる"
          >
            ×
          </button>
        </p>
      )}

      <p className="exam__question-text">{question.questionText}</p>

      {isMultiple && (
        <p className="exam__hint">正しいものを{question.correctCount}つ選んでください</p>
      )}

      <ul className="exam__choices">
        {question.choices.map((choice) => {
          const isSelected = selected.includes(choice.choiceId);
          return (
            <li key={choice.choiceId}>
              <button
                type="button"
                className={`choice ${isSelected ? 'choice--selected' : ''}`}
                onClick={() => toggleChoice(choice.choiceId)}
                disabled={isSubmitting}
                aria-pressed={isSelected}
              >
                <span className="choice__label">{choice.label}</span>
                <span className="choice__text">{choice.choiceText}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {error && <ErrorMessage message={error} />}

      {isMultiple && (
        <button
          type="button"
          className="button button--primary button--large"
          onClick={() => handleSubmit(selected)}
          disabled={selected.length === 0 || isSubmitting}
        >
          {isSubmitting ? '送信中…' : '決定'}
        </button>
      )}
    </Layout>
  );
}
