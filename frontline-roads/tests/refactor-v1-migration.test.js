import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacySave } from '../src/persistence/legacy-save-migration.js';

test('refactor schema 1 scrap is migrated into canonical resources', () => {
  const migrated = migrateLegacySave({
    schemaVersion: 1,
    lifecycle: 'LOAD_SAVE',
    world: { roadGraph: null, homeBase: null, city: null, enemyBases: [], outposts: [] },
    player: {}, combat: { enemies: [], defenses: [], waves: {} },
    civilization: { level: 0, buildings: [], productionQueues: [] },
    inventory: { resources: { scrap: 100 } },
    statistics: { kills: 0, campsCaptured: 0 }, runtime: {}
  });
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(
    { wood: migrated.inventory.resources.wood, stone: migrated.inventory.resources.stone, fiber: migrated.inventory.resources.fiber },
    { wood: 45, stone: 35, fiber: 20 }
  );
  assert.equal('scrap' in migrated.inventory.resources, false);
});
