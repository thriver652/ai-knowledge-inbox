import { useState } from 'react';
import { ErrorBanner } from './ErrorBanner.jsx';

const TABS = [
  { type: 'note', label: 'Note' },
  { type: 'url', label: 'URL' },
];

const inputClass =
  'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-stone-100';

function FieldError({ message }) {
  return message ? <p className="mt-1 text-xs text-red-700">{message}</p> : null;
}

export function IngestForm({ onSubmit }) {
  const [type, setType] = useState('note');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const fieldErrors = error?.fieldErrors?.() ?? {};
  const value = type === 'note' ? content : url;
  // Field errors render inline; anything else (e.g. URL fetch failed) shows as a banner.
  const bannerError = error && Object.keys(fieldErrors).length === 0 ? error : null;

  const switchTab = (next) => {
    setType(next);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(type === 'note' ? { type, content } : { type, url: url.trim() });
      type === 'note' ? setContent('') : setUrl('');
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex gap-1 rounded-md bg-stone-100 p-1 text-sm" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.type}
            type="button"
            role="tab"
            aria-selected={type === t.type}
            onClick={() => switchTab(t.type)}
            className={`flex-1 rounded px-3 py-1.5 font-medium transition ${
              type === t.type ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {type === 'note' ? (
        <div>
          <label htmlFor="note-content" className="sr-only">Note</label>
          <textarea
            id="note-content"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={submitting}
            placeholder="Paste or type a note. The first line becomes its title."
            className={`${inputClass} resize-y`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
            }}
          />
          <FieldError message={fieldErrors.content} />
        </div>
      ) : (
        <div>
          <label htmlFor="url-input" className="sr-only">URL</label>
          <input
            id="url-input"
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={submitting}
            placeholder="https://example.com/article"
            className={inputClass}
          />
          <FieldError message={fieldErrors.url} />
          <p className="mt-1 text-xs text-stone-500">The server fetches the page and saves its readable text.</p>
        </div>
      )}

      <ErrorBanner error={bannerError} onDismiss={() => setError(null)} />

      <button
        type="submit"
        disabled={submitting || !value.trim()}
        className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (type === 'url' ? 'Fetching page…' : 'Saving…') : `Save ${type === 'url' ? 'URL' : 'note'}`}
      </button>
    </form>
  );
}
