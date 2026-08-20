/**
 * dev環境への動作確認用データ投入（暫定）。
 *
 * Postman や curl でAPIを叩く際に、マスタが空だと API-01 が空配列・API-02 が
 * 404 を返してしまうため、最小限のデータを投入する。
 *
 * Step 3（T3-1）で 14_script に本格的な投入スクリプトを実装したら、
 * このファイルは削除してそちらへ寄せる。
 *
 * 実行: 12_backend で `node docs/postman/seed-dev.mjs`
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';

const PREFIX = process.env.TABLE_NAME_PREFIX ?? 'dev';
const NOW = new Date().toISOString();

/** 共通項目。投入スクリプト経由のため登録者・更新者は SYSTEM（テーブル一覧 §共通項目） */
const audit = { createdAt: NOW, createdBy: 'SYSTEM', updatedAt: NOW, updatedBy: 'SYSTEM' };

/** 要件定義書 §1.4 の対応資格 */
const qualifications = [
  { qualificationId: '1Z0-085-JPN', name: 'Oracle Master Bronze DBA', level: 'bronze' },
  { qualificationId: '1Z0-071-JPN', name: 'Oracle Master Silver SQL', level: 'silver' },
  { qualificationId: '1Z0-082-JPN', name: 'Oracle Master Silver DBA', level: 'silver' },
  { qualificationId: '1Z0-083-JPN', name: 'Oracle Master Gold DBA', level: 'gold' },
].map((item) => ({ ...item, isActive: true, ...audit }));

// sortOrder 昇順ソートの確認ができるよう、あえて順不同で定義する
const categories = [
  { qualificationId: '1Z0-085-JPN', categoryName: 'バックアップとリカバリ', sortOrder: 3 },
  { qualificationId: '1Z0-085-JPN', categoryName: 'SELECT文の基礎', sortOrder: 1 },
  { qualificationId: '1Z0-085-JPN', categoryName: '表領域の管理', sortOrder: 2 },
  { qualificationId: '1Z0-071-JPN', categoryName: '結合とサブクエリ', sortOrder: 2 },
  { qualificationId: '1Z0-071-JPN', categoryName: 'SELECT文の基礎', sortOrder: 1 },
].map((item) => ({ categoryId: randomUUID(), ...item, ...audit }));

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function putAll(logicalTable, items) {
  const table = `${PREFIX}-${logicalTable}`;
  const result = await client.send(
    new BatchWriteCommand({
      RequestItems: { [table]: items.map((Item) => ({ PutRequest: { Item } })) },
    }),
  );
  const unprocessed = result.UnprocessedItems?.[table]?.length ?? 0;
  if (unprocessed > 0) {
    throw new Error(`${table}: ${unprocessed} 件が未処理のまま残りました`);
  }
  console.log(`${table}: ${items.length} 件を投入しました`);
}

await putAll('OR_M_QUALIFICATION', qualifications);
await putAll('OR_M_CATEGORY', categories);
console.log('投入完了');
