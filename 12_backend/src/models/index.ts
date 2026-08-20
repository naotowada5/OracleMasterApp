/**
 * DynamoDB のアイテム型。
 *
 * 対応設計書: 01_docs/02_sd/03_データベース設計/個別エンティティ定義書/
 *
 * すべてのアイテムが共通項目（AuditFields）を持つ（テーブル一覧 §共通項目）。
 */
import type { AuditFields } from '../common/audit';

/** T-01 OR_M_QUALIFICATION（資格マスタ） */
export interface QualificationItem extends AuditFields {
  qualificationId: string;
  name: string;
  /** `bronze` / `silver` / `gold` */
  level: string;
  isActive: boolean;
}

/** T-02 OR_M_CATEGORY（大問カテゴリマスタ） */
export interface CategoryItem extends AuditFields {
  categoryId: string;
  qualificationId: string;
  categoryName: string;
  sortOrder: number;
}

/** T-03 OR_M_QUESTION（問題テーブル） */
export interface QuestionItem extends AuditFields {
  questionId: string;
  qualificationId: string;
  categoryId: string;
  questionText: string;
  /** `single`（単一選択）/ `multiple`（複数選択） */
  questionType: 'single' | 'multiple';
  correctCount: number;
  explanation: string;
  difficulty?: string;
  isActive: boolean;
}

/** T-04 OR_M_CHOICE（選択肢テーブル） */
export interface ChoiceItem extends AuditFields {
  choiceId: string;
  questionId: string;
  label: string;
  choiceText: string;
  isCorrect: boolean;
  sortOrder: number;
}

/** T-05 OR_M_USER（ユーザーテーブル） */
export interface UserItem extends AuditFields {
  /** Cognito sub */
  userId: string;
  email: string;
  displayName: string;
  lastLoginAt: string;
}

/** T-06 OR_T_EXAM_SESSION（試験セッションテーブル） */
export interface ExamSessionItem extends AuditFields {
  sessionId: string;
  userId: string;
  qualificationId: string;
  totalQuestions: number;
  correctCount: number;
  timeLimitMin: number;
  elapsedSec: number;
  status: 'in_progress' | 'completed' | 'expired';
  startedAt: string;
  finishedAt?: string;
}

/** T-07 OR_T_ANSWER_HISTORY（回答履歴テーブル） */
export interface AnswerHistoryItem extends AuditFields {
  historyId: string;
  sessionId: string;
  questionId: string;
  selectedChoiceIds: string[];
  isCorrect: boolean;
  answeredAt: string;
}
