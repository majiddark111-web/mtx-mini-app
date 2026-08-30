import assert from 'node:assert/strict';
import { it } from 'node:test';
import { runTapSync, waitForTapSyncIdle } from './tapSyncCoordinator.ts';

it('serializes pending tap sync before a later inventory operation', async () => {
  const events: string[] = [];
  let release: (() => void) | undefined;
  const first = runTapSync(async () => { events.push('tap-start'); await new Promise<void>((resolve) => { release = resolve; }); events.push('tap-end'); });
  const second = runTapSync(async () => { events.push('next-operation'); });
  await Promise.resolve();
  assert.deepEqual(events, ['tap-start']);
  release?.();
  await Promise.all([first, second, waitForTapSyncIdle()]);
  assert.deepEqual(events, ['tap-start', 'tap-end', 'next-operation']);
});
