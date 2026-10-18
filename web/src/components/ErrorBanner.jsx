export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <div className="flex-1">
        <p>{error.message}</p>
        {error.requestId && (
          <p className="mt-0.5 font-mono text-xs text-red-600/80">
            {error.code} · request {error.requestId}
          </p>
        )}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-red-600 hover:text-red-900" aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
