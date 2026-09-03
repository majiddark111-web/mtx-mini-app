export interface TapOutboxBatch { batchId: string; taps: number; startedAt: number; lastTapAt: number; sealed: boolean; }
export interface TapOutboxStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }

const VERSION = 1;
const MAX_BATCH_SIZE = 50;
const MAX_STORED_BATCHES = 5_000;
const keyFor = (userId: string): string => `mtx.tap-outbox.v${VERSION}:${userId}`;
const validBatch = (value: unknown): value is TapOutboxBatch => { const item = value as Partial<TapOutboxBatch>; return Boolean(item && typeof item.batchId === 'string' && /^[0-9a-f-]{36}$/i.test(item.batchId) && Number.isSafeInteger(item.taps) && Number(item.taps) >= 1 && Number(item.taps) <= MAX_BATCH_SIZE && typeof item.startedAt === 'number' && Number.isFinite(item.startedAt) && typeof item.lastTapAt === 'number' && Number.isFinite(item.lastTapAt) && item.lastTapAt >= item.startedAt && typeof item.sealed === 'boolean'); };

export function loadTapOutbox(storage: TapOutboxStorage, userId: string): TapOutboxBatch[] {
  if (!userId) return [];
  try { const parsed: unknown = JSON.parse(storage.getItem(keyFor(userId)) ?? '[]'); return Array.isArray(parsed) ? parsed.filter(validBatch).slice(0, MAX_STORED_BATCHES) : []; }
  catch { return []; }
}

const save = (storage: TapOutboxStorage, userId: string, batches: TapOutboxBatch[]): void => { storage.setItem(keyFor(userId), JSON.stringify(batches)); };

export function appendTap(storage: TapOutboxStorage, userId: string, now = Date.now(), batchId = crypto.randomUUID()): TapOutboxBatch {
  if (!userId) throw new Error('Authenticated user is missing');
  const batches = loadTapOutbox(storage, userId);
  let active = batches.at(-1);
  if (!active || active.sealed) { if (batches.length >= MAX_STORED_BATCHES) throw new Error('Tap outbox is full'); active = { batchId, taps: 0, startedAt: now, lastTapAt: now, sealed: false }; batches.push(active); }
  active.taps += 1;
  active.lastTapAt = Math.max(active.lastTapAt, now);
  if (active.taps >= MAX_BATCH_SIZE) active.sealed = true;
  save(storage, userId, batches);
  return structuredClone(active);
}

export function sealActiveBatch(storage: TapOutboxStorage, userId: string): TapOutboxBatch | undefined {
  const batches = loadTapOutbox(storage, userId); const active = batches.at(-1);
  if (active && !active.sealed) { active.sealed = true; save(storage, userId, batches); }
  return active && structuredClone(active);
}

export function nextTapBatch(storage: TapOutboxStorage, userId: string): TapOutboxBatch | undefined { return loadTapOutbox(storage, userId).find((batch) => batch.sealed); }
export function acknowledgeTapBatch(storage: TapOutboxStorage, userId: string, batchId: string): void { save(storage, userId, loadTapOutbox(storage, userId).filter((batch) => batch.batchId !== batchId)); }
export function pendingTapCount(storage: TapOutboxStorage, userId: string): number { return loadTapOutbox(storage, userId).reduce((total, batch) => total + batch.taps, 0); }
export function tapBatchDuration(batch: TapOutboxBatch, now = Date.now()): number { return Math.min(10_000, Math.max(100, Math.round(now - batch.startedAt))); }
