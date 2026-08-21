/**
 * 採点ロジック。
 *
 * 対応設計書: 01_docs/02_sd/02_API設計/個別API設計書/API-08_セッション更新.md §4
 *             要件定義書 F-04
 *
 * **選択した選択肢の集合と正解選択肢の集合が完全に一致した場合のみ正解**とする。
 * 部分点・部分正解の扱いは無い。単一選択・複数選択で判定ロジックを分けない。
 */
import type { ChoiceItem } from '../models';

/** 正解の選択肢ID一覧を取り出す（表示順は保持しない） */
export function extractCorrectChoiceIds(choices: ChoiceItem[]): string[] {
  return choices.filter((choice) => choice.isCorrect).map((choice) => choice.choiceId);
}

/**
 * 選択集合と正解集合の完全一致で採点する。
 *
 * - 順序は問わない
 * - 同じIDを重複して送ってきた場合は1つとして扱う（集合として比較するため）
 * - 正解が0件の問題は、どの選択でも不正解とする（データ不整合の保護）
 *
 * @param selectedChoiceIds クライアントが選択した選択肢ID
 * @param correctChoiceIds  `isCorrect=true` の選択肢ID
 */
export function isAnswerCorrect(selectedChoiceIds: string[], correctChoiceIds: string[]): boolean {
  if (correctChoiceIds.length === 0) {
    return false;
  }

  const selected = new Set(selectedChoiceIds);
  const correct = new Set(correctChoiceIds);

  if (selected.size !== correct.size) {
    return false;
  }

  for (const id of correct) {
    if (!selected.has(id)) {
      return false;
    }
  }

  return true;
}
