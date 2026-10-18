import { AskPanel } from './components/AskPanel.jsx';
import { ErrorBanner } from './components/ErrorBanner.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { IngestForm } from './components/IngestForm.jsx';
import { ItemList } from './components/ItemList.jsx';
import { useItems } from './hooks/useItems.js';

export default function App() {
  const { items, total, loading, error, addItem, removeItem, dismissError } = useItems();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Knowledge Inbox</h1>
        <p className="text-sm text-stone-500">Save notes and links. Ask questions. Get answers with sources.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="inbox-heading" className="space-y-4">
          <h2 id="inbox-heading" className="text-sm font-semibold uppercase tracking-wide text-stone-500">Inbox</h2>
          <ErrorBoundary>
            <IngestForm onSubmit={addItem} />
            <ErrorBanner error={error} onDismiss={dismissError} />
            <ItemList items={items} total={total} loading={loading} onDelete={removeItem} />
          </ErrorBoundary>
        </section>

        <section aria-labelledby="ask-heading" className="space-y-4 md:sticky md:top-6 md:self-start">
          <h2 id="ask-heading" className="text-sm font-semibold uppercase tracking-wide text-stone-500">Ask</h2>
          <ErrorBoundary>
            <AskPanel hasReadyItems={items.some((i) => i.status === 'ready')} />
          </ErrorBoundary>
        </section>
      </div>
    </div>
  );
}
