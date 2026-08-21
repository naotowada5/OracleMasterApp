/**
 * 選択肢の取得。API-03（問題一覧）と API-04（ランダム出題）で共用する。
 *
 * 対応設計書: 01_docs/02_sd/03_データベース設計/個別エンティティ定義書/T-04_OR_M_CHOICE.md
 */
import { INDEXES, TABLES, tableName } from '../common/config';
import { query } from '../common/dynamodb';
import type { ChoiceItem } from '../models';

/**
 * 問題IDごとの選択肢を取得する。表示順は `sortOrder` 昇順。
 *
 * 各問題について GSI `questionId-index` を Query する（テーブル一覧 §アクセスパターン一覧）。
 * 1ページあたりの問題数は最大100件（API共通設計 §7）であり、Query は並列実行するため
 * レスポンス目標（要件定義書 §8.1）に収まる想定。
 */
export async function fetchChoicesByQuestionIds(
  questionIds: string[],
): Promise<Map<string, ChoiceItem[]>> {
  const uniqueIds = [...new Set(questionIds)];

  const results = await Promise.all(
    uniqueIds.map(async (questionId) => {
      const { items } = await query<ChoiceItem>({
        TableName: tableName(TABLES.CHOICE),
        IndexName: INDEXES.QUESTION_ID,
        KeyConditionExpression: 'questionId = :questionId',
        ExpressionAttributeValues: { ':questionId': questionId },
      });
      const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
      return [questionId, sorted] as const;
    }),
  );

  return new Map(results);
}
