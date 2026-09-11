import { GAME_CONFIG } from './gameConfig.ts';
import { applyTapBatch, type ServerGameState, type TapBatch } from './gameEngine.ts';

export class TapRateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) { super('TAP_RATE_LIMITED'); this.retryAfterMs = retryAfterMs; }
}

// The caller must hold the player's row lock and commit this state together
// with the batch receipt. Client duration never replenishes this allowance.
export function applyRateLimitedTapBatch(state: ServerGameState, batch: TapBatch, now: number): ReturnType<typeof applyTapBatch> {
  const result = applyTapBatch(state, batch, now);
  if (result.flagged) return result;
  const capacity = GAME_CONFIG.tapBurstAllowance * 1000;
  const previous = state.tapRateBudget;
  const valid = previous && Number.isSafeInteger(previous.availableMilliTaps) && previous.availableMilliTaps >= 0 && Number.isSafeInteger(previous.updatedAt) && previous.updatedAt >= 0;
  if (previous && !valid) throw new Error('INVALID_TAP_RATE_BUDGET');
  const time = Math.max(now, valid ? previous.updatedAt : now);
  const remaining = previous ? (valid ? Math.min(capacity, previous.availableMilliTaps) : 0) : capacity;
  // Millitaps make sub-second refill exact without repeated float rounding.
  const available = Math.min(capacity, remaining + (valid ? time - previous.updatedAt : 0) * GAME_CONFIG.maximumTapsPerSecond);
  const required = batch.taps * 1000;
  if (available < required) throw new TapRateLimitError(Math.max(1, time - now + Math.ceil((required - available) / GAME_CONFIG.maximumTapsPerSecond)));
  return { ...result, state: { ...result.state, tapRateBudget: { availableMilliTaps: available - required, updatedAt: time } } };
}
