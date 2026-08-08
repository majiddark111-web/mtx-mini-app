import { createGameState, type ServerGameState, type TapBatch } from './gameEngine.ts';

export interface QueuedTapEvent { userId: string; batch: TapBatch; acceptedTaps: number; receivedAt: number; }
export interface TapEventQueue { enqueue(event: QueuedTapEvent): Promise<void>; size(): number; drain(limit: number): Promise<QueuedTapEvent[]>; }
export interface GameRepository { get(userId: string): Promise<ServerGameState | null>; save(state: ServerGameState): Promise<void>; }

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
  private processed = new Map<string, number>();
  private hotStates = new Map<string, ServerGameState>();
  private dirtyUsers = new Set<string>();
  readonly repository: GameRepository;
  readonly queue: TapEventQueue;
  constructor(repository: GameRepository = new MemoryGameRepository(), queue: TapEventQueue = new MemoryTapEventQueue()) { this.repository = repository; this.queue = queue; }
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
  isProcessed(userId: string, batchId: string): boolean { return this.processed.has(`${userId}:${batchId}`); }
  markProcessed(userId: string, batchId: string, now: number): void {
    this.processed.set(`${userId}:${batchId}`, now);
    if (this.processed.size > 10_000) for (const [key, timestamp] of this.processed) if (now - timestamp > 600_000) this.processed.delete(key);
  }
  hotStateSnapshot(): ServerGameState[] { return structuredClone([...this.hotStates.values()]); }
}
