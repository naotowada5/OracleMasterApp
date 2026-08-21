import { extractCorrectChoiceIds, isAnswerCorrect } from '../../src/services/scoring-service';
import type { ChoiceItem } from '../../src/models';

const AUDIT = {
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBy: 'SYSTEM',
  updatedAt: '2026-06-01T00:00:00.000Z',
  updatedBy: 'SYSTEM',
};

function choice(choiceId: string, isCorrect: boolean, sortOrder: number): ChoiceItem {
  return {
    choiceId,
    questionId: 'q-1',
    label: String.fromCharCode(64 + sortOrder),
    choiceText: `選択肢${sortOrder}`,
    isCorrect,
    sortOrder,
    ...AUDIT,
  };
}

describe('extractCorrectChoiceIds', () => {
  it('isCorrect=true の選択肢IDのみを返す', () => {
    const choices = [choice('ch-1', true, 1), choice('ch-2', false, 2), choice('ch-3', true, 3)];

    expect(extractCorrectChoiceIds(choices)).toEqual(['ch-1', 'ch-3']);
  });

  it('正解が無い場合は空配列', () => {
    expect(extractCorrectChoiceIds([choice('ch-1', false, 1)])).toEqual([]);
  });
});

describe('isAnswerCorrect（要件定義書 F-04: 完全一致のみ正解・部分点なし）', () => {
  describe('単一選択', () => {
    it('正解の選択肢を選べば正解', () => {
      expect(isAnswerCorrect(['ch-1'], ['ch-1'])).toBe(true);
    });

    it('別の選択肢を選べば不正解', () => {
      expect(isAnswerCorrect(['ch-2'], ['ch-1'])).toBe(false);
    });

    it('正解を含んでいても余分に選べば不正解', () => {
      expect(isAnswerCorrect(['ch-1', 'ch-2'], ['ch-1'])).toBe(false);
    });
  });

  describe('複数選択', () => {
    it('正解集合と完全一致すれば正解', () => {
      expect(isAnswerCorrect(['ch-1', 'ch-3'], ['ch-1', 'ch-3'])).toBe(true);
    });

    it('順序が違っても正解', () => {
      expect(isAnswerCorrect(['ch-3', 'ch-1'], ['ch-1', 'ch-3'])).toBe(true);
    });

    it('**部分正解は不正解**（正解2つのうち1つだけ選択）', () => {
      expect(isAnswerCorrect(['ch-1'], ['ch-1', 'ch-3'])).toBe(false);
    });

    it('**過剰選択は不正解**（正解2つに加えて誤答も選択）', () => {
      expect(isAnswerCorrect(['ch-1', 'ch-2', 'ch-3'], ['ch-1', 'ch-3'])).toBe(false);
    });

    it('件数は合うが中身が違えば不正解', () => {
      expect(isAnswerCorrect(['ch-1', 'ch-2'], ['ch-1', 'ch-3'])).toBe(false);
    });

    it('全く重ならなければ不正解', () => {
      expect(isAnswerCorrect(['ch-2', 'ch-4'], ['ch-1', 'ch-3'])).toBe(false);
    });
  });

  describe('境界・異常系', () => {
    it('未選択は不正解', () => {
      expect(isAnswerCorrect([], ['ch-1'])).toBe(false);
    });

    it('同じIDを重複送信しても集合として扱う', () => {
      expect(isAnswerCorrect(['ch-1', 'ch-1'], ['ch-1'])).toBe(true);
    });

    it('重複送信で正解数を偽装できない', () => {
      expect(isAnswerCorrect(['ch-1', 'ch-1'], ['ch-1', 'ch-3'])).toBe(false);
    });

    it('正解が0件の問題はどの選択でも不正解（データ不整合の保護）', () => {
      expect(isAnswerCorrect(['ch-1'], [])).toBe(false);
      expect(isAnswerCorrect([], [])).toBe(false);
    });
  });
});
