/**
 * 出題セッションの状態。
 *
 * 対応設計書: 01_docs/02_sd/01_画面設計/画面遷移図.md
 *             S-05 出題設定 → S-06 出題 → S-07 解説 → S-09 解答結果
 *
 * API-04 で取得した出題リストと API-07 で作成したセッションIDを、S-05 から
 * S-07 まで持ち回る必要があるためコンテキストで保持する。
 * 出題リストには正解情報が含まれないため（要件定義書 §9.1）、クライアントに
 * 保持しても正解が漏れることはない。
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AnswerResult, ExamQuestion } from '../api/endpoints';

/** S-05 で指定した出題条件。S-09 の「もう一度挑戦」で引き継ぐ */
export interface ExamSettings {
  qualificationId: string;
  qualificationName: string;
  questionCount: number;
  timeLimitMin: number;
}

export interface ExamState {
  sessionId: string;
  settings: ExamSettings;
  questions: ExamQuestion[];
  /** 現在の問題のインデックス（0始まり） */
  currentIndex: number;
  /** セッション開始時刻。経過時間の算出に使う */
  startedAtMs: number;
  /** 直前の採点結果。S-07 の表示に使う */
  lastResult: AnswerResult | null;
  /** 直前にユーザーが選んだ選択肢ID。S-07 で誤答をハイライトするために保持する */
  lastSelectedChoiceIds: string[];
  /**
   * 出題開始時の警告（S-05 §5「対象の問題が◯問しかないため…」）。
   * S-05 で表示しても直後に S-06 へ遷移するため読めない。設計上「処理は継続」
   * なので、遷移を止めずに S-06 側で伝える。
   */
  startupWarning: string | null;
}

interface ExamContextValue {
  exam: ExamState | null;
  /** S-05 の「出題開始」で呼ぶ */
  startExam: (
    state: Omit<ExamState, 'currentIndex' | 'startedAtMs' | 'lastResult' | 'lastSelectedChoiceIds'>,
  ) => void;
  /** S-06 で警告を読み終えたら消す */
  dismissStartupWarning: () => void;
  /** S-06 で回答送信後、採点結果と選択内容を保持する */
  setLastResult: (result: AnswerResult, selectedChoiceIds: string[]) => void;
  /** S-07 の「次の問題へ」で呼ぶ */
  goToNextQuestion: () => void;
  /** セッション終了時に破棄する */
  clearExam: () => void;
  /** S-09 の「もう一度挑戦」で設定だけ引き継ぐ */
  lastSettings: ExamSettings | null;
}

const ExamContext = createContext<ExamContextValue | undefined>(undefined);

export function ExamProvider({ children }: { children: ReactNode }) {
  const [exam, setExam] = useState<ExamState | null>(null);
  const [lastSettings, setLastSettings] = useState<ExamSettings | null>(null);

  const startExam = useCallback<ExamContextValue['startExam']>((state) => {
    setExam({
      ...state,
      currentIndex: 0,
      startedAtMs: Date.now(),
      lastResult: null,
      lastSelectedChoiceIds: [],
    });
    setLastSettings(state.settings);
  }, []);

  const setLastResult = useCallback<ExamContextValue['setLastResult']>(
    (result, selectedChoiceIds) => {
      setExam((current) =>
        current
          ? { ...current, lastResult: result, lastSelectedChoiceIds: selectedChoiceIds }
          : current,
      );
    },
    [],
  );

  const goToNextQuestion = useCallback(() => {
    setExam((current) =>
      current
        ? {
            ...current,
            currentIndex: current.currentIndex + 1,
            lastResult: null,
            lastSelectedChoiceIds: [],
          }
        : current,
    );
  }, []);

  const dismissStartupWarning = useCallback(() => {
    setExam((current) => (current ? { ...current, startupWarning: null } : current));
  }, []);

  const clearExam = useCallback(() => setExam(null), []);

  const value = useMemo(
    () => ({
      exam,
      startExam,
      setLastResult,
      goToNextQuestion,
      dismissStartupWarning,
      clearExam,
      lastSettings,
    }),
    [
      exam,
      startExam,
      setLastResult,
      goToNextQuestion,
      dismissStartupWarning,
      clearExam,
      lastSettings,
    ],
  );

  return <ExamContext.Provider value={value}>{children}</ExamContext.Provider>;
}

export function useExam(): ExamContextValue {
  const context = useContext(ExamContext);
  if (!context) {
    throw new Error('useExam は ExamProvider の内側で使用してください');
  }
  return context;
}
