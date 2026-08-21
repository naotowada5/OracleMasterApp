/**
 * dev環境のマスタデータを全削除する（動作確認のやり直し用）。
 *
 * seed-dev.mjs は冪等になっているため通常は不要だが、過去に非冪等な投入で
 * 重複したレコードを掃除する場合に使う。dev環境専用。
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const PREFIX = process.env.TABLE_NAME_PREFIX ?? 'dev';

if (PREFIX !== 'dev') {
  throw new Error(`dev環境専用のスクリプトです（TABLE_NAME_PREFIX=${PREFIX}）`);
}

const TARGETS = [
  { table: 'OR_M_QUALIFICATION', key: 'qualificationId' },
  { table: 'OR_M_CATEGORY', key: 'categoryId' },
  { table: 'OR_M_QUESTION', key: 'questionId' },
  { table: 'OR_M_CHOICE', key: 'choiceId' },
];

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

for (const { table, key } of TARGETS) {
  const tableName = `${PREFIX}-${table}`;
  const scanned = await client.send(
    new ScanCommand({ TableName: tableName, ProjectionExpression: key }),
  );
  const items = scanned.Items ?? [];

  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    await client.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: batch.map((item) => ({ DeleteRequest: { Key: { [key]: item[key] } } })),
        },
      }),
    );
  }

  console.log(`${tableName}: ${items.length} 件を削除しました`);
}

console.log('削除完了');
