import { createGameState, type ServerGameState, type TapBatch } from './gameEngine.ts';

export interface QueuedTapEvent { userId: string; batch: TapBatch; acceptedTaps: number; receivedAt: number; }
export interface TapEventQueue { enqueue(event: QueuedTapEvent): Promise<void>; size(): number; drain(limit: number): Promise<QueuedTapEvent[]>; }
export interface GameRepository { get(userId: string): Promise<ServerGameState | null>; save(state: ServerGameState): Promise<void>; }
export interface BatchDeduplicator { claim(userId: string, batchId: string, now: number): Promise<boolean>; }

export class MemoryBatchDeduplicator implements BatchDeduplicator {
  private processed = new Map<string, number>();
  async claim(userId: string, batchId: string, now: number): Promise<boolean> {
    const key = `${userId}:${batchId}`;
    if (this.processed.has(key)) return false;
    this.processed.set(key, now);
    if (this.processed.size > 10_000) for (const [storedKey, timestamp] of this.processed) if (now - timestamp > 600_000) this.processed.delete(storedKey);
    return true;
  }
}

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
}

export class GameStorage {
  private hotStates = new Map<string, ServerGameState>();
  private dirtyUsers = new Set<string>();
  readonly repository: GameRepository;
  readonly queue: TapEventQueue;
  private readonly batches: BatchDeduplicator;
  constructor(repository: GameRepository = new MemoryGameRepository(), queue: TapEventQueue = new MemoryTapEventQueue(), batches: BatchDeduplicator = new MemoryBatchDeduplicator()) { this.repository = repository; this.queue = queue; this.batches = batches; }
  async stateFor(userId: string, now: number): Promise<ServerGameState> {
    const hot = this.hotStates.get(userId);
    if (hot) return structuredClone(hot);
    const state = await this.repository.get(userId) ?? createGameState(userId, now);
    this.hotStates.set(userId, structuredClone(state));
    return state;
  }
  saveHot(state: ServerGameState): void { this.hotStates.set(state.userId, structuredClone(state)); this.dirtyUsers.add(state.userId); }
  async flushDirty(limit = 500): Promise<number> {
    const userIds = [...this.dirtyUsers].slice(0, Math.max(0, limit));
    for (const userId of userIds) {
      const state = this.hotStates.get(userId);
      if (state) await this.repository.save(state);
      this.dirtyUsers.delete(userId);
    }
    return userIds.length;
  }
  claimBatch(userId: string, batchId: string, now: number): Promise<boolean> { return this.batches.claim(userId, batchId, now); }
  hotStateSnapshot(): ServerGameState[] { return structuredClone([...this.hotStates.values()]); }
}
