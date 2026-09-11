import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from './gameEngine.ts';
import { applyRateLimitedTapBatch, TapRateLimitError } from './tapRateBudget.ts';

const now = 100000;
const full = { taps: 50, durationMs: 10000, batchId: 'budget-full-batch' };

test('normal two-second batches remain playable at the configured sustained rate', () => {
  let state = createGameState('42', now);
  for (let index = 0; index < 20; index += 1) {
    const result = applyRateLimitedTapBatch(state, { taps: 30, durationMs: 2000, batchId: 'normal-' + index }, now + index * 2000);
    assert.equal(result.flagged, false); assert.equal(result.acceptedTaps, 30); state = result.state;
  }
  assert.equal(state.coins, 600);
});

test('sub-second refill and Retry-After do not accumulate rounding credit', () => {
  const state = applyRateLimitedTapBatch(createGameState('42', now), full, now).state;
  const one = { taps: 1, durationMs: 1000, batchId: 'next-one' };
  assert.throws(() => applyRateLimitedTapBatch(state, one, now), (error: unknown) => error instanceof TapRateLimitError && error.retryAfterMs === 67);
  assert.throws(() => applyRateLimitedTapBatch(state, one, now + 66), (error: unknown) => error instanceof TapRateLimitError && error.retryAfterMs === 1);
  const result = applyRateLimitedTapBatch(state, one, now + 67);
  assert.equal(result.state.tapRateBudget?.availableMilliTaps, 5);
  assert.equal(state.coins, 50, 'throttling must not mutate the caller state');
});

test('a backwards clock cannot refill the budget or advertise an early retry', () => {
  const state = applyRateLimitedTapBatch(createGameState('42', now), full, now).state;
  assert.throws(() => applyRateLimitedTapBatch(state, { taps: 1, durationMs: 1000, batchId: 'clock-backwards' }, now - 1000), (error: unknown) => error instanceof TapRateLimitError && error.retryAfterMs === 1067);
});

test('invalid stored budget fails closed instead of granting another burst', () => {
  const state = { ...createGameState('42', now), tapRateBudget: { availableMilliTaps: -1, updatedAt: now } };
  assert.throws(() => applyRateLimitedTapBatch(state, full, now), /INVALID_TAP_RATE_BUDGET/);
});
