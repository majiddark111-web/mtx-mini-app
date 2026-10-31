import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHistory, parseLeaders, parseNotifications } from './readModels.ts';

const purchase = { id: 'same', itemId: 'boost:recharge', price: 20, createdAt: 1 };
const payment = { transactionId: 'same', provider: 'ton', asset: 'TON', status: 'pending', amount: 0.01, creditedCoins: 100, createdAt: 2 };
const reward = { id: 'same', title: 'Reward', amount: 10, createdAt: 3 };
const history = () => ({ purchases: [purchase], payments: [payment], rewards: [reward] });
const notice = { id: 'reward:1', kind: 'reward', title: 'Reward', message: 'Earned 100', createdAt: 1000, read: false };
test('notifications accept all kinds, empty inboxes and consistent counts', () => {
  assert.deepEqual(parseNotifications({ notifications: [], unreadCount: 0 }), { notifications: [], unreadCount: 0 });
  for (const kind of ['announcement', 'upgrade', 'purchase', 'payment', 'reward']) {
    const value = { notifications: [{ ...notice, kind }], unreadCount: 1 };
    assert.deepEqual(parseNotifications(value), value);
  }
});
test('notifications reject duplicate IDs and inconsistent unread counters', () => {
  for (const value of [{ notifications: [notice, notice], unreadCount: 2 }, { notifications: [notice], unreadCount: 0 },
    { notifications: [{ ...notice, read: true }], unreadCount: 1 }, { notifications: [], unreadCount: -1 }]) assert.throws(() => parseNotifications(value));
});
test('notifications reject malformed records and nonfinite timestamps', () => {
  for (const value of [null, {}, { notifications: null, unreadCount: 0 },
    ...[{ kind: 'fake' }, { kind: ['reward'] }, { read: 'false' }, { createdAt: NaN }, { message: null }].map((change) => ({ notifications: [{ ...notice, ...change }], unreadCount: 1 }))]) assert.throws(() => parseNotifications(value));
});
test('history accepts empty data and independent identity namespaces without changing values', () => {
  assert.deepEqual(parseHistory({ purchases: [], payments: [], rewards: [] }), { purchases: [], payments: [], rewards: [] });
  assert.deepEqual(parseHistory(history()), history());
  for (const status of ['confirmed', 'pending', 'failed', 'refunded']) assert.equal(parseHistory({ ...history(), payments: [{ ...payment, status }] }).payments[0].status, status);
});

test('history accepts explicit legacy day precision and rejects malformed date metadata', () => {
  assert.equal(parseHistory({ ...history(), rewards: [{ ...reward, dateOnly: '2026-10-26' }] }).rewards[0].dateOnly, '2026-10-26');
  for (const dateOnly of [23, '', 'unknown']) assert.throws(() => parseHistory({ ...history(), rewards: [{ ...reward, dateOnly }] }));
});
test('history rejects duplicate identities in each category instead of silently hiding records', () => {
  for (const key of ['purchases', 'payments', 'rewards'] as const) {
    const value = history();
    assert.throws(() => parseHistory({ ...value, [key]: [...value[key], ...value[key]] }), /Invalid history/);
  }
});
test('history rejects malformed records, nonfinite values and unsupported statuses', () => {
  for (const value of [null, {}, { ...history(), rewards: null }, { ...history(), purchases: [{ ...purchase, price: NaN }] },
    { ...history(), payments: [{ ...payment, amount: -1 }] }, { ...history(), payments: [{ ...payment, status: 'fake' }] },
    { ...history(), rewards: [{ ...reward, createdAt: Infinity }] }]) assert.throws(() => parseHistory(value));
});
test('leaderboard preserves server ranks and values, including zero balance', () => {
  const rows = [{ userId: '1', username: 'User', coins: 0, rank: 5 }];
  assert.deepEqual(parseLeaders(rows), rows);
  assert.deepEqual(parseLeaders([]), []);
});
test('leaderboard rejects duplicate users or ranks and malformed values', () => {
  const row = { userId: '1', username: 'User', coins: 10, rank: 1 };
  for (const rows of [null, {}, [row, row], [row, { ...row, userId: '2' }], [{ ...row, rank: 0 }],
    [{ ...row, coins: Infinity }], [{ ...row, coins: -2 }], [{ ...row, username: null }]]) assert.throws(() => parseLeaders(rows));
});
