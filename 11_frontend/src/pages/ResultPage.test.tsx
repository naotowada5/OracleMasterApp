import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionAnswer, SessionDetail } from '../api/endpoints';

vi.mock('../api/endpoints', () => ({ getSession: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

import { getSession } from '../api/endpoints';
import { ResultPage } from './ResultPage';

const mockGetSession = vi.mocked(getSession);

/** 回答履歴のフィクスチャ。問題本体の情報も含む（API-09） */
function answer(questionId: string, isCorrect: boolean, answeredAt: string): SessionAnswer {
  return {
    questionId,
    isCorrect,
    answeredAt,
    selectedChoiceIds: isCorrect ? ['ch-1'] : ['ch-2'],
    questionText: `${questionId} の問題文`,
    questionType: 'single',
    explanation: `${questionId} の解説`,
    choices: [
      { choiceId: 'ch-1', label: 'A', choiceText: '正しい選択肢', isCorrect: true, sortOrder: 1 },
      { choiceId: 'ch-2', label: 'B', choiceText: '誤った選択肢', isCorrect: false, sortOrder: 2 },
    ],
  };
}

function session(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    sessionId: 's-1',
    qualificationId: '1Z0-085-JPN',
    totalQuestions: 4,
    correctCount: 3,
    timeLimitMin: 30,
    elapsedSec: 600,
    status: 'completed',
    startedAt: '2026-08-21T10:00:00.000Z',
    finishedAt: '2026-08-21T10:10:00.000Z',
    answers: [
      answer('q-1', true, '2026-08-21T10:01:00.000Z'),
      answer('q-2', true, '2026-08-21T10:02:00.000Z'),
      answer('q-3', true, '2026-08-21T10:03:00.000Z'),
      answer('q-4', false, '2026-08-21T10:04:00.000Z'),
    ],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/result/s-1']}>
      <Routes>
        <Route path="/result/:sessionId" element={<ResultPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('S-09 解答結果画面', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('総問題数・正解数・不正解数・正答率を表示する', async () => {
    mockGetSession.mockResolvedValue(session());
    renderPage();

    expect(await screen.findByText('75%')).toBeInTheDocument();
    // 総問題数4 / 正解3 / 不正解1
    expect(screen.getByText('総問題数').nextSibling).toHaveTextContent('4');
    expect(screen.getByText('正解数').nextSibling).toHaveTextContent('3');
    expect(screen.getByText('不正解数').nextSibling).toHaveTextContent('1');
  });

  it('未回答分は総問題数との差分として✕表示される（S-09 §6）', async () => {
    // 4問中2問しか回答していない
    mockGetSession.mockResolvedValue(
      session({
        correctCount: 2,
        answers: [
          answer('q-1', true, '2026-08-21T10:01:00.000Z'),
          answer('q-2', true, '2026-08-21T10:02:00.000Z'),
        ],
      }),
    );
    renderPage();

    await screen.findByText('50%');
    // 4マス表示され、うち2マスが未回答の✕
    expect(screen.getAllByText('✕')).toHaveLength(2);
    expect(screen.getByText('不正解数').nextSibling).toHaveTextContent('2');
  });

  it('総問題数が0でも正答率の計算で落ちない', async () => {
    mockGetSession.mockResolvedValue(session({ totalQuestions: 0, correctCount: 0, answers: [] }));
    renderPage();

    expect(await screen.findByText('0%')).toBeInTheDocument();
  });

  it('未終了のまま到達した場合は警告を出しつつ表示する（S-09 §6）', async () => {
    mockGetSession.mockResolvedValue(session({ status: 'in_progress' }));
    renderPage();

    expect(await screen.findByText(/まだ終了していません/)).toBeInTheDocument();
    // 警告を出しても取得できた範囲は表示する
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  describe('問題別詳細（S-09 §4 操作2）', () => {
    it('問題を押下すると問題文・解説・選択肢が表示される', async () => {
      mockGetSession.mockResolvedValue(session());
      renderPage();

      await screen.findByText('75%');
      await userEvent.click(screen.getByRole('button', { name: /問題1（正解）の詳細/ }));

      expect(screen.getByText('q-1 の問題文')).toBeInTheDocument();
      expect(screen.getByText('q-1 の解説')).toBeInTheDocument();
      expect(screen.getByText('正しい選択肢')).toBeInTheDocument();
    });

    it('不正解の問題では自分の回答と正解の両方が示される', async () => {
      mockGetSession.mockResolvedValue(session());
      renderPage();

      await screen.findByText('75%');
      // q-4 は不正解（ch-2 を選択、正解は ch-1）
      await userEvent.click(screen.getByRole('button', { name: /問題4（不正解）の詳細/ }));

      expect(screen.getByText('✕ 不正解')).toBeInTheDocument();
      expect(screen.getByText('あなたの回答')).toBeInTheDocument();
      expect(screen.getByText('正解')).toBeInTheDocument();
    });

    it('「結果一覧に戻る」で一覧へ復帰する', async () => {
      mockGetSession.mockResolvedValue(session());
      renderPage();

      await screen.findByText('75%');
      await userEvent.click(screen.getByRole('button', { name: /問題1（正解）の詳細/ }));
      await userEvent.click(screen.getByRole('button', { name: /結果一覧に戻る/ }));

      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('未回答の問題は押下できない（詳細を持たないため）', async () => {
      mockGetSession.mockResolvedValue(
        session({
          correctCount: 2,
          answers: [
            answer('q-1', true, '2026-08-21T10:01:00.000Z'),
            answer('q-2', true, '2026-08-21T10:02:00.000Z'),
          ],
        }),
      );
      renderPage();

      await screen.findByText('50%');
      // 回答済みの2問のみがボタンになる
      expect(screen.getAllByRole('button', { name: /の詳細を見る/ })).toHaveLength(2);
    });
  });

  it('取得失敗時はエラーと再読み込みボタンを表示する', async () => {
    mockGetSession.mockRejectedValue(new Error('failed'));
    renderPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();
  });
});
