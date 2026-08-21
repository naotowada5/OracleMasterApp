/**
 * 問題インポートJSONの検証。
 *
 * 対応設計書: 要件定義書 §7.2「問題インポート用 JSON スキーマ」
 *             01_docs/02_sd/02_API設計/個別API設計書/API-05_問題インポート.md
 *
 * Phase3 の問題インポートAPI（API-05）と同一フォーマットを扱う。将来 API-05 を
 * 実装する際は、このバリデーションと同じ制約をLambda側にも実装すること。
 */

const QUESTION_TYPES = ['single', 'multiple'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const MIN_CHOICES = 2;
const MAX_CHOICES = 10;

/**
 * インポートファイル1件を検証する。
 *
 * @returns {{ errors: string[] }} 検出したエラーの一覧（空なら妥当）
 */
export function validateImportFile(data, fileLabel = 'input') {
  const errors = [];
  const at = (path) => `${fileLabel}${path}`;

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { errors: [`${fileLabel}: JSONのルートはオブジェクトである必要があります`] };
  }
  if (typeof data.qualificationId !== 'string' || data.qualificationId.length === 0) {
    errors.push(`${at('.qualificationId')}: 必須の文字列です`);
  }
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    errors.push(`${at('.questions')}: 1件以上の配列である必要があります`);
    return { errors };
  }

  data.questions.forEach((question, index) => {
    const q = `.questions[${index}]`;

    for (const field of ['questionText', 'explanation']) {
      if (typeof question[field] !== 'string' || question[field].length === 0) {
        errors.push(`${at(`${q}.${field}`)}: 必須の文字列です`);
      }
    }
    if (!QUESTION_TYPES.includes(question.questionType)) {
      errors.push(`${at(`${q}.questionType`)}: ${QUESTION_TYPES.join(' / ')} のいずれかです`);
    }
    if (question.difficulty !== undefined && !DIFFICULTIES.includes(question.difficulty)) {
      errors.push(`${at(`${q}.difficulty`)}: ${DIFFICULTIES.join(' / ')} のいずれかです`);
    }
    if (question.categoryName !== undefined && typeof question.categoryName !== 'string') {
      errors.push(`${at(`${q}.categoryName`)}: 文字列である必要があります`);
    }

    const choices = question.choices;
    if (!Array.isArray(choices) || choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) {
      errors.push(
        `${at(`${q}.choices`)}: ${MIN_CHOICES}〜${MAX_CHOICES}件の配列である必要があります`,
      );
      return;
    }

    const labels = new Set();
    choices.forEach((choice, ci) => {
      const c = `${q}.choices[${ci}]`;
      for (const field of ['label', 'choiceText']) {
        if (typeof choice[field] !== 'string' || choice[field].length === 0) {
          errors.push(`${at(`${c}.${field}`)}: 必須の文字列です`);
        }
      }
      if (typeof choice.isCorrect !== 'boolean') {
        errors.push(`${at(`${c}.isCorrect`)}: 真偽値である必要があります`);
      }
      if (typeof choice.label === 'string') {
        if (labels.has(choice.label)) {
          errors.push(`${at(`${c}.label`)}: ラベル "${choice.label}" が重複しています`);
        }
        labels.add(choice.label);
      }
    });

    // 正解数と questionType の整合性（T-04 §5 制約）
    const correctCount = choices.filter((choice) => choice.isCorrect === true).length;
    if (question.questionType === 'single' && correctCount !== 1) {
      errors.push(
        `${at(q)}: questionType=single の正解は1件である必要があります（現在${correctCount}件）`,
      );
    }
    if (question.questionType === 'multiple' && correctCount < 2) {
      errors.push(
        `${at(q)}: questionType=multiple の正解は2件以上である必要があります（現在${correctCount}件）`,
      );
    }
  });

  return { errors };
}
