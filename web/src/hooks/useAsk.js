import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

// Question -> answer state machine: idle | loading | success | error.
// A new question aborts the one in flight, so a slow earlier answer can't overwrite a newer one.
export function useAsk() {
  const [state, setState] = useState({ status: 'idle', question: '', result: null, error: null });
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(async (question) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'loading', question, result: null, error: null });
    try {
      const result = await api.query({ question }, { signal: controller.signal });
      setState({ status: 'success', question, result, error: null });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setState({ status: 'error', question, result: null, error: err });
    }
  }, []);

  return { ...state, ask };
}
