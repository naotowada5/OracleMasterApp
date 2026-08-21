/**
 * API-07 試験セッション開始（POST /sessions）
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/個別API設計書/API-07_試験セッション開始.md
 *
 * `userId` はCognitoトークンの `sub` を正とし、クライアント指定値は無視する
 * （要件定義書 §9.1）。
 */
import { randomUUID } from 'node:crypto';
import { createAuditFields } from '../common/audit';
import { getAuthContext } from '../common/auth';
import { TABLES, tableName } from '../common/config';
import { putItem } from '../common/dynamodb';
import { requestOrigin, withErrorHandling } from '../common/handler';
import { optionalIntInRange, parseJsonBody, requireString } from '../common/request';
import { created } from '../common/response';
import { ValidationError } from '../common/errors';
import type { ExamSessionItem } from '../models';

const MAX_TOTAL_QUESTIONS = 100;
const MAX_TIME_LIMIT_MIN = 600;

export const handler = withErrorHandling('API-07', async (event) => {
  const auth = getAuthContext(event);
  const body = parseJsonBody(event);

  const qualificationId = requireString(body.qualificationId, 'qualificationId', '資格ID');
  const totalQuestions = optionalIntInRange(
    body.totalQuestions,
    'totalQuestions',
    '出題数',
    1,
    MAX_TOTAL_QUESTIONS,
  );
  if (totalQuestions === undefined) {
    throw new ValidationError('出題数を指定してください', [
      { field: 'totalQuestions', reason: 'required' },
    ]);
  }

  // 未設定時は 0（無制限）として保存する
  const timeLimitMin =
    optionalIntInRange(body.timeLimitMin, 'timeLimitMin', '制限時間', 0, MAX_TIME_LIMIT_MIN) ?? 0;

  const now = new Date();
  const session: ExamSessionItem = {
    sessionId: randomUUID(),
    userId: auth.userId,
    qualificationId,
    totalQuestions,
    correctCount: 0,
    timeLimitMin,
    elapsedSec: 0,
    status: 'in_progress',
    startedAt: now.toISOString(),
    ...createAuditFields(auth.userId, now),
  };

  await putItem(tableName(TABLES.EXAM_SESSION), session);

  // 共通項目はレスポンスに含めない（API共通設計 §8.1）
  return created(
    {
      sessionId: session.sessionId,
      userId: session.userId,
      qualificationId: session.qualificationId,
      totalQuestions: session.totalQuestions,
      timeLimitMin: session.timeLimitMin,
      status: session.status,
      startedAt: session.startedAt,
    },
    requestOrigin(event),
  );
});
