/**
 * マスタデータ全削除スクリプト。
 *
 * 投入データを作り直したい場合に使用する。トランザクション系テーブル
 * （OR_T_EXAM_SESSION / OR_T_ANSWER_HISTORY）や OR_M_USER には触れない。
 *
 * 使い方:
 *   node src/purge.mjs --env dev
 *
 * 安全のため prod は既定で拒否する（どうしても必要な場合は --force を付ける）。
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const BATCH_SIZE = 25;

const TARGETS = [
  { table: 'OR_M_CHOICE', key: 'choiceId' },
  { table: 'OR_M_QUESTION', key: 'questionId' },
  { table: 'OR_M_CATEGORY', key: 'categoryId' },
  { table: 'OR_M_QUALIFICATION', key: 'qualificationId' },
];

function parseArgs(argv) {
  const args = { env: null, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--env') args.env = argv[(i += 1)];
    else if (argv[i] === '--force') args.force = true;
    else throw new Error(`不明な引数です: ${argv[i]}`);
  }
  if (!['dev', 'stg', 'prod'].includes(args.env)) {
    throw new Error('--env <dev|stg|prod> を指定してください');
  }
  if (args.env === 'prod' && !args.force) {
    throw new Error('prod環境の削除には --force が必要です');
  }
  return args;
}

async function scanAll(client, tableName, key) {
  const items = [];
  let exclusiveStartKey;
  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: '#k',
        ExpressionAttributeNames: { '#k': key },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    items.push(...(result.Items ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  for (const { table, key } of TARGETS) {
    const tableName = `${args.env}-${table}`;
    const items = await scanAll(client, tableName, key);

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
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
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
