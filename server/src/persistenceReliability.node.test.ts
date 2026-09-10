import assert from 'node:assert/strict';
import test from 'node:test';
import { GameStorage, MemoryGameRepository } from './gameStorage.ts';
import { createGameState, type ServerGameState } from './gameEngine.ts';

test('a state changed during a flush remains pending for the next flush', async () => {
  let release!: () => void;
  let started!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { started = resolve; });
  class SlowRepository extends MemoryGameRepository {
    writes = 0;
    override async save(state: ServerGameState) { if (++this.writes === 1) { started(); await blocked; } await super.save(state); }
  }
  const repository = new SlowRepository(); const game = new GameStorage(repository);
  const first = createGameState('flush-user', 1000); game.saveHot(first);
  const flushing = game.flushDirty(); await entered;
  game.saveHot({ ...first, coins: 10, version: 2 }); release(); await flushing;
  assert.equal(await game.flushDirty(), 1);
  assert.equal((await repository.get(first.userId))?.coins, 10);
});

test('simultaneous flush calls do not write the same version twice', async () => {
  class VersionRepository extends MemoryGameRepository {
    override async save(state: ServerGameState) {
      const previous = await this.get(state.userId);
      if (previous && previous.version >= state.version) throw new Error('STATE_VERSION_CONFLICT');
      await super.save(state);
    }
  }
  const game = new GameStorage(new VersionRepository()); game.saveHot(createGameState('same-version', 1000));
  const results = await Promise.all([game.flushDirty(), game.flushDirty()]);
  assert.equal(results.reduce((sum, count) => sum + count, 0), 1);
});
