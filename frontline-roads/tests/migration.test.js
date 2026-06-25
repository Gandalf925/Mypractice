import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacySave } from '../src/persistence/legacy-save-migration.js';

function legacySave() {
  return {
    schemaVersion: 5,
    version: '3.4.0',
    map: {
      center: { lat: 35, lon: 139 }, source: 'osm',
      nodes: [{ id: 'city', x: 0, y: 0 }, { id: 'far', x: 100, y: 0 }],
      edges: [{ id: 'road', a: 'city', b: 'far', length: 100, barrier: { hp: 120, maxHp: 220, tier: 0 } }]
    },
    city: { nodeId: 'city', hp: 75, maxHp: 100 },
    player: { x: 5, y: 6, lat: 35, lon: 139 },
    scrap: 200,
    towers: [{ id: 'tower', type: 'gun', nodeId: 'city', hp: 100, maxHp: 150 }],
    bases: [{ id: 'base', type: 'barracks', nodeId: 'far', alive: true, spawnClock: 10 }],
    enemies: [],
    kills: 12,
    civilization: { level: 2 },
    lastSavedAt: 1000
  };
}

test('legacy save is converted once into the clean schema', () => {
  const migrated = migrateLegacySave(legacySave());
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.world.homeBase.nodeId, 'city');
  assert.equal(migrated.world.city.hp, 75);
  assert.equal(migrated.combat.defenses.length, 2);
  assert.equal(migrated.combat.defenses.find(item => item.kind === 'barrier').edgeId, 'road');
  assert.deepEqual({ wood: migrated.inventory.resources.wood, stone: migrated.inventory.resources.stone, fiber: migrated.inventory.resources.fiber }, { wood: 90, stone: 70, fiber: 40 });
  assert.equal(migrated.civilization.level, 2);
  assert.equal(migrated.statistics.kills, 12);
});
