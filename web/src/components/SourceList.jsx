import { useState } from 'react';

function SourceCard({ source }) {
  const [expanded, setExpanded] = useState(false);
  const long = source.snippet.length > 240;
  return (
    <li
      id={`source-${source.ref}`}
      className={`rounded-lg border bg-white p-3 text-sm ${source.cited ? 'border-indigo-200' : 'border-stone-200 opacity-75'}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-semibold ${
            source.cited ? 'bg-indigo-100 text-indigo-800' : 'bg-stone-100 text-stone-600'
          }`}
        >
          {source.ref}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium" title={source.title}>
          {source.url ? (
            <a href={source.url} target="_blank" rel="noreferrer" className="hover:underline">
              {source.title}
            </a>
          ) : (
            source.title || 'Untitled note'
          )}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-stone-500" title="Cosine similarity to your question">
          {source.score.toFixed(2)}
        </span>
      </div>
      <p className={`mt-2 whitespace-pre-wrap text-xs leading-relaxed text-stone-600 ${expanded ? '' : 'line-clamp-4'}`}>
        {source.snippet}
      </p>
      <div className="mt-1 flex items-center gap-3 text-[11px] text-stone-500">
        <span>{source.cited ? 'Cited in answer' : 'Retrieved, not cited'}</span>
        {long && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-indigo-700 hover:underline">
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </li>
  );
}

export function SourceList({ sources }) {
  if (sources.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Sources</h3>
      <ol className="space-y-2">
        {sources.map((s) => (
          <SourceCard key={s.chunkId} source={s} />
        ))}
      </ol>
    </div>
  );
}
