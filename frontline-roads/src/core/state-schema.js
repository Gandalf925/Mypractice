import { LifecycleState, SCHEMA_VERSION } from './constants.js';
import { emptyResourceBundle } from '../civilization/data.js';
import { createProgressState } from '../civilization/progression-system.js';

export function createInitialState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    lifecycle: LifecycleState.BOOT,
    world: {
      roadGraph: null,
      homeBase: null,
      city: null,
      enemyBases: [],
      outposts: [],
      baseRespawns: []
    },
    player: {
      currentPosition: null,
      locationAccuracy: null,
      worldPosition: null
    },
    combat: {
      enemies: [],
      defenses: [],
      waves: { elapsed: 0, nextSpawnAt: null, active: {}, resourceBaseCheckClock: 30 },
      pendingSettlementDamage: []
    },
    civilization: {
      level: 0,
      completedAt: null,
      gracePeriodUntil: null,
      project: null,
      buildings: [],
      productionQueues: [],
      progress: createProgressState()
    },
    inventory: {
      resources: emptyResourceBundle(),
      overflow: {},
      capacity: {},
      lastOverflowSweepAt: 0
    },
    statistics: {
      kills: 0,
      campsCaptured: 0
    },
    runtime: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastSavedAt: 0,
      worldTimeMs: Date.now(),
      lastError: null,
      combatInitialized: false,
      performance: { frames: 0, slowFrames: 0, lastFrameMs: 0 }
    }
  };
}

export function validateState(state) {
  const errors = [];
  if (!state || typeof state !== 'object') errors.push('state must be an object');
  if (state?.schemaVersion !== SCHEMA_VERSION) errors.push('unsupported schemaVersion');
  if (!Object.values(LifecycleState).includes(state?.lifecycle)) errors.push('invalid lifecycle');
  if (!state?.world || typeof state.world !== 'object') errors.push('world is required');
  if (!state?.player || typeof state.player !== 'object') errors.push('player is required');
  if (!state?.combat || typeof state.combat !== 'object') errors.push('combat is required');
  if (!state?.civilization || typeof state.civilization !== 'object') errors.push('civilization is required');
  if (!state?.inventory?.resources || typeof state.inventory.resources !== 'object') errors.push('inventory is required');
  if (!state?.runtime || typeof state.runtime !== 'object') errors.push('runtime is required');
  return { valid: errors.length === 0, errors };
}
