import { stableId } from '../core/utilities.js';
import { ensureCivilizationState } from '../civilization/civilization-system.js';
import { ENEMY_BASE_DEFINITIONS } from './definitions.js';
import { selectInitialEnemyBasePlacements } from './enemy-base-placement.js';
import { reconcileFrontiers, ensureFrontierState } from '../exploration/frontier-system.js';
import { ensureExplorationState, reconcileExplorationSites } from '../exploration/exploration-system.js';

export const selectEnemyBasePlacements = selectInitialEnemyBasePlacements;

export function initializeCombatState(state) {
  const graph = state.world.roadGraph;
  const cityNodeId = state.world.homeBase.nodeId;
  state.world.city = { nodeId: cityNodeId, hp: 100, maxHp: 100 };
  state.world.playerBases = [{ ...state.world.homeBase, name: '本拠地', primary: true, hp: 100, maxHp: 100 }];
  state.world.fieldBases = [];
  state.world.baseRespawns = [];
  state.world.frontierSources = [];
  state.world.explorationSites = [];
  state.world.exploredSiteChunks = [];
  state.world.recoveryItems = [];
  state.world.recoveryCollection = null;
  state.player.worldPosition = { x: state.world.homeBase.x ?? 0, y: state.world.homeBase.y ?? 0 };
  state.combat.enemies = [];
  state.combat.friendlySquads = [];
  state.combat.defenses = [];
  state.combat.waves = { elapsed: 0, nextSpawnAt: null, active: {}, resourceBaseCheckClock: 30 };
  state.combat.pendingSettlementDamage = [];
  state.combat.cityRecoveryCooldown = 0;
  ensureCivilizationState(state, { initializeInventory: true });
  state.world.enemyBases = selectEnemyBasePlacements(graph, cityNodeId).map(placement => {
    const definition = ENEMY_BASE_DEFINITIONS[placement.type];
    return {
      id: stableId('enemy_base', placement.type, placement.nodeId), type: placement.type,
      nodeId: placement.nodeId, hp: 100, maxHp: 100, alive: true,
      level: 1, ageSeconds: 0,
      spawnClock: definition.interval - definition.firstDelay - placement.initialDelayBonusSec,
      initialDelayBonusSec: placement.initialDelayBonusSec,
      frontPressureMultiplier: placement.frontPressureMultiplier,
      wavesSent: 0, routeDistance: placement.routeDistance
    };
  });
  reconcileFrontiers(state);
  reconcileExplorationSites(state);
  state.runtime.combatInitialized = true;
  return state;
}

export function normalizeCombatState(state) {
  state.combat ??= {};
  state.combat.pendingSettlementDamage ??= [];
  state.combat.cityRecoveryCooldown = Math.max(0, Number(state.combat.cityRecoveryCooldown) || 0);
  ensureFrontierState(state);
  ensureExplorationState(state);
  ensureCivilizationState(state, { initializeInventory: !state.runtime.combatInitialized });
  if (!state.runtime.combatInitialized || !state.world.city) initializeCombatState(state);
  return state;
}
