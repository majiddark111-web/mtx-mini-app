import { applyOfflineProfit, createGameState, type ServerGameState, type TapBatch } from './gameEngine.ts';
import { applyRateLimitedTapBatch } from './tapRateBudget.ts';
import type { EconomyConfig } from '../../economy/economyConfig.ts';

export interface TapSyncResult { state: ServerGameState; acceptedTaps: number; flagged: boolean; duplicate: boolean; }
export interface GameplayPersistence {
  applyTaps(userId: string, batch: TapBatch, now: number): Promise<TapSyncResult>;
  creditOffline(userId: string, now: number, economy: EconomyConfig): Promise<{ state: ServerGameState; offlineProfit: number }>;
}

export interface QueuedTapEvent { userId: string; batch: TapBatch; acceptedTaps: number; receivedAt: number; }
export interface TapEventQueue { enqueue(event: QueuedTapEvent): Promise<void>; size(): number; drain(limit: number): Promise<QueuedTapEvent[]>; }
export interface GameRepository { get(userId: string): Promise<ServerGameState | null>; save(state: ServerGameState): Promise<void>; all(): Promise<ServerGameState[]>; }
export class MemoryTapEventQueue implements TapEventQueue {
  private events: QueuedTapEvent[] = [];
  async enqueue(event: QueuedTapEvent): Promise<void> { this.events.push(structuredClone(event)); }
  size(): number { return this.events.length; }
  async drain(limit: number): Promise<QueuedTapEvent[]> { return this.events.splice(0, Math.max(0, limit)); }
}

export class MemoryGameRepository implements GameRepository {
  private states = new Map<string, ServerGameState>();
  async get(userId: string): Promise<ServerGameState | null> { return structuredClone(this.states.get(userId) ?? null); }
  async save(state: ServerGameState): Promise<void> { this.states.set(state.userId, structuredClone(state)); }
  async all(): Promise<ServerGameState[]> { return structuredClone([...this.states.values()]); }
}

export class GameStorage {
  private hotStates = new Map<string, ServerGameState>();
  private dirtyUsers = new Set<string>();
  readonly repository: GameRepository;
  readonly queue: TapEventQueue;
  private readonly gameplay?: GameplayPersistence;
  private userOperations = new Map<string, Promise<unknown>>();
  private receipts = new Map<string, { taps: number; acceptedTaps: number; flagged: boolean }>();
  private flushTail: Promise<unknown> = Promise.resolve();
  constructor(repository: GameRepository = new MemoryGameRepository(), queue: TapEventQueue = new MemoryTapEventQueue(), gameplay?: GameplayPersistence) { this.repository = repository; this.queue = queue; this.gameplay = gameplay; }
  async stateFor(userId: string, now: number): Promise<ServerGameState> {
    if (this.gameplay) return await this.repository.get(userId) ?? createGameState(userId, now);
    const hot = this.hotStates.get(userId);
    if (hot) return structuredClone(hot);
    const state = await this.repository.get(userId) ?? createGameState(userId, now);
    this.hotStates.set(userId, structuredClone(state));
    return state;
  }
  saveHot(state: ServerGameState, dirty = true): void {
    if (this.gameplay) { if (dirty) throw new Error('TRANSACTIONAL_GAME_STATE_REQUIRED'); return; }
    this.hotStates.set(state.userId, structuredClone(state));
    if (dirty) this.dirtyUsers.add(state.userId); else this.dirtyUsers.delete(state.userId);
  }
  flushDirty(limit = 500): Promise<number> {
    const run = this.flushTail.then(() => this.flushPending(limit));
    this.flushTail = run.catch(() => undefined);
    return run;
  }
  private async flushPending(limit: number): Promise<number> {
    const userIds = [...this.dirtyUsers].slice(0, Math.max(0, limit));
    for (const userId of userIds) {
      const state = this.hotStates.get(userId);
      if (state) await this.repository.save(state);
      if (this.hotStates.get(userId) === state) this.dirtyUsers.delete(userId);
    }
    return userIds.length;
  }
  private serialUser<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.userOperations.get(userId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation);
    this.userOperations.set(userId, run);
    void run.finally(() => { if (this.userOperations.get(userId) === run) this.userOperations.delete(userId); }).catch(() => undefined);
    return run;
  }
  applyTaps(userId: string, batch: TapBatch, now: number): Promise<TapSyncResult> {
    if (this.gameplay) return this.gameplay.applyTaps(userId, batch, now);
    return this.serialUser(userId, async () => {
      const current = await this.stateFor(userId, now);
      const key = `${userId}:${batch.batchId}`;
      const receipt = this.receipts.get(key);
      if (receipt) { if (receipt.taps !== batch.taps) throw new Error('IDEMPOTENCY_KEY_REUSED'); return { state: current, acceptedTaps: receipt.acceptedTaps, flagged: receipt.flagged, duplicate: true }; }
      const result = applyRateLimitedTapBatch(current, batch, Math.max(now, current.lastSeenAt));
      await this.queue.enqueue({ userId, batch, acceptedTaps: result.acceptedTaps, receivedAt: now });
      this.saveHot(result.state);
      this.receipts.set(key, { taps: batch.taps, acceptedTaps: result.acceptedTaps, flagged: result.flagged });
      return { ...result, duplicate: false };
    });
  }
  creditOffline(userId: string, now: number, economy: EconomyConfig): Promise<{ state: ServerGameState; offlineProfit: number }> {
    if (this.gameplay) return this.gameplay.creditOffline(userId, now, economy);
    return this.serialUser(userId, async () => { const result = applyOfflineProfit(await this.stateFor(userId, now), now, economy); this.saveHot(result.state); return result; });
  }
  hotStateSnapshot(): ServerGameState[] { return structuredClone([...this.hotStates.values()]); }
  async stateSnapshot(): Promise<ServerGameState[]> { const stored = await this.repository.all(); const merged = new Map(stored.map((state) => [state.userId, state])); for (const state of this.hotStates.values()) merged.set(state.userId, state); return structuredClone([...merged.values()]); }
}
