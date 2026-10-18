import { useState } from 'react';
import { useAsk } from '../hooks/useAsk.js';
import { AnswerView } from './AnswerView.jsx';
import { ErrorBanner } from './ErrorBanner.jsx';
import { SourceList } from './SourceList.jsx';

function scrollToSource(ref) {
  const el = document.getElementById(`source-${ref}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('source-flash');
  void el.offsetWidth; // restart the animation
  el.classList.add('source-flash');
}

export function AskPanel({ hasReadyItems }) {
  const [question, setQuestion] = useState('');
  const { status, result, error, question: asked, ask } = useAsk();
  const loading = status === 'loading';

  const submit = (e) => {
    e.preventDefault();
    const q = question.trim();
    if (q.length >= 3 && !loading) ask(q);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="question" className="sr-only">Question</label>
        <input
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={hasReadyItems ? 'Ask something about your saved content…' : 'Save something first, then ask about it'}
          className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          maxLength={1000}
        />
        <button
          type="submit"
          disabled={loading || question.trim().length < 3}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {status === 'error' && <ErrorBanner error={error} />}

      {loading && (
        <div className="animate-pulse space-y-2 rounded-lg border border-stone-200 bg-white p-4" aria-busy="true">
          <div className="h-3 w-3/4 rounded bg-stone-200" />
          <div className="h-3 w-5/6 rounded bg-stone-200" />
          <div className="h-3 w-1/2 rounded bg-stone-200" />
        </div>
      )}

      {status === 'success' && result && (
        <div className="space-y-4">
          <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs text-stone-500">Q: {asked}</p>
            <AnswerView answer={result.answer} sourceCount={result.sources.length} onCiteClick={scrollToSource} />
            <p className="mt-3 border-t border-stone-100 pt-2 font-mono text-[11px] text-stone-400">
              {result.meta.provider} · {result.meta.chatModel} · {result.meta.retrieved}/{result.meta.indexedChunks} chunks ·{' '}
              {result.meta.totalMs} ms
              {result.meta.provider === 'local' && ' · offline mode: extractive answer, lexical search'}
            </p>
          </section>
          <SourceList sources={result.sources} />
        </div>
      )}

      {status === 'idle' && (
        <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          Answers are grounded in your saved items, with numbered citations you can click.
        </p>
      )}
    </div>
  );
}
