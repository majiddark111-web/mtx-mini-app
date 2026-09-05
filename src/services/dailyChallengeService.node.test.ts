import assert from 'node:assert/strict';
import test from 'node:test';
import { toggleComboSelection } from './dailyChallengeService.ts';

test('adds combo items in the chosen order', () => {
  assert.deepEqual(toggleComboSelection(['first'], 'second', 3), ['first', 'second']);
});

test('removes an already selected combo item', () => {
  assert.deepEqual(toggleComboSelection(['first', 'second', 'third'], 'second', 3), ['first', 'third']);
});

test('does not exceed the available combo slots', () => {
  const full = ['first', 'second', 'third'];
  assert.deepEqual(toggleComboSelection(full, 'fourth', 3), full);
});
