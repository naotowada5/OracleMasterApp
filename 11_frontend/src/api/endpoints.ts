/**
 * Phase1対象8APIの呼び出し。
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/API一覧.md および個別API設計書
 *
 * 型はAPI設計書のレスポンス仕様に対応する。共通項目（createdBy等）は
 * サーバー側で除外されるため、ここにも現れない（API共通設計 §8.1）。
 */
import { apiRequest } from './client';

// ---------------------------------------------------------------- API-01
export interface Qualification {
  qualificationId: string;
  name: string;
  level: string;
  isActive: boolean;
}

export function listQualifications(): Promise<{ items: Qualification[] }> {
  return apiRequest('/qualifications');
}

// ---------------------------------------------------------------- API-02
export interface Category {
  categoryId: string;
  qualificationId: string;
  categoryName: string;
  sortOrder: number;
}

export function listCategories(qualificationId: string): Promise<{ items: Category[] }> {
  return apiRequest('/categories', { query: { qualificationId } });
}

// ---------------------------------------------------------------- API-03
/** 閲覧用の選択肢。正解フラグを含む */
export interface ChoiceWithAnswer {
  choiceId: string;
  label: string;
  choiceText: string;
  isCorrect: boolean;
  sortOrder: number;
}

export interface QuestionDetail {
  questionId: string;
  qualificationId: string;
  categoryId: string;
  questionText: string;
  questionType: 'single' | 'multiple';
  correctCount: number;
  difficulty?: string;
  explanation: string;
  choices: ChoiceWithAnswer[];
}

export function listQuestions(params: {
  qualificationId: string;
  categoryId?: string;
  limit?: number;
  nextToken?: string;
}): Promise<{ items: QuestionDetail[]; nextToken: string | null }> {
  return apiRequest('/questions', { query: params });
}

// ---------------------------------------------------------------- API-04
/** 出題用の選択肢。正解フラグを含まない（要件定義書 §9.1） */
export interface Choice {
  choiceId: string;
  label: string;
  choiceText: string;
}

export interface ExamQuestion {
  questionId: string;
  questionText: string;
  questionType: 'single' | 'multiple';
  /** UIの「◯つ選んでください」表示に使う */
  correctCount: number;
  choices: Choice[];
}

export function generateRandomQuestions(params: {
  qualificationId: string;
  questionCount?: number;
}): Promise<{ questions: ExamQuestion[]; actualCount: number }> {
  return apiRequest('/questions/random', { method: 'POST', body: params });
}

// ---------------------------------------------------------------- API-07
export type SessionStatus = 'in_progress' | 'completed' | 'expired';

export interface CreatedSession {
  sessionId: string;
  userId: string;
  qualificationId: string;
  totalQuestions: number;
  timeLimitMin: number;
  status: SessionStatus;
  startedAt: string;
}

export function createSession(params: {
  qualificationId: string;
  totalQuestions: number;
  timeLimitMin?: number;
}): Promise<CreatedSession> {
  return apiRequest('/sessions', { method: 'POST', body: params });
}

// ---------------------------------------------------------------- API-08
export interface AnswerResult {
  historyId: string;
  questionId: string;
  isCorrect: boolean;
  /** 採点後に開示される正解の選択肢ID（S-07 のハイライト表示に使う） */
  correctChoiceIds: string[];
  /** 採点後に開示される解説テキスト。未登録の場合は空文字 */
  explanation: string;
  sessionStatus: SessionStatus;
  sessionCorrectCount: number;
  isLastQuestion: boolean;
}

export function submitAnswer(
  sessionId: string,
  params: { questionId: string; selectedChoiceIds: string[]; elapsedSec?: number },
): Promise<AnswerResult> {
  return apiRequest(`/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PUT',
    body: { action: 'answer', ...params },
  });
}

export interface FinishResult {
  sessionStatus: SessionStatus;
  sessionCorrectCount: number;
  finishedAt: string | null;
}

export function finishSession(sessionId: string): Promise<FinishResult> {
  return apiRequest(`/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PUT',
    body: { action: 'finish' },
  });
}

// ---------------------------------------------------------------- API-09
export interface SessionAnswer {
  questionId: string;
  isCorrect: boolean;
  answeredAt: string;
  /** ユーザーが選んだ選択肢ID。S-09 の詳細表示で「あなたの回答」を示す */
  selectedChoiceIds: string[];
  questionText: string;
  questionType: string;
  /** 事前登録済みの解説。未登録の場合は空文字 */
  explanation: string;
  choices: ChoiceWithAnswer[];
}

export interface SessionDetail {
  sessionId: string;
  qualificationId: string;
  totalQuestions: number;
  correctCount: number;
  timeLimitMin: number;
  elapsedSec: number;
  status: SessionStatus;
  startedAt: string;
  finishedAt?: string;
  answers: SessionAnswer[];
}

export function getSession(sessionId: string): Promise<SessionDetail> {
  return apiRequest(`/sessions/${encodeURIComponent(sessionId)}`);
}

// ---------------------------------------------------------------- API-10
export interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string;
}

export function getCurrentUser(): Promise<UserProfile> {
  return apiRequest('/users/me');
}
