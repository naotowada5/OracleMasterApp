/**
 * S-05 出題設定画面
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/個別画面設計書/S-05_出題設定画面.md
 *
 * 「出題開始」で API-04（出題リスト生成）→ API-07（セッション作成）の順に呼び、
 * 結果を ExamContext に保持して S-06 へ遷移する。
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toDisplayMessage } from '../api/client';
import { createSession, generateRandomQuestions, listQualifications } from '../api/endpoints';
import type { Qualification } from '../api/endpoints';
import { Layout } from '../components/Layout';
import { ErrorMessage, Loading } from '../components/Feedback';
import { useExam } from '../exam/ExamContext';

/** S-05 §3: 出題数の初期値は20 */
const DEFAULT_QUESTION_COUNT = '20';

export function ExamSettingsPage() {
  const navigate = useNavigate();
  const { startExam, lastSettings } = useExam();

  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [qualificationId, setQualificationId] = useState('');
  const [questionCount, setQuestionCount] = useState(DEFAULT_QUESTION_COUNT);
  const [timeLimitMin, setTimeLimitMin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    listQualifications()
      .then(({ items }) => {
        if (cancelled) return;
        setQualifications(items);
        // S-09 の「もう一度挑戦」で戻ってきた場合は前回の設定を復元する
        if (lastSettings) {
          setQualificationId(lastSettings.qualificationId);
          setQuestionCount(String(lastSettings.questionCount));
          setTimeLimitMin(lastSettings.timeLimitMin > 0 ? String(lastSettings.timeLimitMin) : '');
        } else if (items.length > 0) {
          setQualificationId(items[0]!.qualificationId);
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
  }, [lastSettings]);

  /** S-05 §5 入力チェック仕様 */
  function validate(): string | null {
    if (!qualificationId) {
      return '資格種別を選択してください';
    }
    if (questionCount !== '') {
      const count = Number(questionCount);
      if (!Number.isInteger(count) || count < 1 || count > 100) {
        return '出題数は1〜100の範囲で入力してください';
      }
    }
    if (timeLimitMin !== '') {
      const limit = Number(timeLimitMin);
      if (!Number.isInteger(limit) || limit < 1) {
        return '制限時間は1分以上で入力してください';
      }
    }
    return null;
  }

  async function handleStart(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setWarning(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsStarting(true);
    try {
      const requestedCount = questionCount === '' ? undefined : Number(questionCount);
      const { questions, actualCount } = await generateRandomQuestions({
        qualificationId,
        ...(requestedCount === undefined ? {} : { questionCount: requestedCount }),
      });

      // 対象問題が指定数に満たない場合は警告を出しつつ処理を継続する（S-05 §5）。
      // この画面に留まらないため、警告は S-06 へ持ち越して表示する
      const shortageWarning =
        requestedCount !== undefined && actualCount < requestedCount
          ? `対象の問題が${actualCount}問しかないため、${actualCount}問で出題します`
          : null;
      if (shortageWarning) {
        setWarning(shortageWarning);
      }

      const limit = timeLimitMin === '' ? 0 : Number(timeLimitMin);
      const session = await createSession({
        qualificationId,
        // API-07 には API-04 の actualCount（実際の出題数）を渡す
        totalQuestions: actualCount,
        timeLimitMin: limit,
      });

      const qualificationName =
        qualifications.find((q) => q.qualificationId === qualificationId)?.name ?? '';

      startExam({
        sessionId: session.sessionId,
        settings: {
          qualificationId,
          qualificationName,
          questionCount: actualCount,
          timeLimitMin: limit,
        },
        questions,
        startupWarning: shortageWarning,
      });

      navigate('/exam');
    } catch (caught) {
      setError(toDisplayMessage(caught));
    } finally {
      setIsStarting(false);
    }
  }

  if (isLoading) {
    return (
      <Layout title="出題設定" backTo="/">
        <Loading />
      </Layout>
    );
  }

  return (
    <Layout title="出題設定" backTo="/">
      {/* ブラウザ標準の検証を止め、S-05 §5 の文言で統一して表示する。
          標準の検証バブルはブラウザ・言語ごとに文面が変わり、設計の
          エラーメッセージが一切出なくなるため */}
      <form onSubmit={handleStart} className="settings-form" noValidate>
        <label className="field">
          <span className="field__label">資格種別</span>
          <select value={qualificationId} onChange={(e) => setQualificationId(e.target.value)}>
            {qualifications.map((q) => (
              <option key={q.qualificationId} value={q.qualificationId}>
                {q.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">出題数</span>
          <input
            type="number"
            value={questionCount}
            onChange={(e) => setQuestionCount(e.target.value)}
            min={1}
            max={100}
            placeholder="空欄で全問"
          />
          <span className="field__hint">空欄の場合は対象資格の全問題を出題します</span>
        </label>

        <label className="field">
          <span className="field__label">制限時間（分）</span>
          <input
            type="number"
            value={timeLimitMin}
            onChange={(e) => setTimeLimitMin(e.target.value)}
            min={1}
            placeholder="空欄で無制限"
          />
          <span className="field__hint">空欄の場合は無制限です</span>
        </label>

        {warning && <p className="feedback feedback--warning">{warning}</p>}
        {error && <ErrorMessage message={error} />}

        <button
          type="submit"
          className="button button--primary button--large"
          disabled={isStarting}
        >
          {isStarting ? '準備中…' : '出題開始'}
        </button>
      </form>
    </Layout>
  );
}
