/**
 * API-03 問題一覧取得（GET /questions）
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/個別API設計書/API-03_問題一覧取得.md
 *
 * 問題閲覧画面（S-08）向けのAPI。学習用の参照であるため、選択肢の正解フラグと
 * 解説を含めて返す（出題用の API-04 とは正解情報の露出範囲が異なる）。
 */
import { INDEXES, TABLES, tableName } from '../common/config';
import { query } from '../common/dynamodb';
import { ValidationError } from '../common/errors';
import { requestOrigin, withErrorHandling } from '../common/handler';
import { decodeNextToken, encodeNextToken, resolveLimit } from '../common/pagination';
import { ok } from '../common/response';
import { fetchChoicesByQuestionIds } from '../services/choice-service';
import type { QuestionItem } from '../models';

/** API-03 のレスポンス要素。共通項目は含めない */
interface ChoiceResponse {
  choiceId: string;
  label: string;
  choiceText: string;
  isCorrect: boolean;
  sortOrder: number;
}

interface QuestionResponse {
  questionId: string;
  qualificationId: string;
  categoryId: string;
  questionText: string;
  questionType: string;
  correctCount: number;
  difficulty?: string;
  explanation: string;
  choices: ChoiceResponse[];
}

export const handler = withErrorHandling('API-03', async (event) => {
  const params = event.queryStringParameters ?? {};
  const qualificationId = params.qualificationId;
  const categoryId = params.categoryId;

  if (!qualificationId) {
    throw new ValidationError('資格IDを指定してください', [
      { field: 'qualificationId', reason: 'required' },
    ]);
  }

  const limit = resolveLimit(params.limit);
  const exclusiveStartKey = decodeNextToken(params.nextToken);

  // categoryId 指定時は categoryId-index、未指定時は qualificationId-index を使う
  const { items, lastEvaluatedKey } = await query<QuestionItem>({
    TableName: tableName(TABLES.QUESTION),
    IndexName: categoryId ? INDEXES.CATEGORY_ID : INDEXES.QUALIFICATION_ID,
    KeyConditionExpression: categoryId ? 'categoryId = :categoryId' : 'qualificationId = :qid',
    // 非公開の問題は閲覧対象から除外する
    FilterExpression: 'isActive = :isActive',
    ExpressionAttributeValues: categoryId
      ? { ':categoryId': categoryId, ':isActive': true }
      : { ':qid': qualificationId, ':isActive': true },
    Limit: limit,
    ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
  });

  const choicesByQuestion = await fetchChoicesByQuestionIds(items.map((item) => item.questionId));

  const questions: QuestionResponse[] = items.map((item) => ({
    questionId: item.questionId,
    qualificationId: item.qualificationId,
    categoryId: item.categoryId,
    questionText: item.questionText,
    questionType: item.questionType,
    correctCount: item.correctCount,
    ...(item.difficulty ? { difficulty: item.difficulty } : {}),
    explanation: item.explanation,
    choices: (choicesByQuestion.get(item.questionId) ?? []).map((choice) => ({
      choiceId: choice.choiceId,
      label: choice.label,
      choiceText: choice.choiceText,
      isCorrect: choice.isCorrect,
      sortOrder: choice.sortOrder,
    })),
  }));

  return ok(
    { items: questions, nextToken: encodeNextToken(lastEvaluatedKey) },
    requestOrigin(event),
  );
});
