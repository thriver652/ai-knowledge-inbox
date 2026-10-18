import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

const POLL_MS = 1500;

// Owns the saved-items list. Ingestion is async on the server (202 + status "pending"),
// so while anything is pending we poll until it flips to "ready" or "failed".
export function useItems() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await api.listItems({ signal: controller.signal });
      setItems(data.items);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  const hasPending = items.some((i) => i.status === 'pending');
  useEffect(() => {
    if (!hasPending) return undefined;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [hasPending, refresh]);

  // Throws ApiError so the form can show field-level messages.
  const addItem = useCallback(async (payload) => {
    const { item } = await api.ingest(payload);
    setItems((prev) => [item, ...prev]);
    setTotal((t) => t + 1);
    return item;
  }, []);

  // Optimistic delete; on failure the server's list is the source of truth again.
  const removeItem = useCallback(async (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setTotal((t) => t - 1);
    try {
      await api.deleteItem(id);
    } catch (err) {
      setError(err);
      refresh();
    }
  }, [refresh]);

  return { items, total, loading, error, addItem, removeItem, refresh, dismissError: () => setError(null) };
}
