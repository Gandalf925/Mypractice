import { RESOURCE_KEYS } from '../civilization/data.js';
import { LifecycleState } from '../core/constants.js';
import { GAME_OVER_SOURCE } from '../core/home-base-destruction.js';

function resourceSnapshot(state) {
  return Object.fromEntries(RESOURCE_KEYS.map(key => [key, state.inventory.resources[key] ?? 0]));
}

function resourceDelta(before, after) {
  const delta = {};
  for (const key of RESOURCE_KEYS) {
    const value = (after[key] ?? 0) - (before[key] ?? 0);
    if (value !== 0) delta[key] = value;
  }
  return delta;
}

export class OfflineSimulator {
  constructor({ combatSystem, civilizationSystem = null, maximumSeconds = 24 * 60 * 60, maximumIterations = 400000, maximumStepSeconds = 0.25 } = {}) {
    this.combatSystem = combatSystem;
    this.civilizationSystem = civilizationSystem;
    this.maximumSeconds = maximumSeconds;
    this.maximumIterations = maximumIterations;
    this.maximumStepSeconds = Math.max(0.05, Number(maximumStepSeconds) || 0.25);
  }

  simulate(state, elapsedSeconds) {
    if (state?.lifecycle === LifecycleState.DESTROYED || state?.runtime?.gameOver) return null;
    const simulatedSeconds = Math.min(this.maximumSeconds, Math.max(0, elapsedSeconds));
    if (simulatedSeconds < 2) return null;
    const before = {
      kills: state.statistics.kills,
      cityHp: state.world.city?.hp ?? 0,
      resources: resourceSnapshot(state),
      enemies: state.combat.enemies.length,
      defenses: state.combat.defenses.length,
      buildings: (state.civilization?.buildings ?? []).length,
      civilizationLevel: state.civilization?.level ?? 0
    };

    let remaining = simulatedSeconds;
    let iterations = 0;
    const previousOfflineSimulation = state.runtime.offlineSimulation;
    state.runtime.offlineSimulation = true;
    try {
      while (remaining > 0.0001 && iterations < this.maximumIterations) {
        const simulatedSoFar = simulatedSeconds - remaining;
        const adaptiveStep = simulatedSoFar < 10 * 60
          ? this.maximumStepSeconds
          : simulatedSoFar < 2 * 60 * 60
            ? Math.max(this.maximumStepSeconds, 10)
            : Math.max(this.maximumStepSeconds, 60);
        const currentStep = Math.min(adaptiveStep, remaining);
        state.runtime.worldTimeMs = (state.runtime.worldTimeMs ?? Date.now()) + currentStep * 1000;
        this.combatSystem.update(state, currentStep);
        if (state.lifecycle === LifecycleState.DESTROYED || state.runtime?.gameOver) {
          state.runtime.gameOver = { ...state.runtime.gameOver, source: GAME_OVER_SOURCE.OFFLINE };
          remaining -= currentStep;
          iterations += 1;
          break;
        }
        this.civilizationSystem?.update(state, currentStep);
        remaining -= currentStep;
        iterations += 1;
      }
    } finally {
      if (previousOfflineSimulation === undefined) delete state.runtime.offlineSimulation;
      else state.runtime.offlineSimulation = previousOfflineSimulation;
    }

    const afterResources = resourceSnapshot(state);
    const afterDefenses = state.combat.defenses.length;
    const afterBuildings = (state.civilization?.buildings ?? []).length;
    state.runtime.lastOfflineSimulationAt = Date.now();
    return {
      requestedSeconds: elapsedSeconds,
      simulatedSeconds: simulatedSeconds - remaining,
      capped: elapsedSeconds > this.maximumSeconds || remaining > 0.0001,
      kills: state.statistics.kills - before.kills,
      cityDamage: Math.max(0, before.cityHp - (state.world.city?.hp ?? 0)),
      resources: resourceDelta(before.resources, afterResources),
      enemiesDelta: state.combat.enemies.length - before.enemies,
      defensesLost: Math.max(0, before.defenses - afterDefenses),
      buildingsLost: Math.max(0, before.buildings - afterBuildings),
      civilizationAdvanced: (state.civilization?.level ?? 0) - before.civilizationLevel,
      iterations,
      gameOver: state.runtime?.gameOver ?? null
    };
  }
}
