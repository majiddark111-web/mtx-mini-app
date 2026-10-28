import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

export type RewardRequestError = 'load' | 'claim' | 'refresh' | 'incorrect';
interface RequestState<T> { userId: string; data?: T; loading: boolean; pending?: string; error?: RewardRequestError; }
interface RequestScope { userId: string; active: boolean; busy: boolean; }

// The loader must be stable. A scope prevents late responses from crossing accounts
// or updating an unmounted page. The synchronous lock also blocks same-frame clicks.
export function useRewardRequest<T>(loader: () => Promise<T>) {
  const auth = useAppStore((state) => state.authStatus);
  const userId = useAppStore((state) => state.user.id);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<RequestState<T>>({ userId: '', loading: true });
  const scope = useRef<RequestScope>();
  const current = (value: RequestScope) => value.active && scope.current === value &&
    useAppStore.getState().authStatus === 'authenticated' && useAppStore.getState().user.id === value.userId;

  useEffect(() => {
    const value: RequestScope = { userId, active: true, busy: true };
    scope.current = value;
    setState({ userId, loading: auth === 'authenticated' });
    if (auth === 'authenticated' && userId) {
      void loader().then(
        (data) => { if (current(value)) setState({ userId, data, loading: false }); },
        () => { if (current(value)) setState({ userId, loading: false, error: 'load' }); },
      ).finally(() => { value.busy = false; });
    }
    return () => { value.active = false; };
  }, [auth, userId, revision, loader]);

  const visible = auth === 'authenticated' && state.userId === userId;
  const ready = visible && state.data !== undefined && !state.loading && !state.pending;
  const run = async (name: string, operation: () => Promise<void>): Promise<boolean> => {
    const value = scope.current;
    if (!value || !current(value) || value.busy || !ready) return false;
    value.busy = true;
    setState((previous) => ({ ...previous, pending: name, error: undefined }));
    let accepted = false;
    try {
      await operation();
      accepted = true;
      if (!current(value)) return false;
      const data = await loader();
      if (!current(value)) return false;
      setState({ userId, data, loading: false });
      return true;
    } catch (error) {
      if (current(value)) {
        const incorrect = error instanceof Error && error.message === 'CHALLENGE_INCORRECT';
        // Unknown mutation outcomes require a read-only refresh, never an automatic retry.
        setState((previous) => ({ userId, data: incorrect ? previous.data : undefined, loading: false,
          error: accepted ? 'refresh' : incorrect ? 'incorrect' : 'claim' }));
      }
      return false;
    } finally { value.busy = false; }
  };
  const retry = () => {
    const value = scope.current;
    if (!value || !current(value) || value.busy) return;
    value.busy = true;
    setState({ userId, loading: true });
    setRevision((previous) => previous + 1);
  };
  return { auth, ready, data: visible ? state.data : undefined, loading: visible && state.loading,
    pending: visible ? state.pending : undefined, error: visible ? state.error : undefined, run, retry };
}
