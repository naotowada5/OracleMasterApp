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
import { createHash } from 'node:crypto';

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
].map((item) => ({
  categoryId: deterministicId(item.qualificationId, item.categoryName),
  ...item,
  ...audit,
}));

/**
 * 動作確認用の問題と選択肢。
 * 採点仕様（完全一致のみ正解）を確認できるよう、単一選択と複数選択を混在させる。
 */
const questionSeeds = [
  {
    qualificationId: '1Z0-085-JPN',
    categoryName: 'SELECT文の基礎',
    questionText: '表のすべての行と列を取得するSQL文はどれか。',
    questionType: 'single',
    explanation: 'SELECT * FROM 表名 で全行全列を取得できる。',
    difficulty: 'easy',
    choices: [
      { label: 'A', choiceText: 'SELECT * FROM employees;', isCorrect: true },
      { label: 'B', choiceText: 'SELECT ALL employees;', isCorrect: false },
      { label: 'C', choiceText: 'GET * FROM employees;', isCorrect: false },
    ],
  },
  {
    qualificationId: '1Z0-085-JPN',
    categoryName: '表領域の管理',
    questionText: '表領域に関する記述のうち、正しいものを2つ選びなさい。',
    questionType: 'multiple',
    explanation: '表領域は複数のデータファイルで構成でき、オンラインとオフラインを切り替えられる。',
    difficulty: 'medium',
    choices: [
      { label: 'A', choiceText: '表領域は複数のデータファイルで構成できる', isCorrect: true },
      { label: 'B', choiceText: '表領域は必ず1つのデータファイルのみを持つ', isCorrect: false },
      { label: 'C', choiceText: '表領域はオンライン・オフラインを切り替えられる', isCorrect: true },
      { label: 'D', choiceText: '表領域は作成後に削除できない', isCorrect: false },
    ],
  },
  {
    qualificationId: '1Z0-071-JPN',
    categoryName: '結合とサブクエリ',
    questionText: '内部結合を表すキーワードはどれか。',
    questionType: 'single',
    explanation: 'INNER JOIN は両表で条件に一致する行のみを返す。',
    difficulty: 'easy',
    choices: [
      { label: 'A', choiceText: 'INNER JOIN', isCorrect: true },
      { label: 'B', choiceText: 'OUTER JOIN', isCorrect: false },
      { label: 'C', choiceText: 'CROSS JOIN', isCorrect: false },
    ],
  },
];

/**
 * キー文字列から決定的にUUID形式のIDを生成する。
 *
 * 本スクリプトを繰り返し実行しても同じIDになるため、重複レコードが増えず
 * 上書き（冪等な投入）になる。本番のID採番はUUID v4（テーブル一覧 §DynamoDB共通仕様）。
 */
function deterministicId(...parts) {
  const hex = createHash('sha256').update(parts.join('|')).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

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

// 問題と選択肢。カテゴリ名から categoryId を解決する
const questions = [];
const choices = [];
for (const seed of questionSeeds) {
  const category = categories.find(
    (c) => c.qualificationId === seed.qualificationId && c.categoryName === seed.categoryName,
  );
  if (!category) {
    throw new Error(`カテゴリが見つかりません: ${seed.categoryName}`);
  }
  const questionId = deterministicId(seed.qualificationId, seed.questionText);
  const correctCount = seed.choices.filter((c) => c.isCorrect).length;
  questions.push({
    questionId,
    qualificationId: seed.qualificationId,
    categoryId: category.categoryId,
    questionText: seed.questionText,
    questionType: seed.questionType,
    correctCount,
    explanation: seed.explanation,
    difficulty: seed.difficulty,
    isActive: true,
    ...audit,
  });
  seed.choices.forEach((choice, index) => {
    choices.push({
      choiceId: deterministicId(questionId, choice.label),
      questionId,
      label: choice.label,
      choiceText: choice.choiceText,
      isCorrect: choice.isCorrect,
      sortOrder: index + 1,
      // 選択肢の共通項目は親の問題と同一値を設定する（T-04 備考）
      ...audit,
    });
  });
}

await putAll('OR_M_QUESTION', questions);
await putAll('OR_M_CHOICE', choices);
console.log('投入完了');
