/**
 * API-09 セッション取得（GET /sessions/{sessionId}）
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/個別API設計書/API-09_セッション取得.md
 *
 * 解答結果画面（S-09）向け。セッションのサマリと問題別の回答履歴を返す。
 */
import { assertOwner, getAuthContext } from '../common/auth';
import { INDEXES, TABLES, tableName } from '../common/config';
import { getItem, query } from '../common/dynamodb';
import { NotFoundError, ValidationError } from '../common/errors';
import { requestOrigin, withErrorHandling } from '../common/handler';
import { ok } from '../common/response';
import type { AnswerHistoryItem, ExamSessionItem } from '../models';

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
  const answers = [...items]
    .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt))
    .map((item) => ({
      questionId: item.questionId,
      isCorrect: item.isCorrect,
      answeredAt: item.answeredAt,
    }));

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
