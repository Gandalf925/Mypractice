import { RESOURCE_KEYS } from '../civilization/data.js';

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
  constructor({ combatSystem, civilizationSystem = null, maximumSeconds = 12 * 60 * 60, maximumIterations = 12000 } = {}) {
    this.combatSystem = combatSystem;
    this.civilizationSystem = civilizationSystem;
    this.maximumSeconds = maximumSeconds;
    this.maximumIterations = maximumIterations;
  }

  simulate(state, elapsedSeconds) {
    const simulatedSeconds = Math.min(this.maximumSeconds, Math.max(0, elapsedSeconds));
    if (simulatedSeconds < 2) return null;
    const before = {
      kills: state.statistics.kills,
      cityHp: state.world.city?.hp ?? 0,
      resources: resourceSnapshot(state),
      enemies: state.combat.enemies.length,
      destroyedDefenses: state.combat.defenses.filter(defense => defense.ruined || defense.hp <= 0).length,
      ruinedBuildings: (state.civilization?.buildings ?? []).filter(building => building.ruined && !building.demolished).length,
      civilizationLevel: state.civilization?.level ?? 0
    };

    const step = Math.max(0.25, Math.min(5, simulatedSeconds / this.maximumIterations));
    let remaining = simulatedSeconds;
    let iterations = 0;
    while (remaining > 0.0001 && iterations < this.maximumIterations) {
      const currentStep = Math.min(step, remaining);
      state.runtime.worldTimeMs = (state.runtime.worldTimeMs ?? Date.now()) + currentStep * 1000;
      this.combatSystem.update(state, currentStep);
      this.civilizationSystem?.update(state, currentStep);
      remaining -= currentStep;
      iterations += 1;
    }

    const afterResources = resourceSnapshot(state);
    const afterDestroyed = state.combat.defenses.filter(defense => defense.ruined || defense.hp <= 0).length;
    const afterRuinedBuildings = (state.civilization?.buildings ?? []).filter(building => building.ruined && !building.demolished).length;
    state.runtime.lastOfflineSimulationAt = Date.now();
    return {
      requestedSeconds: elapsedSeconds,
      simulatedSeconds: simulatedSeconds - remaining,
      capped: elapsedSeconds > this.maximumSeconds || remaining > 0.0001,
      kills: state.statistics.kills - before.kills,
      cityDamage: Math.max(0, before.cityHp - (state.world.city?.hp ?? 0)),
      resources: resourceDelta(before.resources, afterResources),
      enemiesDelta: state.combat.enemies.length - before.enemies,
      defensesLost: afterDestroyed - before.destroyedDefenses,
      buildingsLost: afterRuinedBuildings - before.ruinedBuildings,
      civilizationAdvanced: (state.civilization?.level ?? 0) - before.civilizationLevel,
      iterations
    };
  }
}
