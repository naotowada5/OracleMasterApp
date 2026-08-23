/**
 * E2Eテスト用のモックデータ。
 *
 * 各APIの設計書（01_docs/02_sd/02_API設計/個別API設計書/）のレスポンス仕様に
 * 沿った形にしている。実装が設計から外れた場合はここと食い違って落ちる。
 */

export const TEST_USER = {
  userId: 'e2e-sub-0001',
  email: 'e2e@example.com',
  displayName: 'E2Eテスト太郎',
};

/** API-10 GET /users/me */
export const userProfile = {
  userId: TEST_USER.userId,
  email: TEST_USER.email,
  displayName: TEST_USER.displayName,
  createdAt: '2026-06-01T00:00:00.000Z',
  lastLoginAt: '2026-08-23T10:00:00.000Z',
};

/** API-01 GET /qualifications */
export const qualifications = {
  items: [
    {
      qualificationId: '1Z0-085-JPN',
      name: 'Oracle Master Bronze DBA',
      level: 'bronze',
      isActive: true,
    },
    {
      qualificationId: '1Z0-082-JPN',
      name: 'Oracle Master Silver DBA',
      level: 'silver',
      isActive: true,
    },
  ],
};

/** API-02 GET /categories */
export const categories = {
  items: [
    {
      categoryId: 'cat-1',
      qualificationId: '1Z0-082-JPN',
      categoryName: 'Oracleインスタンスの構造',
      sortOrder: 1,
    },
    {
      categoryId: 'cat-2',
      qualificationId: '1Z0-082-JPN',
      categoryName: 'プロセス・アーキテクチャ',
      sortOrder: 2,
    },
  ],
};

/** 正解が2つある複数選択問題（完全一致判定の検証に使う） */
export const MULTI_QUESTION_ID = 'q-multi';
/** 正解が1つの単一選択問題 */
export const SINGLE_QUESTION_ID = 'q-single';

const multiChoices = [
  { choiceId: 'ch-m1', label: 'A', choiceText: '正しい記述その1', isCorrect: true, sortOrder: 1 },
  { choiceId: 'ch-m2', label: 'B', choiceText: '誤った記述その1', isCorrect: false, sortOrder: 2 },
  { choiceId: 'ch-m3', label: 'C', choiceText: '正しい記述その2', isCorrect: true, sortOrder: 3 },
  { choiceId: 'ch-m4', label: 'D', choiceText: '誤った記述その2', isCorrect: false, sortOrder: 4 },
];

const singleChoices = [
  { choiceId: 'ch-s1', label: 'A', choiceText: '唯一の正解', isCorrect: true, sortOrder: 1 },
  { choiceId: 'ch-s2', label: 'B', choiceText: '不正解の選択肢', isCorrect: false, sortOrder: 2 },
];

export const MULTI_CORRECT_IDS = ['ch-m1', 'ch-m3'];
export const MULTI_WRONG_ID = 'ch-m2';
export const SINGLE_CORRECT_ID = 'ch-s1';

export const MULTI_EXPLANATION = 'この問題の解説です。AとCが正しい記述です。';
export const SINGLE_EXPLANATION = 'この問題の解説です。Aが唯一の正解です。';

/** API-04 POST /questions/random（正解フラグと解説を含まない） */
export const randomQuestions = {
  questions: [
    {
      questionId: MULTI_QUESTION_ID,
      questionText: '正しい記述を2つ選択してください。',
      questionType: 'multiple' as const,
      correctCount: 2,
      choices: multiChoices.map(({ choiceId, label, choiceText }) => ({
        choiceId,
        label,
        choiceText,
      })),
    },
    {
      questionId: SINGLE_QUESTION_ID,
      questionText: '正しい記述を1つ選択してください。',
      questionType: 'single' as const,
      correctCount: 1,
      choices: singleChoices.map(({ choiceId, label, choiceText }) => ({
        choiceId,
        label,
        choiceText,
      })),
    },
  ],
  actualCount: 2,
};

/** API-03 GET /questions（正解フラグと解説を含む） */
export const questionList = {
  items: [
    {
      questionId: MULTI_QUESTION_ID,
      qualificationId: '1Z0-082-JPN',
      categoryId: 'cat-1',
      questionText: '正しい記述を2つ選択してください。',
      questionType: 'multiple' as const,
      correctCount: 2,
      difficulty: 'medium',
      explanation: MULTI_EXPLANATION,
      choices: multiChoices,
    },
  ],
  nextToken: null,
};

/** API-07 POST /sessions */
export const SESSION_ID = 'e2e-session-0001';

export const createdSession = {
  sessionId: SESSION_ID,
  userId: TEST_USER.userId,
  qualificationId: '1Z0-082-JPN',
  totalQuestions: 2,
  timeLimitMin: 0,
  status: 'in_progress' as const,
  startedAt: '2026-08-23T10:00:00.000Z',
};

/** API-08 の採点結果を、選択内容から設計どおりに組み立てる（完全一致のみ正解） */
export function buildAnswerResult(questionId: string, selectedChoiceIds: string[]) {
  const isMulti = questionId === MULTI_QUESTION_ID;
  const correctChoiceIds = isMulti ? MULTI_CORRECT_IDS : [SINGLE_CORRECT_ID];
  const selected = new Set(selectedChoiceIds);
  const isCorrect =
    selected.size === correctChoiceIds.length && correctChoiceIds.every((id) => selected.has(id));

  return {
    historyId: `h-${questionId}`,
    questionId,
    isCorrect,
    correctChoiceIds,
    explanation: isMulti ? MULTI_EXPLANATION : SINGLE_EXPLANATION,
    sessionStatus: 'in_progress' as const,
    sessionCorrectCount: isCorrect ? 1 : 0,
    isLastQuestion: !isMulti,
  };
}

/** API-09 GET /sessions/{sessionId} */
export function buildSessionDetail(
  answers: { questionId: string; isCorrect: boolean; selectedChoiceIds: string[] }[],
) {
  return {
    sessionId: SESSION_ID,
    qualificationId: '1Z0-082-JPN',
    totalQuestions: 2,
    correctCount: answers.filter((a) => a.isCorrect).length,
    timeLimitMin: 0,
    elapsedSec: 120,
    status: 'completed' as const,
    startedAt: '2026-08-23T10:00:00.000Z',
    finishedAt: '2026-08-23T10:02:00.000Z',
    answers: answers.map((answer, index) => {
      const isMulti = answer.questionId === MULTI_QUESTION_ID;
      return {
        questionId: answer.questionId,
        isCorrect: answer.isCorrect,
        answeredAt: `2026-08-23T10:0${index + 1}:00.000Z`,
        selectedChoiceIds: answer.selectedChoiceIds,
        questionText: isMulti
          ? '正しい記述を2つ選択してください。'
          : '正しい記述を1つ選択してください。',
        questionType: isMulti ? 'multiple' : 'single',
        explanation: isMulti ? MULTI_EXPLANATION : SINGLE_EXPLANATION,
        choices: isMulti ? multiChoices : singleChoices,
      };
    }),
  };
}
