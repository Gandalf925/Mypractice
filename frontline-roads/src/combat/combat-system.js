import { consumeBundle } from '../civilization/inventory-system.js';
import { DefenseSystem } from './defense-system.js';
import { EnemySystem, enemyPosition } from './enemy-system.js';
import { WaveSystem } from './wave-system.js';
import { buildCombatSpatialIndex } from './combat-spatial-index.js';
import { FrontierSystem } from '../exploration/frontier-system.js';
import { ExplorationSystem } from '../exploration/exploration-system.js';
import {
  REGION_ACTIVITY,
  REGION_ACTIVITY_CONFIG,
  consumeRegionalSimulationTime,
  regionActivityAtPoint
} from './region-activity.js';

function defensePoint(state, defense) {
  const graph = state.world.roadGraph;
  if (defense.kind === 'tower') return graph.nodeById.get(defense.nodeId) ?? null;
  const edge = graph.edgeById.get(defense.edgeId);
  const a = edge && graph.nodeById.get(edge.a);
  const b = edge && graph.nodeById.get(edge.b);
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
}

function assignmentsForState(state, spatial) {
  const enemies = new Map();
  const defenses = new Map();
  for (const enemy of state.combat.enemies) {
    const point = spatial.positions.get(enemy.id) ?? enemyPosition(state, enemy);
    enemies.set(enemy.id, regionActivityAtPoint(state, point));
  }
  for (const defense of state.combat.defenses) {
    if (defense.kind !== 'tower') continue;
    defenses.set(defense.id, regionActivityAtPoint(state, defensePoint(state, defense)));
  }
  return { enemies, defenses };
}

export class CombatSystem {
  constructor(events) {
    this.enemySystem = new EnemySystem(events);
    this.defenseSystem = new DefenseSystem(events);
    this.waveSystem = new WaveSystem(events);
    this.frontierSystem = new FrontierSystem(events);
    this.explorationSystem = new ExplorationSystem(events);
    this.events = events;
  }

  updateRegion(state, elapsedSeconds, activity, assignments) {
    let remaining = Math.max(0, elapsedSeconds);
    while (remaining > 0.0001) {
      const step = Math.min(REGION_ACTIVITY_CONFIG.maximumSimulationSubstepSeconds, remaining);
      const spatial = buildCombatSpatialIndex(state);
      this.defenseSystem.update(
        state,
        step,
        spatial,
        defense => assignments.defenses.get(defense.id) === activity
      );
      this.enemySystem.update(
        state,
        step,
        spatial,
        enemy => assignments.enemies.get(enemy.id) === activity
      );
      remaining -= step;
    }
  }

  update(state, deltaSeconds) {
    this.explorationSystem.update(state, deltaSeconds);
    this.frontierSystem.update(state, deltaSeconds);
    this.waveSystem.update(state, deltaSeconds);

    const due = consumeRegionalSimulationTime(state, deltaSeconds);
    const spatial = buildCombatSpatialIndex(state);
    const assignments = assignmentsForState(state, spatial);
    if (due.active > 0) this.updateRegion(state, due.active, REGION_ACTIVITY.ACTIVE, assignments);
    if (due.peripheral > 0) this.updateRegion(state, due.peripheral, REGION_ACTIVITY.PERIPHERAL, assignments);
    if (due.dormant > 0) this.updateRegion(state, due.dormant, REGION_ACTIVITY.DORMANT, assignments);

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
