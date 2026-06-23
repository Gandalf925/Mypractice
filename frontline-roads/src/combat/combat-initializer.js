import { stableId } from '../core/utilities.js';
import { ensureCivilizationState } from '../civilization/civilization-system.js';
import { ENEMY_BASE_DEFINITIONS } from './definitions.js';
import { INITIAL_BASE_TYPES } from './wave-system.js';
import { reconcileFrontiers, ensureFrontierState } from '../exploration/frontier-system.js';
import { ensureExplorationState, reconcileExplorationSites } from '../exploration/exploration-system.js';
import { ensurePlayerBaseState } from '../base/player-bases.js';
import { ensureFriendlyForceState } from './friendly-force-system.js';

function distancesFrom(graph, startId) {
  const distances = new Map([[startId, 0]]);
  const queue = [{ id: startId, distance: 0 }];
  const visited = new Set();
  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance);
    const current = queue.shift();
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    for (const connection of graph.adjacency.get(current.id) ?? []) {
      const next = current.distance + connection.length;
      if (next >= (distances.get(connection.to) ?? Infinity)) continue;
      distances.set(connection.to, next);
      queue.push({ id: connection.to, distance: next });
    }
  }
  return distances;
}

export function selectEnemyBasePlacements(graph, cityNodeId) {
  const distances = distancesFrom(graph, cityNodeId);
  const degree = nodeId => graph.adjacency.get(nodeId)?.length ?? 0;
  const available = graph.nodes
    .filter(node => node.id !== cityNodeId && degree(node.id) >= 2 && distances.has(node.id))
    .sort((a, b) => distances.get(a.id) - distances.get(b.id));
  const used = new Set();
  const placements = [];

  for (const type of INITIAL_BASE_TYPES) {
    const definition = ENEMY_BASE_DEFINITIONS[type];
    const [minimum, maximum] = definition.range;
    const target = (minimum + maximum) / 2;
    const candidates = available.filter(node => !used.has(node.id));
    const inRange = candidates.filter(node => {
      const route = distances.get(node.id);
      return route >= minimum && route <= maximum;
    });
    const pool = inRange.length > 0 ? inRange : candidates.filter(node => distances.get(node.id) >= 120);
    if (pool.length === 0) break;
    const chosen = pool.reduce((best, node) =>
      Math.abs(distances.get(node.id) - target) < Math.abs(distances.get(best.id) - target) ? node : best
    , pool[0]);
    used.add(chosen.id);
    placements.push({ type, nodeId: chosen.id, routeDistance: distances.get(chosen.id) });
  }
  return placements;
}

export function initializeCombatState(state) {
  const graph = state.world.roadGraph;
  const cityNodeId = state.world.homeBase.nodeId;
  state.world.city = { nodeId: cityNodeId, hp: 100, maxHp: 100 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.player.worldPosition = { x: state.world.homeBase.x ?? 0, y: state.world.homeBase.y ?? 0 };
  ensureCivilizationState(state, { initializeInventory: true });
  state.combat.enemies = [];
  state.combat.friendlySquads = [];
  state.combat.defenses = [];
  state.combat.waves = { elapsed: 0, nextSpawnAt: null, active: {}, resourceBaseCheckClock: 30 };
  state.combat.pendingSettlementDamage = [];
  state.world.baseRespawns = [];
  state.world.frontierSources = [];
  state.world.explorationSites = [];
  state.world.exploredSiteChunks = [];
  state.world.recoveryItems = [];
  state.world.recoveryCollection = null;
  state.world.enemyBases = selectEnemyBasePlacements(graph, cityNodeId).map(placement => {
    const definition = ENEMY_BASE_DEFINITIONS[placement.type];
    return {
      id: stableId('enemy_base', placement.type, placement.nodeId), type: placement.type,
      nodeId: placement.nodeId, hp: 100, maxHp: 100, alive: true,
      level: 1, ageSeconds: 0, spawnClock: Math.max(0, definition.interval - definition.firstDelay),
      wavesSent: 0, routeDistance: placement.routeDistance
    };
  });
  reconcileFrontiers(state);
  reconcileExplorationSites(state);
  state.runtime.combatInitialized = true;
  return state;
}

export function ensureCombatInitialized(state) {
  state.combat.pendingSettlementDamage ??= [];
  ensureFrontierState(state);
  ensureExplorationState(state);
  ensurePlayerBaseState(state);
  ensureFriendlyForceState(state);
  ensureCivilizationState(state, { initializeInventory: !state.runtime.combatInitialized });
  if (!state.runtime.combatInitialized || !state.world.city) initializeCombatState(state);
  return state;
}
