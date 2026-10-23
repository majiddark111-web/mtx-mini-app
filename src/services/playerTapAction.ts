export type PlayerAuthStatus = 'demo' | 'loading' | 'authenticated' | 'error' | 'expired';

interface TapActions {
  hasUsableSession(): boolean;
  queueTap(userId: string): { sealed: boolean };
  applyTap(): void;
}

/** Shared by the UI and regression tests; expiry is checked on every tap, even if timers are suspended. */
export function attemptPlayerTap(status: PlayerAuthStatus, userId: string, actions: TapActions): { accepted: boolean; sealed: boolean } {
  if (status !== 'demo' && (status !== 'authenticated' || !actions.hasUsableSession())) {
    return { accepted: false, sealed: false };
  }
  if (status === 'authenticated') {
    if (!userId) return { accepted: false, sealed: false };
    // Persist first: a storage failure must not appear as a successfully queued tap.
    const batch = actions.queueTap(userId);
    actions.applyTap();
    return { accepted: true, sealed: batch.sealed };
  }
  actions.applyTap();
  return { accepted: true, sealed: false };
}
