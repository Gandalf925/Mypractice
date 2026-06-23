import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/event-bus.js';
import { CombatEffects } from '../src/rendering/combat-effects.js';

function context() {
  return {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, stroke() {}, strokeRect() {}, setLineDash() {},
    set globalAlpha(value) {}, set strokeStyle(value) {}, set shadowColor(value) {}, set shadowBlur(value) {}, set lineWidth(value) {},
    set globalCompositeOperation(value) {}
  };
}

const camera = { scale: 1, worldToScreen: point => point };
const state = {
  world: {
    city: { nodeId: 'city' },
    roadGraph: { nodeById: new Map([['city', { x: 20, y: 20 }]]), edgeById: new Map() },
    enemyBases: []
  },
  combat: { defenses: [] }
};

test('combat effect buffer is capped and prunes expired effects', () => {
  let clock = 0;
  const effects = new CombatEffects({ maximum: 3, clock: () => clock });
  for (let index = 0; index < 5; index += 1) effects.add('kill', { position: { x: index, y: 0 } });
  assert.equal(effects.effects.length, 3);
  clock = 2000;
  assert.equal(effects.active(clock).length, 0);
});

test('event bus creates transient shot and city warning effects', () => {
  let clock = 0;
  const bus = new EventBus();
  const effects = new CombatEffects({ clock: () => clock });
  effects.bind(bus, () => state);
  bus.emit('combat:shot', { type: 'gun', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } });
  bus.emit('combat:city-hit', { damage: 8 });
  assert.equal(effects.effects.length, 2);
  assert.doesNotThrow(() => effects.draw(context(), camera, state, clock + 100, 390, 844));
  effects.destroy();
});

test('manual defense upgrade events create a visible pulse', () => {
  let clock = 0;
  const bus = new EventBus();
  const effects = new CombatEffects({ clock: () => clock });
  const defenseState = structuredClone(state);
  defenseState.world.roadGraph.nodeById = new Map([['city', { x: 20, y: 20 }], ['tower-node', { x: 8, y: 9 }]]);
  defenseState.combat.defenses = [{ id: 'tower', kind: 'tower', nodeId: 'tower-node' }];
  effects.bind(bus, () => defenseState);
  bus.emit('combat:defense-upgraded', { defenseId: 'tower', tier: 1 });
  assert.equal(effects.effects[0].type, 'defenseUpgraded');
  assert.doesNotThrow(() => effects.draw(context(), camera, defenseState, 100, 390, 844));
});
