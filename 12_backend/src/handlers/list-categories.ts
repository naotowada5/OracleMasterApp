/**
 * API-02 カテゴリ一覧取得（GET /categories?qualificationId={id}）
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/個別API設計書/API-02_カテゴリ一覧取得.md
 *
 * 資格に紐づく大問カテゴリを GSI `qualificationId-index` で取得し、
 * `sortOrder` 昇順で返す。
 */
import { INDEXES, TABLES, tableName } from '../common/config';
import { getItem, query } from '../common/dynamodb';
import { NotFoundError, ValidationError } from '../common/errors';
import { requestOrigin, withErrorHandling } from '../common/handler';
import { ok } from '../common/response';
import type { CategoryItem, QualificationItem } from '../models';

/** API-02 のレスポンス要素。共通項目は含めない */
interface CategoryResponse {
  categoryId: string;
  qualificationId: string;
  categoryName: string;
  sortOrder: number;
}

export const handler = withErrorHandling('API-02', async (event) => {
  const qualificationId = event.queryStringParameters?.qualificationId;

  if (!qualificationId) {
    throw new ValidationError('資格IDを指定してください', [
      { field: 'qualificationId', reason: 'required' },
    ]);
  }

  // 資格自体が存在しない場合は404。カテゴリが0件の場合は空配列を返し404にはしない
  const qualification = await getItem<QualificationItem>(tableName(TABLES.QUALIFICATION), {
    qualificationId,
  });
  if (!qualification) {
    throw new NotFoundError('指定された資格が見つかりません');
  }

  const { items } = await query<CategoryItem>({
    TableName: tableName(TABLES.CATEGORY),
    IndexName: INDEXES.QUALIFICATION_ID,
    KeyConditionExpression: 'qualificationId = :qualificationId',
    ExpressionAttributeValues: { ':qualificationId': qualificationId },
  });

  const categories: CategoryResponse[] = items
    .map((item) => ({
      categoryId: item.categoryId,
      qualificationId: item.qualificationId,
      categoryName: item.categoryName,
      sortOrder: item.sortOrder,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return ok({ items: categories }, requestOrigin(event));
});
