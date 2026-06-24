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
  state.combat.enemyRegroupUntil = 0;
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
  state.combat.enemies = Array.isArray(state.combat.enemies) ? state.combat.enemies : [];
  state.combat.friendlySquads = Array.isArray(state.combat.friendlySquads) ? state.combat.friendlySquads : [];
  state.combat.defenses = Array.isArray(state.combat.defenses) ? state.combat.defenses : [];
  state.combat.waves ??= { elapsed: 0, nextSpawnAt: null, active: {}, resourceBaseCheckClock: 30 };
  state.combat.pendingSettlementDamage ??= [];
  state.combat.cityRecoveryCooldown = Math.max(0, Number(state.combat.cityRecoveryCooldown) || 0);
  state.combat.enemyRegroupUntil = Math.max(0, Number(state.combat.enemyRegroupUntil) || 0);

  for (const defense of state.combat.defenses) {
    defense.hp = Math.max(0, Number(defense.hp) || 0);
    defense.maxHp = Math.max(1, Number(defense.maxHp) || defense.hp || 1);
    defense.ruined = Boolean(defense.ruined || defense.hp <= 0);
    if (defense.kind === 'barrier') {
      defense.type = 'barrier';
      defense.isGate = Boolean(defense.isGate || defense.line === 'gate');
      defense.line = defense.isGate ? 'gate' : 'barrier';
      defense.defenseKey ??= `${defense.line}${Math.max(0, Number(defense.tier) || 0)}`;
    }
  }

  ensureFrontierState(state);
  ensureExplorationState(state);
  const establishedCombat = Boolean(state.world?.city && state.world?.homeBase);
  ensureCivilizationState(state, { initializeInventory: !establishedCombat });
  if (establishedCombat) {
    state.runtime.combatInitialized = true;
  } else if (state.world?.homeBase?.nodeId) {
    initializeCombatState(state);
  }
  return state;
}
