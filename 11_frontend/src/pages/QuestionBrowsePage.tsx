/**
 * S-08 問題閲覧画面
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/個別画面設計書/S-08_問題閲覧画面.md
 *
 * 学習用の参照画面。正解と解説を最初から表示する。
 * 閲覧専用であり、セッションや回答履歴は作成しない。
 */
import { useEffect, useState } from 'react';
import { toDisplayMessage } from '../api/client';
import { listCategories, listQualifications, listQuestions } from '../api/endpoints';
import type { Category, Qualification, QuestionDetail } from '../api/endpoints';
import { Layout } from '../components/Layout';
import { EmptyState, ErrorMessage, Loading } from '../components/Feedback';

/** 一覧に表示する問題文のプレビュー長（S-08 §3: 全角40文字程度） */
const PREVIEW_LENGTH = 40;

const ALL_CATEGORIES = '';

export function QuestionBrowsePage() {
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [qualificationId, setQualificationId] = useState('');
  const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);

  const [questions, setQuestions] = useState<QuestionDetail[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<QuestionDetail | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // 資格プルダウンの初期化
  useEffect(() => {
    let cancelled = false;
    listQualifications()
      .then(({ items }) => {
        if (cancelled) return;
        setQualifications(items);
        if (items.length > 0) setQualificationId(items[0]!.qualificationId);
      })
      .catch((caught) => {
        if (!cancelled) setError(toDisplayMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 資格変更時にカテゴリを取り直す
  useEffect(() => {
    if (!qualificationId) return;
    let cancelled = false;
    setCategoryId(ALL_CATEGORIES);
    listCategories(qualificationId)
      .then(({ items }) => {
        if (!cancelled) setCategories(items);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [qualificationId]);

  // フィルタ変更時に問題一覧を取り直す
  useEffect(() => {
    if (!qualificationId) return;
    let cancelled = false;
    setIsLoading(true);
    setSelected(null);

    listQuestions({
      qualificationId,
      ...(categoryId === ALL_CATEGORIES ? {} : { categoryId }),
    })
      .then((result) => {
        if (cancelled) return;
        setQuestions(result.items);
        setNextToken(result.nextToken);
        setError(null);
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
  }, [qualificationId, categoryId, reloadKey]);

  async function loadMore() {
    if (!nextToken) return;
    setIsLoadingMore(true);
    try {
      const result = await listQuestions({
        qualificationId,
        ...(categoryId === ALL_CATEGORIES ? {} : { categoryId }),
        nextToken,
      });
      setQuestions((current) => [...current, ...result.items]);
      setNextToken(result.nextToken);
    } catch (caught) {
      setError(toDisplayMessage(caught));
    } finally {
      setIsLoadingMore(false);
    }
  }

  // 詳細表示（S-08 §4 操作3）
  if (selected) {
    return (
      <Layout title="問題詳細">
        <button type="button" className="link" onClick={() => setSelected(null)}>
          ＜ 一覧に戻る
        </button>

        <p className="exam__question-text">{selected.questionText}</p>

        <ul className="exam__choices exam__choices--readonly">
          {selected.choices.map((choice) => (
            <li key={choice.choiceId}>
              <div className={`choice ${choice.isCorrect ? 'choice--correct' : ''}`}>
                <span className="choice__label">{choice.label}</span>
                <span className="choice__text">{choice.choiceText}</span>
                {choice.isCorrect && <span className="choice__mark">正解</span>}
              </div>
            </li>
          ))}
        </ul>

        <section className="explanation">
          <h2 className="explanation__title">解説</h2>
          <p className="explanation__body">{selected.explanation}</p>
        </section>
      </Layout>
    );
  }

  return (
    <Layout title="問題閲覧" backTo="/">
      <div className="browse__filters">
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
          <span className="field__label">大問</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value={ALL_CATEGORIES}>すべて</option>
            {categories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.categoryName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && <Loading />}
      {error && <ErrorMessage message={error} onRetry={() => setReloadKey((key) => key + 1)} />}

      {!isLoading && !error && questions.length === 0 && (
        <EmptyState message="該当する問題がありません" />
      )}

      <ul className="browse__list">
        {questions.map((question, index) => (
          <li key={question.questionId}>
            <button type="button" className="browse__item" onClick={() => setSelected(question)}>
              <span className="browse__item-no">Q{index + 1}.</span>
              <span className="browse__item-text">
                {question.questionText.length > PREVIEW_LENGTH
                  ? `${question.questionText.slice(0, PREVIEW_LENGTH)}…`
                  : question.questionText}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {nextToken && (
        <button type="button" className="button" onClick={loadMore} disabled={isLoadingMore}>
          {isLoadingMore ? '読み込み中…' : 'さらに読み込む'}
        </button>
      )}
    </Layout>
  );
}
