/**
 * API-01 資格一覧取得（GET /qualifications）
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/個別API設計書/API-01_資格一覧取得.md
 *
 * 件数が少ないため Scan で取得する（テーブル一覧 §アクセスパターン一覧）。
 * `isActive=false` の資格は Lambda 側で除外して返す。
 */
import { TABLES, tableName } from '../common/config';
import { scanAll } from '../common/dynamodb';
import { withErrorHandling, requestOrigin } from '../common/handler';
import { ok } from '../common/response';
import type { QualificationItem } from '../models';

/** API-01 のレスポンス要素。共通項目は含めない（API共通設計 §8.1） */
interface QualificationResponse {
  qualificationId: string;
  name: string;
  level: string;
  isActive: boolean;
}

export const handler = withErrorHandling('API-01', async (event) => {
  const items = await scanAll<QualificationItem>({
    TableName: tableName(TABLES.QUALIFICATION),
  });

  const qualifications: QualificationResponse[] = items
    .filter((item) => item.isActive)
    .map((item) => ({
      qualificationId: item.qualificationId,
      name: item.name,
      level: item.level,
      isActive: item.isActive,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  return ok({ items: qualifications }, requestOrigin(event));
});
