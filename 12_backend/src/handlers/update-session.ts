/**
 * API-08 セッション更新（PUT /sessions/{sessionId}）
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/個別API設計書/API-08_セッション更新.md
 *
 * 1問ごとの回答を受け取り、**サーバー側で採点**して回答履歴に記録する。
 * 採点は選択集合と正解集合の完全一致のみ（要件定義書 F-04、部分点なし）。
 * クライアントには正解を事前に渡さない設計のため、正誤判定は必ずここで行う。
 */
import { randomUUID } from 'node:crypto';
import { createAuditFields, updateAuditFields } from '../common/audit';
import { assertOwner, getAuthContext, type AuthContext } from '../common/auth';
import { INDEXES, TABLES, tableName } from '../common/config';
import { getItem, putItem, query, updateItem } from '../common/dynamodb';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { requestOrigin, withErrorHandling } from '../common/handler';
import { parseJsonBody } from '../common/request';
import { ok } from '../common/response';
import { extractCorrectChoiceIds, isAnswerCorrect } from '../services/scoring-service';
import type { AnswerHistoryItem, ChoiceItem, ExamSessionItem } from '../models';

interface UpdateSessionBody {
  action?: unknown;
  questionId?: unknown;
  selectedChoiceIds?: unknown;
  elapsedSec?: unknown;
}

/** セッションを取得し、存在と所有者を検証する */
async function loadOwnedSession(sessionId: string, auth: AuthContext): Promise<ExamSessionItem> {
  const session = await getItem<ExamSessionItem>(tableName(TABLES.EXAM_SESSION), { sessionId });
  if (!session) {
    throw new NotFoundError('指定されたセッションが見つかりません');
  }
  assertOwner(session.userId, auth);
  return session;
}

/** 制限時間を超過しているか。`timeLimitMin=0` は無制限 */
function isTimeExpired(session: ExamSessionItem, elapsedSec: number | undefined): boolean {
  if (session.timeLimitMin <= 0 || elapsedSec === undefined) {
    return false;
  }
  return elapsedSec > session.timeLimitMin * 60;
}

/** リクエストボディから回答内容を取り出して検証する */
function parseAnswer(body: UpdateSessionBody): {
  questionId: string;
  selectedChoiceIds: string[];
  elapsedSec: number | undefined;
} {
  const { questionId, selectedChoiceIds } = body;

  if (typeof questionId !== 'string' || questionId.length === 0) {
    throw new ValidationError('問題IDを指定してください', [
      { field: 'questionId', reason: 'required' },
    ]);
  }

  if (
    !Array.isArray(selectedChoiceIds) ||
    selectedChoiceIds.length === 0 ||
    !selectedChoiceIds.every((id) => typeof id === 'string' && id.length > 0)
  ) {
    throw new ValidationError('選択した選択肢を指定してください', [
      { field: 'selectedChoiceIds', reason: 'required' },
    ]);
  }

  return {
    questionId,
    selectedChoiceIds: selectedChoiceIds as string[],
    elapsedSec: typeof body.elapsedSec === 'number' ? body.elapsedSec : undefined,
  };
}

/** セッションに紐づく回答履歴を取得する */
async function fetchAnswerHistories(sessionId: string): Promise<AnswerHistoryItem[]> {
  const { items } = await query<AnswerHistoryItem>({
    TableName: tableName(TABLES.ANSWER_HISTORY),
    IndexName: INDEXES.SESSION_ID,
    KeyConditionExpression: 'sessionId = :sessionId',
    ExpressionAttributeValues: { ':sessionId': sessionId },
  });
  return items;
}

/** `action=answer`: 採点して回答履歴を作成し、セッションの進捗を更新する */
async function handleAnswer(
  session: ExamSessionItem,
  body: UpdateSessionBody,
  auth: AuthContext,
  now: Date,
) {
  // 完了済みセッションへの回答は受け付けない
  if (session.status !== 'in_progress') {
    throw new ConflictError('このセッションは終了しています');
  }

  const { questionId, selectedChoiceIds, elapsedSec } = parseAnswer(body);

  // 正解集合は必ずサーバー側で算出する
  const { items: choices } = await query<ChoiceItem>({
    TableName: tableName(TABLES.CHOICE),
    IndexName: INDEXES.QUESTION_ID,
    KeyConditionExpression: 'questionId = :questionId',
    ExpressionAttributeValues: { ':questionId': questionId },
  });

  if (choices.length === 0) {
    throw new NotFoundError('指定された問題が見つかりません');
  }

  const correctChoiceIds = extractCorrectChoiceIds(choices);
  const histories = await fetchAnswerHistories(session.sessionId);

  // 多重送信（同一 sessionId + questionId）への冪等性の担保。
  // 既存の回答があれば上書きせず、既存の結果をそのまま返す（二重採点を防ぐ）
  const existing = histories.find((history) => history.questionId === questionId);
  if (existing) {
    return {
      historyId: existing.historyId,
      questionId,
      isCorrect: existing.isCorrect,
      correctChoiceIds,
      sessionStatus: session.status,
      sessionCorrectCount: session.correctCount,
      isLastQuestion: histories.length >= session.totalQuestions,
    };
  }

  const correct = isAnswerCorrect(selectedChoiceIds, correctChoiceIds);

  const history: AnswerHistoryItem = {
    historyId: randomUUID(),
    sessionId: session.sessionId,
    questionId,
    selectedChoiceIds,
    isCorrect: correct,
    answeredAt: now.toISOString(),
    ...createAuditFields(auth.userId, now),
  };
  await putItem(tableName(TABLES.ANSWER_HISTORY), history);

  // 制限時間超過時は、本回答を記録した上でセッションを expired にする
  const expired = isTimeExpired(session, elapsedSec);
  const audit = updateAuditFields(auth.userId, now);

  const setExpressions = [
    'correctCount = correctCount + :increment',
    'updatedAt = :updatedAt',
    'updatedBy = :updatedBy',
  ];
  const values: Record<string, unknown> = {
    ':increment': correct ? 1 : 0,
    ':updatedAt': audit.updatedAt,
    ':updatedBy': audit.updatedBy,
  };

  if (elapsedSec !== undefined) {
    setExpressions.push('elapsedSec = :elapsedSec');
    values[':elapsedSec'] = elapsedSec;
  }
  if (expired) {
    setExpressions.push('#status = :status', 'finishedAt = :finishedAt');
    values[':status'] = 'expired';
    values[':finishedAt'] = now.toISOString();
  }

  const updated = await updateItem<ExamSessionItem>({
    TableName: tableName(TABLES.EXAM_SESSION),
    Key: { sessionId: session.sessionId },
    UpdateExpression: `SET ${setExpressions.join(', ')}`,
    ...(expired ? { ExpressionAttributeNames: { '#status': 'status' } } : {}),
    ExpressionAttributeValues: values,
    ReturnValues: 'ALL_NEW',
  });

  const answeredCount = histories.length + 1;

  return {
    historyId: history.historyId,
    questionId,
    isCorrect: correct,
    // 解説画面（S-07）のハイライト表示に使う。採点後なので開示してよい
    correctChoiceIds,
    sessionStatus: updated?.status ?? (expired ? 'expired' : session.status),
    sessionCorrectCount: updated?.correctCount ?? session.correctCount + (correct ? 1 : 0),
    // 出題数に達したか（S-07 の「結果を見る」ボタン表示判定に利用）
    isLastQuestion: answeredCount >= session.totalQuestions,
  };
}

/** `action=finish`: セッションを終了状態にする。既に終了済みなら冪等に現状を返す */
async function handleFinish(session: ExamSessionItem, auth: AuthContext, now: Date) {
  if (session.status !== 'in_progress') {
    return {
      sessionStatus: session.status,
      sessionCorrectCount: session.correctCount,
      finishedAt: session.finishedAt ?? null,
    };
  }

  // 制限時間ありのセッションで時間超過していれば expired、それ以外は completed
  const status = isTimeExpired(session, session.elapsedSec) ? 'expired' : 'completed';
  const audit = updateAuditFields(auth.userId, now);

  const updated = await updateItem<ExamSessionItem>({
    TableName: tableName(TABLES.EXAM_SESSION),
    Key: { sessionId: session.sessionId },
    UpdateExpression:
      'SET #status = :status, finishedAt = :finishedAt, updatedAt = :updatedAt, updatedBy = :updatedBy',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': status,
      ':finishedAt': now.toISOString(),
      ':updatedAt': audit.updatedAt,
      ':updatedBy': audit.updatedBy,
    },
    ReturnValues: 'ALL_NEW',
  });

  return {
    sessionStatus: updated?.status ?? status,
    sessionCorrectCount: updated?.correctCount ?? session.correctCount,
    finishedAt: updated?.finishedAt ?? now.toISOString(),
  };
}

export const handler = withErrorHandling('API-08', async (event) => {
  const auth = getAuthContext(event);
  const sessionId = event.pathParameters?.sessionId;

  if (!sessionId) {
    throw new ValidationError('セッションIDを指定してください', [
      { field: 'sessionId', reason: 'required' },
    ]);
  }

  const body = parseJsonBody<UpdateSessionBody>(event);

  if (body.action !== 'answer' && body.action !== 'finish') {
    throw new ValidationError('action には answer または finish を指定してください', [
      { field: 'action', reason: 'invalid' },
    ]);
  }

  const session = await loadOwnedSession(sessionId, auth);
  const now = new Date();

  const result: Record<string, unknown> =
    body.action === 'answer'
      ? await handleAnswer(session, body, auth, now)
      : await handleFinish(session, auth, now);

  return ok(result, requestOrigin(event));
});
