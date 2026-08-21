/**
 * DynamoDB DocumentClient のラッパー。
 *
 * 対応設計書: 01_docs/02_sd/03_データベース設計/テーブル一覧.md
 *
 * クライアントはモジュールスコープで生成し、Lambda の実行環境が再利用される
 * 間はコネクションを使い回す（コールドスタート以外のオーバーヘッドを避ける）。
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
  type QueryCommandInput,
  type ScanCommandInput,
  type TransactWriteCommandInput,
  type UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';

let cachedClient: DynamoDBDocumentClient | undefined;

export function documentClient(): DynamoDBDocumentClient {
  if (!cachedClient) {
    cachedClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: {
        // 未定義の属性は書き込まない
        removeUndefinedValues: true,
        // 空文字列はそのまま保持する（DynamoDBは空文字列を許容する）
        convertEmptyValues: false,
      },
    });
  }
  return cachedClient;
}

/** 単一アイテムを取得する。存在しない場合は undefined */
export async function getItem<T>(
  table: string,
  key: Record<string, unknown>,
): Promise<T | undefined> {
  const result = await documentClient().send(new GetCommand({ TableName: table, Key: key }));
  return result.Item as T | undefined;
}

/**
 * アイテムを登録する。
 *
 * @param conditionExpression 条件付き書き込みの式（例: `attribute_not_exists(userId)`）。
 *   条件を満たさない場合 `ConditionalCheckFailedException` が送出される
 */
export async function putItem<T extends object>(
  table: string,
  item: T,
  conditionExpression?: string,
): Promise<void> {
  await documentClient().send(
    new PutCommand({
      TableName: table,
      Item: item,
      ...(conditionExpression ? { ConditionExpression: conditionExpression } : {}),
    }),
  );
}

export interface QueryResult<T> {
  items: T[];
  lastEvaluatedKey: Record<string, unknown> | undefined;
}

/** Query を1ページ分実行する */
export async function query<T>(input: QueryCommandInput): Promise<QueryResult<T>> {
  const result = await documentClient().send(new QueryCommand(input));
  return {
    items: (result.Items ?? []) as T[],
    lastEvaluatedKey: result.LastEvaluatedKey,
  };
}

/**
 * Scan で全件取得する。
 *
 * 件数が少ないマスタ（OR_M_QUALIFICATION）専用。それ以外のテーブルでは
 * GSI を用いた Query を使うこと（テーブル一覧 §アクセスパターン一覧）。
 */
export async function scanAll<T>(input: ScanCommandInput): Promise<T[]> {
  const items: T[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await documentClient().send(
      new ScanCommand({ ...input, ExclusiveStartKey: exclusiveStartKey }),
    );
    items.push(...((result.Items ?? []) as T[]));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

/** アイテムを更新する */
export async function updateItem<T>(input: UpdateCommandInput): Promise<T | undefined> {
  const result = await documentClient().send(new UpdateCommand(input));
  return result.Attributes as T | undefined;
}

/**
 * 複数アイテムをトランザクションで書き込む。
 *
 * 問題と選択肢のように、孤立レコードが発生してはならない組み合わせで使用する
 * （ER図 §参照整合性の担保方針）。
 */
export async function transactWrite(input: TransactWriteCommandInput): Promise<void> {
  await documentClient().send(new TransactWriteCommand(input));
}
