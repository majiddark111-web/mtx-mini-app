let syncTail: Promise<void> = Promise.resolve();

export function runTapSync<T>(operation: () => Promise<T>): Promise<T> {
  const result = syncTail.then(operation, operation);
  syncTail = result.then(() => undefined, () => undefined);
  return result;
}

export function waitForTapSyncIdle(): Promise<void> { return syncTail; }
