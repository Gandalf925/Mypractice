import { stableId } from '../core/utilities.js';
import { ENEMY_BASE_DEFINITIONS, ENEMY_DEFINITIONS, ENEMY_GENERATIONS } from './definitions.js';
import { spawnEnemy } from './enemy-system.js';
import { enemyGroupLimitForState, enemyUnitCount } from './enemy-grouping.js';
import { civilizationPressureRampRatio, effectivePressureCivilizationLevel } from '../base/base-collapse.js';
import { effectiveEnemyCivilizationLevel, enemyBaseLevelForState, enemyDensityForState, expandedWaveSize, waveIntervalForBase } from './enemy-scaling.js';
import { INITIAL_BASE_TYPES, selectEnemyBaseNode } from './enemy-base-placement.js';
import { enemyBehaviorForDefinition, waveDoctrineDefinition } from './enemy-personalities.js';
import { enemyRegroupActive } from '../core/recovery-balance.js';

export { INITIAL_BASE_TYPES } from './enemy-base-placement.js';

const OPENING_WAVE_INTERVAL_MULTIPLIER = 1.35;
const OPENING_ACTIVE_WAVE_LIMIT = 2;
const OPENING_GRACE_SECONDS = 15 * 60;
const WAVE_SPAWN_RETRY_SECONDS = 12;

function activeWaveCount(state) {
  return Object.values(state.combat?.waves?.active ?? {}).filter(wave => (wave?.remaining ?? 0) > 0).length;
}

export function reconcileActiveWaveRecords(state) {
  state.combat.waves ??= { active: {} };
  state.combat.waves.active ??= {};
  const liveCounts = new Map();
  const representative = new Map();
  for (const enemy of state.combat.enemies ?? []) {
    if (enemy.hp <= 0 || enemy.waveResolved || !enemy.waveId) continue;
    liveCounts.set(enemy.waveId, (liveCounts.get(enemy.waveId) ?? 0) + enemyUnitCount(enemy));
    if (!representative.has(enemy.waveId)) representative.set(enemy.waveId, enemy);
  }
  for (const [waveId, record] of Object.entries(state.combat.waves.active)) {
    const remaining = liveCounts.get(waveId) ?? 0;
    if (remaining <= 0) delete state.combat.waves.active[waveId];
    else record.remaining = remaining;
  }
  for (const [waveId, remaining] of liveCounts) {
    if (state.combat.waves.active[waveId]) continue;
    const enemy = representative.get(waveId);
    const frontierSource = (state.world.frontierSources ?? []).find(source => source.id === enemy?.sourceBaseId) ?? null;
    state.combat.waves.active[waveId] = {
      id: waveId,
      baseId: enemy?.sourceBaseId ?? null,
      frontierSourceId: enemy?.frontierSourceId ?? frontierSource?.id ?? null,
      remaining,
      breached: false,
      guard: Boolean(enemy?.waveGuard),
      doctrineKey: enemy?.doctrineKey ?? 'frontal',
      startedAt: Number(enemy?.waveStartedAt) || Number(state.runtime?.worldTimeMs) || Date.now(),
      recovered: true
    };
  }
  return state.combat.waves.active;
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
  const effectiveGeneration = effectivePressureCivilizationLevel(state);
  if (effectiveGeneration < generation - 1) return { generation, probability: 0 };
  const ratio = Math.max(0, Math.min(1, civilizationPressureRampRatio(state)));
  return { generation, probability: ratio };
}

function levelWave(definition, base) {
  const level = Math.max(1, Math.min(8, Math.floor(Number(base.level) || 1)));
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

// Distinct enemy facility types stay bounded, but total active outposts can grow
// with player territory. The total cap protects mobile performance while still
// guaranteeing nearby opposition for each owned base.
export const MAX_ACTIVE_ENEMY_BASES = 10;
export const MAX_TOTAL_ENEMY_OUTPOSTS = 28;

export function enemyBaseTypesForCivilization(level) {
  const normalized = Math.max(0, Math.min(7, Math.floor(Number(level) || 0)));
  const types = [...INITIAL_BASE_TYPES];
  if (normalized >= 2) types.push('copperCamp', 'tinCamp');
  if (normalized >= 3) types.push('ironCamp');
  if (normalized >= 3 && normalized < 5) types.push('bronzeCamp');
  if (normalized >= 3 && normalized < 6) types.push('siegeWorks');
  if (normalized >= 5) types.push('steelCamp');
  if (normalized >= 6) types.push('machineWorks');
  if (normalized >= 7) types.push('commandFortress');
  return [...new Set(types)].slice(0, MAX_ACTIVE_ENEMY_BASES);
}

export function unlockedBaseTypes(state) {
  // Facility availability follows the real civilization level so required
  // resource camps such as copper and tin appear as soon as their progression
  // tier unlocks. Their waves, density, and level still use the 24-hour
  // pressure ramp via enemy-scaling.
  return enemyBaseTypesForCivilization(Number(state?.civilization?.level) || 0);
}

const ENEMY_BASE_REPLACEMENTS = Object.freeze([
  Object.freeze({ level: 5, from: 'bronzeCamp', to: 'steelCamp' }),
  Object.freeze({ level: 6, from: 'siegeWorks', to: 'machineWorks' })
]);

function activeEnemyBaseCount(state) {
  return (state.world?.enemyBases ?? []).filter(base => base.alive).length;
}

function activeExpansionBases(state) {
  return [
    ...(state.world?.playerBases ?? []).filter(base => base.status === 'ESTABLISHED' && !base.primary),
    ...(state.world?.fieldBases ?? []).filter(base => base.status === 'ESTABLISHED')
  ].filter(base => base?.id && base.nodeId);
}

function establishedOwnedBases(state) {
  return [
    ...(state.world?.playerBases ?? []).filter(base => base.status === 'ESTABLISHED'),
    ...(state.world?.fieldBases ?? []).filter(base => base.status === 'ESTABLISHED')
  ].filter(base => base?.id && base.nodeId);
}

function linkedOutpostMinimum(anchorBase) {
  return anchorBase ? 1 : 0;
}

function linkedOutpostMaximum(state, anchorBase) {
  const level = Math.max(0, Math.floor(Number(state?.civilization?.level) || 0));
  if (anchorBase?.kind === 'FIELD') return level >= 5 ? 2 : 1;
  return Math.min(3, 1 + Math.floor(level / 3));
}

function activeLinkedOutposts(state, anchorBase) {
  if (!anchorBase?.id) return [];
  return (state.world?.enemyBases ?? []).filter(base => base.alive && base.frontlineAnchorBaseId === anchorBase.id);
}

function pendingLinkedOutposts(state, anchorBase) {
  if (!anchorBase?.id) return [];
  return (state.world?.baseRespawns ?? []).filter(respawn => respawn.frontlineAnchorBaseId === anchorBase.id);
}

function enemyBaseGlobalLimit(state) {
  const level = Math.max(0, Math.floor(Number(state?.civilization?.level) || 0));
  const majorCount = (state.world?.playerBases ?? []).filter(base => base.status === 'ESTABLISHED' && !base.primary).length;
  const fieldCount = (state.world?.fieldBases ?? []).filter(base => base.status === 'ESTABLISHED').length;
  return Math.min(MAX_TOTAL_ENEMY_OUTPOSTS, 6 + level * 2 + majorCount * 2 + fieldCount);
}

function desiredEnemyBaseCount(state) {
  const core = unlockedBaseTypes(state).length;
  const linkedMinimum = establishedOwnedBases(state).reduce((sum, base) => sum + linkedOutpostMinimum(base), 0);
  return Math.min(enemyBaseGlobalLimit(state), Math.max(core, core + Math.max(0, linkedMinimum - 1)));
}

function frontlineBaseTypeForAnchor(state, anchorBase, index) {
  const available = unlockedBaseTypes(state);
  if (!available.length) return null;
  const preferredByCivilization = Math.max(0, Math.floor(Number(state.civilization?.level) || 0)) >= 2
    ? available
    : available.filter(type => INITIAL_BASE_TYPES.includes(type));
  const pool = preferredByCivilization.length ? preferredByCivilization : available;
  let hash = 2166136261;
  for (const character of `${anchorBase.id}:${anchorBase.nodeId}:${index}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return pool[(hash >>> 0) % pool.length];
}

function markEnemyBaseNetworkClean(state) {
  if (state.combat?.waves) state.combat.waves.enemyBaseNetworkDirty = false;
}

function transformEnemyBase(base, targetType) {
  const definition = ENEMY_BASE_DEFINITIONS[targetType];
  if (!definition) return false;
  const oldMaximum = Math.max(1, Number(base.maxHp) || 120);
  const healthRatio = Math.max(0, Math.min(1, Number(base.hp ?? oldMaximum) / oldMaximum));
  base.upgradedFromType ??= base.type;
  base.type = targetType;
  base.maxHp = definition.isResourceBase ? 120 : 100;
  base.hp = Math.max(1, Math.round(base.maxHp * healthRatio));
  base.alive = true;
  base.destroyed = false;
  base.retired = false;
  base.spawnClock = Math.max(0, definition.interval - definition.firstDelay);
  base.wavesSent = 0;
  base.guardWaveTriggered = false;
  return true;
}

export function synchronizeEnemyBaseNetwork(state, events = null) {
  state.world.enemyBases ??= [];
  state.world.baseRespawns ??= [];
  const level = Math.max(0, Math.floor(Number(state.civilization?.level) || 0));
  for (const replacement of ENEMY_BASE_REPLACEMENTS) {
    if (level < replacement.level) continue;
    const current = state.world.enemyBases.find(base => base.type === replacement.to && base.alive) ?? null;
    const obsolete = state.world.enemyBases.filter(base => base.type === replacement.from && base.alive);
    if (!current && obsolete.length) {
      const converted = obsolete.shift();
      transformEnemyBase(converted, replacement.to);
      events?.emit('message', { text: `${ENEMY_BASE_DEFINITIONS[replacement.from].name}が${ENEMY_BASE_DEFINITIONS[replacement.to].name}へ再編されました。` });
    }
    for (const base of obsolete) {
      base.alive = false;
      base.hp = 0;
      base.retired = true;
      base.destroyed = false;
    }
    const targetExists = state.world.enemyBases.some(base => base.type === replacement.to && base.alive);
    let targetPending = state.world.baseRespawns.some(respawn => respawn.baseType === replacement.to);
    const nextRespawns = [];
    for (const respawn of state.world.baseRespawns) {
      if (respawn.baseType !== replacement.from) {
        nextRespawns.push(respawn);
        continue;
      }
      if (targetExists || targetPending) continue;
      respawn.baseType = replacement.to;
      targetPending = true;
      nextRespawns.push(respawn);
    }
    state.world.baseRespawns = nextRespawns;
  }
  return state.world.enemyBases;
}

function createBase(type, placement, idSeed = placement.node.id, metadata = {}) {
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
    wavesSent: 0, routeDistance: placement.route,
    frontlineAnchorBaseId: metadata.frontlineAnchorBaseId ?? null,
    frontlineAnchorNodeId: metadata.frontlineAnchorNodeId ?? placement.anchorNodeId ?? null
  };
}

export function spawnEnemyBaseGuard(state, base, events = null) {
  if (!base?.alive || base.guardWaveTriggered) return 0;
  const spawned = new WaveSystem(events).spawnWave(state, base, true);
  if (spawned > 0) {
    base.guardWaveTriggered = true;
    events?.emit('message', { text: `${ENEMY_BASE_DEFINITIONS[base.type].name}の守備隊が迎撃を開始しました。` });
  }
  return spawned;
}

export class WaveSystem {
  constructor(events) { this.events = events; }

  spawnWave(state, base, guard = false) {
    const doctrine = waveDoctrineForBase(state, base, guard);
    const baseWave = waveForBase(state, base, doctrine.key);
    const density = enemyDensityForState(state);
    const desiredSize = guard ? baseWave.length : expandedWaveSize(state, baseWave.length);
    const wave = Array.from({ length: desiredSize }, (_, index) => baseWave[index % Math.max(1, baseWave.length)]).filter(Boolean);
    state.combat.waves.active ??= {};
    const waveId = stableId('wave', base.id, base.wavesSent, state.runtime?.worldTimeMs ?? Date.now());
    let spawned = 0;
    const spacing = guard ? 3 : density.departureSpacingSeconds;
    const cohorts = [];
    for (const [index, type] of wave.entries()) {
      const departDelay = index * spacing;
      const limit = guard ? 1 : enemyGroupLimitForState(state, type);
      const windowSeconds = Math.max(spacing * 2.25, guard ? 4 : 5);
      const previous = cohorts.findLast(cohort =>
        cohort.type === type
        && cohort.count < limit
        && departDelay - cohort.departDelay <= windowSeconds
      );
      if (previous) previous.count += 1;
      else cohorts.push({ type, count: 1, departDelay });
    }
    for (const cohort of cohorts) {
      const enemy = spawnEnemy(state, base, cohort.type, cohort.departDelay, waveId, doctrine.key, { unitCount: cohort.count });
      if (!enemy) continue;
      enemy.waveGuard = guard;
      enemy.waveStartedAt = state.runtime?.worldTimeMs ?? Date.now();
      spawned += enemyUnitCount(enemy);
    }
    if (spawned > 0) {
      state.combat.waves.active[waveId] = {
        id: waveId, baseId: base.id, remaining: spawned, breached: false, guard,
        doctrineKey: doctrine.key, startedAt: state.runtime?.worldTimeMs ?? Date.now()
      };
      this.events?.emit('combat:wave-launched', { baseId: base.id, waveId, count: spawned, guard, doctrineKey: doctrine.key, level: base.level ?? 1 });
    }
    if (!guard && spawned > 0) {
      base.wavesSent += 1;
      this.events?.emit('message', { text: `${ENEMY_BASE_DEFINITIONS[base.type].name} Lv.${base.level ?? 1}が「${doctrine.label}」を開始しました。` });
    }
    return spawned;
  }

  ensureUnlockedBases(state) {
    synchronizeEnemyBaseNetwork(state, this.events);
    state.world.baseRespawns ??= [];
    const totalLimit = enemyBaseGlobalLimit(state);
    const pendingTypes = new Set(state.world.baseRespawns.map(item => item.baseType));
    for (const type of unlockedBaseTypes(state)) {
      const exists = state.world.enemyBases.some(base => base.type === type && base.alive);
      if (exists || pendingTypes.has(type)) continue;
      if (activeEnemyBaseCount(state) >= totalLimit) break;
      const placement = selectEnemyBaseNode(state, type);
      if (!placement) continue;
      const base = createBase(type, placement);
      state.world.enemyBases.push(base);
      this.events?.emit('message', { text: `${ENEMY_BASE_DEFINITIONS[type].name}が道路網に出現しました。` });
    }

    const desiredCount = desiredEnemyBaseCount(state);
    const anchors = activeExpansionBases(state);
    let spawnedFrontline = 0;
    for (const anchorBase of anchors) {
      if (activeEnemyBaseCount(state) >= desiredCount || activeEnemyBaseCount(state) >= totalLimit) break;
      const linked = activeLinkedOutposts(state, anchorBase).length;
      const pending = pendingLinkedOutposts(state, anchorBase).length;
      const required = Math.min(linkedOutpostMinimum(anchorBase), linkedOutpostMaximum(state, anchorBase));
      if (linked + pending >= required) continue;
      const type = frontlineBaseTypeForAnchor(state, anchorBase, linked + pending + spawnedFrontline);
      if (!type) continue;
      const placement = selectEnemyBaseNode(state, type, null, { anchorNodeId: anchorBase.nodeId });
      if (!placement) continue;
      const base = createBase(type, placement, `${anchorBase.id}:${type}:${linked + pending}:${spawnedFrontline}`, {
        frontlineAnchorBaseId: anchorBase.id,
        frontlineAnchorNodeId: anchorBase.nodeId
      });
      state.world.enemyBases.push(base);
      spawnedFrontline += 1;
      this.events?.emit('message', { text: `${anchorBase.name ?? '新設拠点'}周辺で${ENEMY_BASE_DEFINITIONS[type].name}が活動を開始しました。` });
    }
    markEnemyBaseNetworkClean(state);
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
      const desiredTypes = new Set(unlockedBaseTypes(state));
      if (!desiredTypes.has(respawn.baseType)) continue;
      const anchor = respawn.frontlineAnchorBaseId
        ? establishedOwnedBases(state).find(base => base.id === respawn.frontlineAnchorBaseId) ?? null
        : null;
      if (respawn.frontlineAnchorBaseId && !anchor) continue;
      if (anchor && activeLinkedOutposts(state, anchor).length >= linkedOutpostMinimum(anchor)) continue;
      if (!anchor && state.world.enemyBases.some(base => base.type === respawn.baseType && base.alive)) continue;
      if (activeEnemyBaseCount(state) >= enemyBaseGlobalLimit(state)) {
        respawn.remainingSec = 60 * 60;
        respawn.attempts = (respawn.attempts ?? 0) + 1;
        remaining.push(respawn);
        continue;
      }
      const anchorNodeId = anchor?.nodeId ?? respawn.frontlineAnchorNodeId ?? null;
      const placement = selectEnemyBaseNode(state, respawn.baseType, respawn.sourceNodeId, anchorNodeId ? { anchorNodeId } : {});
      if (!placement) {
        respawn.remainingSec = 60 * 60;
        respawn.attempts = (respawn.attempts ?? 0) + 1;
        remaining.push(respawn);
        continue;
      }
      const base = createBase(respawn.baseType, placement, `${respawn.id}:${respawn.attempts ?? 0}`, anchor ? {
        frontlineAnchorBaseId: anchor.id,
        frontlineAnchorNodeId: anchor.nodeId
      } : {});
      state.world.enemyBases.push(base);
      this.events?.emit('message', { text: anchor
        ? `${anchor.name ?? '拠点'}周辺で${ENEMY_BASE_DEFINITIONS[respawn.baseType].name}が再活動しました。`
        : `${ENEMY_BASE_DEFINITIONS[respawn.baseType].name}が別の道路へ再出現しました。` });
    }
    state.world.baseRespawns = remaining;
  }

  update(state, deltaSeconds) {
    if (state.combat?.playerCheckmate?.active) {
      state.combat.waves ??= { active: {} };
      state.combat.waves.active = {};
      return;
    }
    reconcileActiveWaveRecords(state);
    synchronizeEnemyBaseNetwork(state, this.events);
    this.processRespawns(state, deltaSeconds);
    state.combat.waves.resourceBaseCheckClock = (state.combat.waves.resourceBaseCheckClock ?? 30) + deltaSeconds;
    if (state.combat.waves.enemyBaseNetworkDirty) {
      state.combat.waves.resourceBaseCheckClock = 0;
      this.ensureUnlockedBases(state);
    }
    while (state.combat.waves.resourceBaseCheckClock >= 30) {
      state.combat.waves.resourceBaseCheckClock -= 30;
      this.ensureUnlockedBases(state);
    }
    const regrouping = enemyRegroupActive(state);
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
      if (regrouping) continue;
      base.spawnClock = (base.spawnClock ?? 0) + deltaSeconds;
      const openingMultiplier = openingPressureLimited(state) ? OPENING_WAVE_INTERVAL_MULTIPLIER : 1;
      const density = enemyDensityForState(state);
      const interval = waveIntervalForBase(definition, base.level, state.world.city.hp)
        * density.intervalMultiplier
        * Math.max(1, Number(base.frontPressureMultiplier) || 1)
        * openingMultiplier;
      if (openingPressureLimited(state) && activeWaveCount(state) >= OPENING_ACTIVE_WAVE_LIMIT) {
        base.spawnClock = Math.min(base.spawnClock, interval);
        continue;
      }
      if (base.spawnClock >= interval) {
        if (openingPressureLimited(state) && activeWaveCount(state) >= OPENING_ACTIVE_WAVE_LIMIT) {
          base.spawnClock = Math.min(base.spawnClock, interval);
          continue;
        }
        // Old saves or a civilization upgrade may carry a large clock. Launch only the
        // currently due wave; offline simulation already advances in bounded time steps.
        const spawned = this.spawnWave(state, base);
        base.spawnClock = spawned > 0
          ? base.spawnClock % interval
          : Math.max(0, interval - WAVE_SPAWN_RETRY_SECONDS);
      }
    }
  }
}
