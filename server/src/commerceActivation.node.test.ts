import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ECONOMY_CONFIG } from '../../economy/economyConfig.ts';
import { CommerceStorage } from './commerce.ts';
import { createGameState } from './gameEngine.ts';
import { GameStorage, MemoryGameRepository } from './gameStorage.ts';

describe('inventory boost activation', () => {
  it('atomically consumes a recharge boost and fills server-owned energy', async () => {
    const now = 10_000;
    const repository = new MemoryGameRepository();
    await repository.save({ ...createGameState('boost-user', now), coins: 10_000 });
    const game = new GameStorage(repository);
    const commerce = new CommerceStorage();
    await commerce.purchase('boost-user', 'boost:recharge', '11111111-1111-4111-8111-111111111111', game, ECONOMY_CONFIG, now);
    const purchased = await game.stateFor('boost-user', now);
    game.saveHot({ ...purchased, energy: 1, version: purchased.version + 1 });

    const activated = await commerce.activate('boost-user', 'boost:recharge', game, now + 1_000);
    assert.equal(activated.state.energy, activated.state.maximumEnergy);
    assert.equal(activated.items.length, 0);
    await assert.rejects(() => commerce.activate('boost-user', 'boost:recharge', game, now + 2_000), /BOOST_NOT_NEEDED|ITEM_NOT_OWNED/);
  });

  it('does not waste a boost when energy is already full', async () => {
    const now = 20_000;
    const repository = new MemoryGameRepository();
    await repository.save({ ...createGameState('full-user', now), coins: 10_000 });
    const game = new GameStorage(repository);
    const commerce = new CommerceStorage();
    await commerce.purchase('full-user', 'boost:recharge', '22222222-2222-4222-8222-222222222222', game, ECONOMY_CONFIG, now);

    await assert.rejects(() => commerce.activate('full-user', 'boost:recharge', game, now + 1_000), /BOOST_NOT_NEEDED/);
    assert.equal((await commerce.inventory('full-user'))[0]?.quantity, 1);
  });

  it('consumes an energy cell and restores exactly 25% of maximum energy', async () => {
    const now = 30_000;
    const repository = new MemoryGameRepository();
    await repository.save({ ...createGameState('cell-user', now), coins: 10_000, maximumEnergy: 2_000, energy: 100 });
    const game = new GameStorage(repository);
    const commerce = new CommerceStorage();
    await commerce.purchase('cell-user', 'consumable:energy', '33333333-3333-4333-8333-333333333333', game, ECONOMY_CONFIG, now);
    const activated = await commerce.activate('cell-user', 'consumable:energy', game, now + 1_000);
    assert.equal(activated.state.energy, 600);
    assert.equal(activated.items.length, 0);
  });
});
