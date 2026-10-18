import { formatRelativeTime } from '../utils/format.js';

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800',
  ready: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};
const STATUS_LABEL = { pending: 'Indexing…', ready: 'Ready', failed: 'Failed' };

function ItemRow({ item, onDelete }) {
  return (
    <li className="group rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600">
          {item.sourceType}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={item.title}>{item.title || 'Untitled'}</p>
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-indigo-700 hover:underline">
              {item.url}
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="text-xs text-stone-400 opacity-0 transition hover:text-red-700 focus:opacity-100 group-hover:opacity-100"
          aria-label={`Delete ${item.title}`}
        >
          Delete
        </button>
      </div>
      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-stone-600">{item.preview}</p>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-stone-500">
        <span className={`rounded px-1.5 py-0.5 font-medium ${STATUS_STYLES[item.status]}`}>{STATUS_LABEL[item.status]}</span>
        {item.status === 'ready' && <span>{item.chunkCount} chunk{item.chunkCount === 1 ? '' : 's'}</span>}
        <span>· {formatRelativeTime(item.createdAt)}</span>
      </div>
      {item.status === 'failed' && item.error && <p className="mt-1 text-xs text-red-700">{item.error}</p>}
    </li>
  );
}

export function ItemList({ items, total, loading, onDelete }) {
  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
        Nothing saved yet. Add a note or URL above.
      </p>
    );
  }
  return (
    <div>
      <p className="mb-2 text-xs text-stone-500">
        {total} item{total === 1 ? '' : 's'}
        {total > items.length && ` (showing ${items.length})`}
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} onDelete={onDelete} />
        ))}
      </ul>
    </div>
  );
}
