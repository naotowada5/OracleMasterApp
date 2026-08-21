import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { validateImportFile } from '../src/schema.mjs';

/** 妥当な最小構成のインポートファイル */
function validFile(overrides = {}) {
  return {
    qualificationId: '1Z0-071-JPN',
    questions: [
      {
        categoryName: 'SELECT文の基礎',
        questionText: '問題文',
        questionType: 'single',
        difficulty: 'easy',
        explanation: '解説',
        choices: [
          { label: 'A', choiceText: '選択肢A', isCorrect: true },
          { label: 'B', choiceText: '選択肢B', isCorrect: false },
        ],
      },
    ],
    ...overrides,
  };
}

/** questions[0] の一部を差し替える */
function withQuestion(patch) {
  const file = validFile();
  file.questions[0] = { ...file.questions[0], ...patch };
  return file;
}

describe('validateImportFile', () => {
  test('妥当なファイルはエラーなし', () => {
    assert.deepEqual(validateImportFile(validFile()).errors, []);
  });

  test('qualificationId が無いとエラー', () => {
    const file = validFile();
    delete file.qualificationId;
    assert.ok(validateImportFile(file).errors.some((e) => e.includes('qualificationId')));
  });

  test('questions が空配列だとエラー', () => {
    assert.ok(validateImportFile(validFile({ questions: [] })).errors.length > 0);
  });

  test('questionType が enum 外だとエラー', () => {
    const errors = validateImportFile(withQuestion({ questionType: 'multi' })).errors;
    assert.ok(errors.some((e) => e.includes('questionType')));
  });

  test('difficulty は任意だが enum 外はエラー', () => {
    assert.deepEqual(validateImportFile(withQuestion({ difficulty: undefined })).errors, []);
    assert.ok(
      validateImportFile(withQuestion({ difficulty: 'とても難しい' })).errors.some((e) =>
        e.includes('difficulty'),
      ),
    );
  });

  test('explanation が無いとエラー（Phase1/2では事前登録が必須のため）', () => {
    assert.ok(
      validateImportFile(withQuestion({ explanation: undefined })).errors.some((e) =>
        e.includes('explanation'),
      ),
    );
  });

  describe('選択肢の件数（T-04 §5）', () => {
    test('1件だとエラー', () => {
      const errors = validateImportFile(
        withQuestion({ choices: [{ label: 'A', choiceText: 'A', isCorrect: true }] }),
      ).errors;
      assert.ok(errors.some((e) => e.includes('choices')));
    });

    test('11件だとエラー', () => {
      const choices = Array.from({ length: 11 }, (_, i) => ({
        label: String.fromCharCode(65 + i),
        choiceText: `選択肢${i}`,
        isCorrect: i === 0,
      }));
      assert.ok(
        validateImportFile(withQuestion({ choices })).errors.some((e) => e.includes('choices')),
      );
    });
  });

  describe('正解数と questionType の整合性', () => {
    test('single で正解が2件だとエラー', () => {
      const errors = validateImportFile(
        withQuestion({
          choices: [
            { label: 'A', choiceText: 'A', isCorrect: true },
            { label: 'B', choiceText: 'B', isCorrect: true },
          ],
        }),
      ).errors;
      assert.ok(errors.some((e) => e.includes('single')));
    });

    test('single で正解が0件だとエラー', () => {
      const errors = validateImportFile(
        withQuestion({
          choices: [
            { label: 'A', choiceText: 'A', isCorrect: false },
            { label: 'B', choiceText: 'B', isCorrect: false },
          ],
        }),
      ).errors;
      assert.ok(errors.some((e) => e.includes('single')));
    });

    test('multiple で正解が1件だとエラー', () => {
      const errors = validateImportFile(
        withQuestion({
          questionType: 'multiple',
          choices: [
            { label: 'A', choiceText: 'A', isCorrect: true },
            { label: 'B', choiceText: 'B', isCorrect: false },
          ],
        }),
      ).errors;
      assert.ok(errors.some((e) => e.includes('multiple')));
    });

    test('multiple で正解が2件なら妥当', () => {
      const errors = validateImportFile(
        withQuestion({
          questionType: 'multiple',
          choices: [
            { label: 'A', choiceText: 'A', isCorrect: true },
            { label: 'B', choiceText: 'B', isCorrect: true },
            { label: 'C', choiceText: 'C', isCorrect: false },
          ],
        }),
      ).errors;
      assert.deepEqual(errors, []);
    });
  });

  test('選択肢ラベルの重複はエラー', () => {
    const errors = validateImportFile(
      withQuestion({
        choices: [
          { label: 'A', choiceText: 'A', isCorrect: true },
          { label: 'A', choiceText: '重複ラベル', isCorrect: false },
        ],
      }),
    ).errors;
    assert.ok(errors.some((e) => e.includes('重複')));
  });

  test('isCorrect が真偽値でないとエラー', () => {
    const errors = validateImportFile(
      withQuestion({
        choices: [
          { label: 'A', choiceText: 'A', isCorrect: 'true' },
          { label: 'B', choiceText: 'B', isCorrect: false },
        ],
      }),
    ).errors;
    assert.ok(errors.some((e) => e.includes('isCorrect')));
  });

  test('ルートがオブジェクトでないとエラー', () => {
    assert.ok(validateImportFile([]).errors.length > 0);
    assert.ok(validateImportFile(null).errors.length > 0);
  });

  test('エラーメッセージに位置情報が含まれる', () => {
    const errors = validateImportFile(withQuestion({ questionType: 'x' }), 'sample.json').errors;
    assert.ok(errors[0].startsWith('sample.json.questions[0]'));
  });
});
