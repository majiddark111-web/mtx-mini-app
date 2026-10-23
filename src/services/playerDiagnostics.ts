import type { PlayerSession } from './playerSession.ts';
import type { PlayerAuthStatus } from './playerTapAction.ts';

export const PLAYER_DIAGNOSTICS_VERSION = 'diag-20261023-1';

// Explicit allowlist: never spread session credentials into a diagnostic result.
export function sessionDiagnostic(session: PlayerSession | undefined, now: number) {
  if (!session) return { status: 'missing' as const, expiresAt: null, remainingSeconds: null };
  const expiresAt = Math.min(session.expiresAt, session.renewUntil);
  return { status: expiresAt > now ? 'valid' as const : 'expired' as const, expiresAt, remainingSeconds: Math.max(0, Math.ceil((expiresAt - now) / 1000)) };
}

interface ObservedGame { coins: number; version: number; profitPerTap: number; tapLevel: number; }
export type GameObservationKind = 'read' | 'tap-accepted' | 'tap-rejected';
interface GameDiagnostic {
  lastLocalTapAt: number | null;
  lastLocalTapAccepted: boolean | null;
  lastLocalTapAuth: PlayerAuthStatus | null;
  lastLocalTapCredential: ReturnType<typeof sessionDiagnostic>['status'] | null;
  lastResponseAt: number | null;
  lastAcceptedTapAt: number | null;
  lastRejectedTapAt: number | null;
  serverCoins: number | null;
  serverVersion: number | null;
  serverTapPower: number | null;
  serverTapLevel: number | null;
}
const empty = (): GameDiagnostic => ({ lastLocalTapAt: null, lastLocalTapAccepted: null, lastLocalTapAuth: null, lastLocalTapCredential: null, lastResponseAt: null, lastAcceptedTapAt: null, lastRejectedTapAt: null, serverCoins: null, serverVersion: null, serverTapPower: null, serverTapLevel: null });

export class GameDiagnostics {
  private account = '';
  private value = empty();

  reset(account: string): void { this.account = account; this.value = empty(); }

  recordLocalTap(account: string, accepted: boolean, auth: PlayerAuthStatus, credential: ReturnType<typeof sessionDiagnostic>['status'], at = Date.now()): void {
    if (!account || account !== this.account || !Number.isFinite(at)) return;
    this.value.lastLocalTapAt = at;
    this.value.lastLocalTapAccepted = accepted;
    this.value.lastLocalTapAuth = auth;
    this.value.lastLocalTapCredential = credential;
  }

  record(account: string, state: ObservedGame, kind: GameObservationKind, at = Date.now()): void {
    if (!account || account !== this.account || !state || !Number.isFinite(at) || ![state.coins, state.version, state.profitPerTap, state.tapLevel].every(Number.isFinite)) return;
    this.value.lastResponseAt = Math.max(this.value.lastResponseAt ?? 0, at);
    if (kind === 'tap-accepted') this.value.lastAcceptedTapAt = Math.max(this.value.lastAcceptedTapAt ?? 0, at);
    if (kind === 'tap-rejected') this.value.lastRejectedTapAt = Math.max(this.value.lastRejectedTapAt ?? 0, at);
    if (this.value.serverVersion === null || state.version >= this.value.serverVersion) {
      this.value.serverCoins = state.coins; this.value.serverVersion = state.version;
      this.value.serverTapPower = state.profitPerTap; this.value.serverTapLevel = state.tapLevel;
    }
  }

  snapshot(account: string): GameDiagnostic { return account && account === this.account ? { ...this.value } : empty(); }
}

export const gameDiagnostics = new GameDiagnostics();
