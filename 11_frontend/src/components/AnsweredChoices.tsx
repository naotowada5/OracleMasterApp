/**
 * 採点済みの選択肢一覧。
 *
 * 対応設計書: S-07 解説画面 §3 / S-09 解答結果画面 §3
 *
 * 正解は緑、ユーザーが選んだが正解ではなかった選択肢は赤枠で示す。
 * S-07（解説）と S-09（結果の問題別詳細）で同じ表現を使うため部品化している。
 */

interface AnsweredChoice {
  choiceId: string;
  label: string;
  choiceText: string;
}

interface AnsweredChoicesProps {
  choices: AnsweredChoice[];
  /** 正解の選択肢ID */
  correctChoiceIds: string[];
  /** ユーザーが選んだ選択肢ID */
  selectedChoiceIds: string[];
}

export function AnsweredChoices({
  choices,
  correctChoiceIds,
  selectedChoiceIds,
}: AnsweredChoicesProps) {
  return (
    <ul className="exam__choices exam__choices--readonly">
      {choices.map((choice) => {
        const isCorrectChoice = correctChoiceIds.includes(choice.choiceId);
        const isSelectedByUser = selectedChoiceIds.includes(choice.choiceId);
        // 選んだが正解ではなかった選択肢を赤枠で示す
        const isWrongSelection = isSelectedByUser && !isCorrectChoice;

        return (
          <li key={choice.choiceId}>
            <div
              className={[
                'choice',
                isCorrectChoice ? 'choice--correct' : '',
                isWrongSelection ? 'choice--wrong-selection' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="choice__label">{choice.label}</span>
              <span className="choice__text">{choice.choiceText}</span>
              <span className="choice__marks">
                {isSelectedByUser && (
                  <span className="choice__mark choice__mark--selected">あなたの回答</span>
                )}
                {isCorrectChoice && (
                  <span className="choice__mark choice__mark--correct">正解</span>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
