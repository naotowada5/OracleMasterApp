/**
 * API-09 セッション取得（GET /sessions/{sessionId}）
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/個別API設計書/API-09_セッション取得.md
 *
 * 解答結果画面（S-09）向け。セッションのサマリと問題別の回答履歴を返す。
 * S-09 では問題ごとの振り返り（問題文・選択肢・正解・解説・自分の回答）を
 * 表示するため、回答履歴に問題本体の情報を結合して返す。セッションは既に
 * 採点済みであるため、正解と解説を開示してよい。
 */
import { assertOwner, getAuthContext } from '../common/auth';
import { INDEXES, TABLES, tableName } from '../common/config';
import { getItem, query } from '../common/dynamodb';
import { NotFoundError, ValidationError } from '../common/errors';
import { requestOrigin, withErrorHandling } from '../common/handler';
import { ok } from '../common/response';
import { fetchChoicesByQuestionIds } from '../services/choice-service';
import type { AnswerHistoryItem, ExamSessionItem, QuestionItem } from '../models';

/** 問題本体を取得できなかった場合のフォールバック（API-09 §3） */
const MISSING_QUESTION = { questionText: '', questionType: '', explanation: '' };

export const handler = withErrorHandling('API-09', async (event) => {
  const auth = getAuthContext(event);
  const sessionId = event.pathParameters?.sessionId;

  if (!sessionId) {
    throw new ValidationError('セッションIDを指定してください', [
      { field: 'sessionId', reason: 'required' },
    ]);
  }

  const session = await getItem<ExamSessionItem>(tableName(TABLES.EXAM_SESSION), { sessionId });
  if (!session) {
    throw new NotFoundError('指定されたセッションが見つかりません');
  }

  // 他ユーザーのセッションは参照させない（認証・認可設計 §2.2）
  assertOwner(session.userId, auth);

  const { items } = await query<AnswerHistoryItem>({
    TableName: tableName(TABLES.ANSWER_HISTORY),
    IndexName: INDEXES.SESSION_ID,
    KeyConditionExpression: 'sessionId = :sessionId',
    ExpressionAttributeValues: { ':sessionId': sessionId },
  });

  // answeredAt 昇順（＝出題順相当）で並べる
  const histories = [...items].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
  const questionIds = [...new Set(histories.map((history) => history.questionId))];

  // 問題本体と選択肢を並列で取得して結合する
  const [questions, choicesByQuestion] = await Promise.all([
    Promise.all(
      questionIds.map(async (questionId) => {
        const item = await getItem<QuestionItem>(tableName(TABLES.QUESTION), { questionId });
        return [questionId, item] as const;
      }),
    ),
    fetchChoicesByQuestionIds(questionIds),
  ]);

  const questionById = new Map(questions);

  const answers = histories.map((history) => {
    const question = questionById.get(history.questionId);
    return {
      questionId: history.questionId,
      isCorrect: history.isCorrect,
      answeredAt: history.answeredAt,
      selectedChoiceIds: history.selectedChoiceIds,
      questionText: question?.questionText ?? MISSING_QUESTION.questionText,
      questionType: question?.questionType ?? MISSING_QUESTION.questionType,
      explanation: question?.explanation ?? MISSING_QUESTION.explanation,
      choices: (choicesByQuestion.get(history.questionId) ?? []).map((choice) => ({
        choiceId: choice.choiceId,
        label: choice.label,
        choiceText: choice.choiceText,
        isCorrect: choice.isCorrect,
        sortOrder: choice.sortOrder,
      })),
    };
  });

  return ok(
    {
      sessionId: session.sessionId,
      qualificationId: session.qualificationId,
      totalQuestions: session.totalQuestions,
      correctCount: session.correctCount,
      timeLimitMin: session.timeLimitMin,
      elapsedSec: session.elapsedSec,
      status: session.status,
      startedAt: session.startedAt,
      ...(session.finishedAt ? { finishedAt: session.finishedAt } : {}),
      answers,
    },
    requestOrigin(event),
  );
});
