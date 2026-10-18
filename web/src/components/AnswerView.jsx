import { Fragment } from 'react';

// Split "foo [1] bar [2][3]" into text and citation tokens.
function tokenize(answer) {
  return answer.split(/(\[\d{1,2}\])/g).filter(Boolean).map((part) => {
    const m = part.match(/^\[(\d{1,2})\]$/);
    return m ? { ref: Number(m[1]) } : { text: part };
  });
}

export function AnswerView({ answer, sourceCount, onCiteClick }) {
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-stone-800">
      {tokenize(answer).map((tok, i) =>
        tok.ref && tok.ref <= sourceCount ? (
          <button
            key={i}
            type="button"
            onClick={() => onCiteClick(tok.ref)}
            className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-indigo-100 px-1 align-text-top text-[11px] font-semibold text-indigo-800 hover:bg-indigo-200"
            aria-label={`Go to source ${tok.ref}`}
          >
            {tok.ref}
          </button>
        ) : (
          <Fragment key={i}>{tok.text ?? `[${tok.ref}]`}</Fragment>
        ),
      )}
    </p>
  );
}
