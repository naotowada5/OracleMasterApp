/**
 * S-07 解説画面
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/個別画面設計書/S-07_解説画面.md
 *
 * 正誤判定と正解の選択肢は API-08 のレスポンス（採点済み）から表示する。
 * 解説テキストは Phase1/2 では事前登録済みのものを表示し、動的生成はしない。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toDisplayMessage } from '../api/client';
import { finishSession } from '../api/endpoints';
import { Layout } from '../components/Layout';
import { AnsweredChoices } from '../components/AnsweredChoices';
import { ErrorMessage } from '../components/Feedback';
import { useExam } from '../exam/ExamContext';

export function ExplanationPage() {
  const navigate = useNavigate();
  const { exam, goToNextQuestion, clearExam } = useExam();
  const [error, setError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  const question = exam?.questions[exam.currentIndex];
  const result = exam?.lastResult;

  if (!exam || !question || !result) {
    return (
      <Layout title="解説" backTo="/">
        <ErrorMessage message="採点結果がありません" />
        <button type="button" className="button" onClick={() => navigate('/exam/settings')}>
          出題設定へ
        </button>
      </Layout>
    );
  }

  const isLast = exam.currentIndex >= exam.questions.length - 1;

  async function handleShowResult() {
    if (!exam) return;
    setIsFinishing(true);
    setError(null);
    try {
      await finishSession(exam.sessionId);
      const sessionId = exam.sessionId;
      clearExam();
      navigate(`/result/${sessionId}`, { replace: true });
    } catch (caught) {
      setError(toDisplayMessage(caught));
      setIsFinishing(false);
    }
  }

  return (
    <Layout title="解説">
      <p className={`judgement ${result.isCorrect ? 'judgement--correct' : 'judgement--wrong'}`}>
        {result.isCorrect ? '◯ 正解' : '✕ 不正解'}
      </p>

      <p className="exam__question-text">{question.questionText}</p>

      <AnsweredChoices
        choices={question.choices}
        correctChoiceIds={result.correctChoiceIds}
        selectedChoiceIds={exam.lastSelectedChoiceIds}
      />

      <section className="explanation">
        <h2 className="explanation__title">解説</h2>
        {/* 事前登録済みの解説を表示する。Phase1/2 では動的生成しない（F-11はPhase3） */}
        <p className="explanation__body">
          {result.explanation.length > 0 ? result.explanation : '解説は準備中です'}
        </p>
      </section>

      {error && <ErrorMessage message={error} />}

      <div className="explanation__actions">
        {isLast ? (
          <button
            type="button"
            className="button button--primary button--large"
            onClick={handleShowResult}
            disabled={isFinishing}
          >
            {isFinishing ? '集計中…' : '結果を見る'}
          </button>
        ) : (
          <button
            type="button"
            className="button button--primary button--large"
            onClick={() => {
              goToNextQuestion();
              navigate('/exam');
            }}
          >
            次の問題へ
          </button>
        )}
      </div>
    </Layout>
  );
}
