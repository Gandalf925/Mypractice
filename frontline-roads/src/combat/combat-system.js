import { consumeBundle } from '../civilization/inventory-system.js';
import { DefenseSystem } from './defense-system.js';
import { EnemySystem } from './enemy-system.js';
import { WaveSystem } from './wave-system.js';
import { buildCombatSpatialIndex } from './combat-spatial-index.js';

export class CombatSystem {
  constructor(events) {
    this.enemySystem = new EnemySystem(events);
    this.defenseSystem = new DefenseSystem(events);
    this.waveSystem = new WaveSystem(events);
    this.events = events;
  }

  update(state, deltaSeconds) {
    this.waveSystem.update(state, deltaSeconds);
    const spatial = buildCombatSpatialIndex(state);
    this.defenseSystem.update(state, deltaSeconds, spatial);
    this.enemySystem.update(state, deltaSeconds, spatial);
    if (state.world.city.hp <= 0) {
      state.world.city.hp = 35;
      state.combat.enemies = [];
      state.combat.waves.active = {};
      const recoveryCost = { wood: 30, stone: 20 };
      const paid = consumeBundle(state, recoveryCost);
      state.civilization.progress.perfectWaveStreak = 0;
      this.events?.emit('combat:city-defeated', { recoveryCost, paid });
      this.events?.emit('message', {
        text: paid
          ? '都市防衛線が崩壊し、木材30・石材20を使って緊急再編成しました。'
          : '都市防衛線が崩壊しました。備蓄不足のため最低限の応急再編成だけが行われました。'
      });
    }
  }
}
