import { stableId } from '../core/utilities.js';
import { ENEMY_BASE_DEFINITIONS, ENEMY_DEFINITIONS, ENEMY_GENERATIONS } from './definitions.js';
import { spawnEnemy } from './enemy-system.js';
import { enemyBaseLevelForState, waveIntervalForBase } from './enemy-scaling.js';
import { INITIAL_BASE_TYPES, selectEnemyBaseNode } from './enemy-base-placement.js';
import { enemyBehaviorForDefinition, waveDoctrineDefinition } from './enemy-personalities.js';

export { INITIAL_BASE_TYPES } from './enemy-base-placement.js';

const OPENING_WAVE_INTERVAL_MULTIPLIER = 1.35;
const OPENING_ACTIVE_WAVE_LIMIT = 2;
const OPENING_GRACE_SECONDS = 15 * 60;

function activeWaveCount(state) {
  return Object.values(state.combat?.waves?.active ?? {}).filter(wave => (wave?.remaining ?? 0) > 0).length;
}

function openingPressureLimited(state) {
  if (Math.max(0, Math.floor(Number(state.civilization?.level) || 0)) !== 0) return false;
  const createdAt = Number(state.runtime?.createdAt) || Number(state.runtime?.worldTimeMs) || Date.now();
  const worldTime = Number(state.runtime?.worldTimeMs) || createdAt;
  return Math.max(0, worldTime - createdAt) < OPENING_GRACE_SECONDS * 1000;
}


function deterministicIndex(text, length) {
  let hash = 2166136261;
  for (const character of text) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return length ? (hash >>> 0) % length : 0;
}

export function waveDoctrineForBase(state, base, guard = false) {
  if (guard) return waveDoctrineDefinition('guard');
  const level = Math.max(0, Math.floor(Number(state.civilization?.level) || 0));
  const available = ['frontal'];
  if (level >= 1) available.push('flank', 'raid');
  if (level >= 2) available.push('breach');
  if (level >= 3) available.push('support');
  if (level >= 4) available.push('hunt');
  const key = available[deterministicIndex(`${base.id}:${base.wavesSent}:doctrine:${level}`, available.length)];
  return waveDoctrineDefinition(key);
}

function doctrinePool(pool, doctrine) {
  const preferred = new Set(doctrine.preferredPersonalities ?? []);
  const matching = pool.filter(type => preferred.has(enemyBehaviorForDefinition(ENEMY_DEFINITIONS[type]).personalityKey));
  return matching.length ? matching : pool;
}

export function enemyGenerationMix(state) {
  const generation = Math.max(0, Math.floor(Number(state.civilization.level) || 0));
  if (generation <= 0) return { generation: 0, probability: 0 };
  const worldNow = Number(state.runtime?.worldTimeMs) || Date.now();
  const elapsed = worldNow - (Number(state.civilization.completedAt) || worldNow);
  if (elapsed < 15 * 60 * 1000) return { generation, probability: 0 };
  if (elapsed < 30 * 60 * 1000) return { generation, probability: 0.25 };
  if (elapsed < 45 * 60 * 1000) return { generation, probability: 0.50 };
  if (elapsed < 60 * 60 * 1000) return { generation, probability: 0.75 };
  return { generation, probability: 1 };
}

function levelWave(definition, base) {
  const level = Math.max(1, Math.min(5, Math.floor(Number(base.level) || 1)));
  const initial = [...(definition.waves[1] ?? [])];
  const desiredCount = initial.length + level - 1;
  const template = [...(definition.waves[Math.min(level, 3)] ?? initial)];
  const reinforcementPool = [
    ...(definition.waves[3] ?? []),
    ...(definition.waves[2] ?? []),
    ...initial
  ];
  const wave = template.length > desiredCount && desiredCount > 1
    ? [...template.slice(0, desiredCount - 1), template.at(-1)]
    : template.slice(0, desiredCount);
  while (wave.length < desiredCount && reinforcementPool.length) {
    const index = deterministicIndex(`${base.id}:${base.wavesSent}:${level}:reinforcement:${wave.length}`, reinforcementPool.length);
    wave.push(reinforcementPool[index]);
  }
  return wave;
}

export function waveForBase(state, base, doctrineKey = null) {
  const definition = ENEMY_BASE_DEFINITIONS[base.type];
  if (!definition) return [];
  const wave = levelWave(definition, base);
  const doctrine = doctrineKey ? waveDoctrineDefinition(doctrineKey) : waveDoctrineForBase(state, base);
  const mix = enemyGenerationMix(state);
  if (mix.generation <= 0 || wave.length === 0) return wave;
  const current = ENEMY_GENERATIONS[mix.generation] ?? [];
  const previous = Object.entries(ENEMY_GENERATIONS)
    .filter(([generation]) => Number(generation) > 0 && Number(generation) < mix.generation)
    .flatMap(([, values]) => values);
  if (mix.probability <= 0 && previous.length === 0) return wave;
  const replacementSlots = Math.min(wave.length, 1 + Math.floor(Math.max(1, Number(base.level) || 1) / 2));
  for (let index = 0; index < Math.min(replacementSlots, wave.length); index += 1) {
    const roll = deterministicIndex(`${base.id}:${base.wavesSent}:${index}:roll`, 1000) / 1000;
    const rawPool = current.length && roll < mix.probability ? current : previous;
    const pool = doctrinePool(rawPool, doctrine);
    if (!pool.length) continue;
    const type = pool[deterministicIndex(`${base.id}:${base.wavesSent}:${index}:${doctrine.key}:type`, pool.length)];
    wave[wave.length - 1 - index] = type;
  }
  return wave;
}

function resourceBaseTypes(level) {
  if (level >= 3) return ['copperCamp', 'tinCamp', 'ironCamp', 'bronzeCamp', 'siegeWorks'];
  if (level >= 2) return ['copperCamp', 'tinCamp'];
  return [];
}

export function unlockedBaseTypes(state) {
  return [...INITIAL_BASE_TYPES, ...resourceBaseTypes(state.civilization.level ?? 0)];
}

function createBase(type, placement, idSeed = placement.node.id) {
  const definition = ENEMY_BASE_DEFINITIONS[type];
  return {
    id: stableId('enemy_base', type, idSeed), type, nodeId: placement.node.id,
    hp: definition.isResourceBase ? 120 : 100,
    maxHp: definition.isResourceBase ? 120 : 100,
    alive: true,
    level: 1, ageSeconds: 0,
    spawnClock: definition.interval - definition.firstDelay - (placement.initialDelayBonusSec ?? 0),
    initialDelayBonusSec: placement.initialDelayBonusSec ?? 0,
    frontPressureMultiplier: placement.frontPressureMultiplier ?? 1,
    wavesSent: 0, routeDistance: placement.route
  };
}

export function spawnEnemyBaseGuard(state, base, events = null) {
  if (!base?.alive || base.guardWaveTriggered) return 0;
  base.guardWaveTriggered = true;
  const spawned = new WaveSystem(events).spawnWave(state, base, true);
  if (spawned > 0) {
    events?.emit('message', { text: `${ENEMY_BASE_DEFINITIONS[base.type].name}の守備隊が迎撃を開始しました。` });
  }
  return spawned;
}

export class WaveSystem {
  constructor(events) { this.events = events; }

  spawnWave(state, base, guard = false) {
    const doctrine = waveDoctrineForBase(state, base, guard);
    const wave = waveForBase(state, base, doctrine.key);
    state.combat.waves.active ??= {};
    const waveId = stableId('wave', base.id, base.wavesSent, state.runtime?.worldTimeMs ?? Date.now());
    let spawned = 0;
    wave.forEach((type, index) => {
      if (spawnEnemy(state, base, type, index * (guard ? 3 : 8), waveId, doctrine.key)) spawned += 1;
    });
    if (spawned > 0) {
      state.combat.waves.active[waveId] = {
        id: waveId, baseId: base.id, remaining: spawned, breached: false, guard,
        doctrineKey: doctrine.key, startedAt: state.runtime?.worldTimeMs ?? Date.now()
      };
      this.events?.emit('combat:wave-launched', { baseId: base.id, waveId, count: spawned, guard, doctrineKey: doctrine.key, level: base.level ?? 1 });
    }
    if (!guard) {
      base.wavesSent += 1;
      this.events?.emit('message', { text: `${ENEMY_BASE_DEFINITIONS[base.type].name} Lv.${base.level ?? 1}が「${doctrine.label}」を開始しました。` });
    }
    return spawned;
  }

  ensureUnlockedBases(state) {
    state.world.baseRespawns ??= [];
    const pendingTypes = new Set(state.world.baseRespawns.map(item => item.baseType));
    for (const type of unlockedBaseTypes(state)) {
      const exists = state.world.enemyBases.some(base => base.type === type && base.alive);
      if (exists || pendingTypes.has(type)) continue;
      const placement = selectEnemyBaseNode(state, type);
      if (!placement) continue;
      const base = createBase(type, placement);
      state.world.enemyBases.push(base);
      this.events?.emit('message', { text: `${ENEMY_BASE_DEFINITIONS[type].name}が道路網に出現しました。` });
    }
  }

  processRespawns(state, deltaSeconds) {
    state.world.baseRespawns ??= [];
    const remaining = [];
    for (const respawn of state.world.baseRespawns) {
      respawn.remainingSec = Math.max(0, Number(respawn.remainingSec) - deltaSeconds);
      if (respawn.remainingSec > 0) {
        remaining.push(respawn);
        continue;
      }
      const placement = selectEnemyBaseNode(state, respawn.baseType, respawn.sourceNodeId);
      if (!placement) {
        respawn.remainingSec = 60 * 60;
        respawn.attempts = (respawn.attempts ?? 0) + 1;
        remaining.push(respawn);
        continue;
      }
      const base = createBase(respawn.baseType, placement, `${respawn.id}:${respawn.attempts ?? 0}`);
      state.world.enemyBases.push(base);
      this.events?.emit('message', { text: `${ENEMY_BASE_DEFINITIONS[respawn.baseType].name}が別の道路へ再出現しました。` });
    }
    state.world.baseRespawns = remaining;
  }

  update(state, deltaSeconds) {
    this.processRespawns(state, deltaSeconds);
    state.combat.waves.resourceBaseCheckClock = (state.combat.waves.resourceBaseCheckClock ?? 30) + deltaSeconds;
    while (state.combat.waves.resourceBaseCheckClock >= 30) {
      state.combat.waves.resourceBaseCheckClock -= 30;
      this.ensureUnlockedBases(state);
    }
    for (const base of state.world.enemyBases) {
      if (!base.alive) continue;
      const definition = ENEMY_BASE_DEFINITIONS[base.type];
      if (!definition) continue;
      base.ageSeconds = (base.ageSeconds ?? 0) + deltaSeconds;
      const previousLevel = Math.max(1, Math.floor(Number(base.level) || 1));
      base.level = enemyBaseLevelForState(state, base.ageSeconds);
      if (base.level > previousLevel) {
        this.events?.emit('message', { text: `${definition.name}の脅威レベルがLv.${base.level}へ上昇しました。` });
        this.events?.emit('combat:enemy-base-level-up', { baseId: base.id, level: base.level });
      }
      base.spawnClock = (base.spawnClock ?? 0) + deltaSeconds;
      const openingMultiplier = openingPressureLimited(state) ? OPENING_WAVE_INTERVAL_MULTIPLIER : 1;
      const interval = waveIntervalForBase(definition, base.level, state.world.city.hp)
        * Math.max(1, Number(base.frontPressureMultiplier) || 1)
        * openingMultiplier;
      if (openingPressureLimited(state) && activeWaveCount(state) >= OPENING_ACTIVE_WAVE_LIMIT) {
        base.spawnClock = Math.min(base.spawnClock, interval);
        continue;
      }
      while (base.spawnClock >= interval) {
        if (openingPressureLimited(state) && activeWaveCount(state) >= OPENING_ACTIVE_WAVE_LIMIT) {
          base.spawnClock = Math.min(base.spawnClock, interval);
          break;
        }
        base.spawnClock -= interval;
        this.spawnWave(state, base);
      }
    }
  }
}
