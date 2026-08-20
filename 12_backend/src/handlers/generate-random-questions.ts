/**
 * API-04 ランダム出題リスト生成（POST /questions/random）
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/個別API設計書/API-04_ランダム出題リスト生成.md
 *
 * 出題設定画面（S-05）で指定された条件に基づき出題対象を抽選する。
 * **正解フラグ（isCorrect）と解説は一切含めない**。正誤判定はサーバー側（API-08）で
 * 行い、クライアントに正解を渡さない設計とする（要件定義書 §9.1）。
 */
import { INDEXES, TABLES, tableName } from '../common/config';
import { query } from '../common/dynamodb';
import { NotFoundError } from '../common/errors';
import { requestOrigin, withErrorHandling } from '../common/handler';
import { optionalIntInRange, parseJsonBody, requireString } from '../common/request';
import { ok } from '../common/response';
import { fetchChoicesByQuestionIds } from '../services/choice-service';
import type { QuestionItem } from '../models';

/** 出題数の上限（API-04 リクエスト仕様） */
const MIN_QUESTION_COUNT = 1;
const MAX_QUESTION_COUNT = 100;

/** API-04 のレスポンス要素。正解フラグ・解説・共通項目は含めない */
interface ChoiceResponse {
  choiceId: string;
  label: string;
  choiceText: string;
}

interface QuestionResponse {
  questionId: string;
  questionText: string;
  questionType: string;
  /** UIの「◯つ選んでください」表示に使う。正解の選択肢IDそのものは含まない */
  correctCount: number;
  choices: ChoiceResponse[];
}

/**
 * Fisher-Yates シャッフルで先頭 count 件を抽出する。
 * 元の配列は変更しない。
 */
export function pickRandom<T>(items: T[], count: number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, count);
}

export const handler = withErrorHandling('API-04', async (event) => {
  const body = parseJsonBody(event);
  const qualificationId = requireString(body.qualificationId, 'qualificationId', '資格ID');
  const questionCount = optionalIntInRange(
    body.questionCount,
    'questionCount',
    '出題数',
    MIN_QUESTION_COUNT,
    MAX_QUESTION_COUNT,
  );

  // 出題対象は資格単位で取得する（テーブル一覧 §アクセスパターン一覧）
  const { items } = await query<QuestionItem>({
    TableName: tableName(TABLES.QUESTION),
    IndexName: INDEXES.QUALIFICATION_ID,
    KeyConditionExpression: 'qualificationId = :qid',
    FilterExpression: 'isActive = :isActive',
    ExpressionAttributeValues: { ':qid': qualificationId, ':isActive': true },
  });

  if (items.length === 0) {
    throw new NotFoundError('対象資格の出題可能な問題がありません');
  }

  // 出題数未指定時は対象資格の全問題を出題対象とする。
  // 取得件数が指定数に満たない場合は取得できた全件を返す
  const selected =
    questionCount === undefined ? items : pickRandom(items, Math.min(questionCount, items.length));

  const choicesByQuestion = await fetchChoicesByQuestionIds(
    selected.map((item) => item.questionId),
  );

  const questions: QuestionResponse[] = selected.map((item) => ({
    questionId: item.questionId,
    questionText: item.questionText,
    questionType: item.questionType,
    correctCount: item.correctCount,
    choices: (choicesByQuestion.get(item.questionId) ?? []).map((choice) => ({
      choiceId: choice.choiceId,
      label: choice.label,
      choiceText: choice.choiceText,
    })),
  }));

  return ok({ questions, actualCount: questions.length }, requestOrigin(event));
});
