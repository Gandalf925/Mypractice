import { stableId } from '../core/utilities.js';
import { ENEMY_BASE_DEFINITIONS, ENEMY_GENERATIONS } from './definitions.js';
import { spawnEnemy } from './enemy-system.js';
import { enemyBaseLevelForState, waveIntervalForBase } from './enemy-scaling.js';
import { chunkForWorldPoint } from '../roads/world-chunk-grid.js';

export const INITIAL_BASE_TYPES = Object.freeze(['barracks', 'engineer', 'raider', 'motor']);

function deterministicIndex(text, length) {
  let hash = 2166136261;
  for (const character of text) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return length ? (hash >>> 0) % length : 0;
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

export function waveForBase(state, base) {
  const definition = ENEMY_BASE_DEFINITIONS[base.type];
  if (!definition) return [];
  const wave = levelWave(definition, base);
  if (definition.isResourceBase) return wave;

  const mix = enemyGenerationMix(state);
  if (mix.generation <= 0 || wave.length === 0) return wave;
  const current = ENEMY_GENERATIONS[mix.generation] ?? [];
  const previous = Object.entries(ENEMY_GENERATIONS)
    .filter(([generation]) => Number(generation) > 0 && Number(generation) < mix.generation)
    .flatMap(([, values]) => values);
  if (mix.probability <= 0 && previous.length === 0) return wave;
  const replacementSlots = base.level >= 4 ? 2 : 1;
  for (let index = 0; index < Math.min(replacementSlots, wave.length); index += 1) {
    const roll = deterministicIndex(`${base.id}:${base.wavesSent}:${index}:roll`, 1000) / 1000;
    const pool = current.length && roll < mix.probability ? current : previous;
    if (!pool.length) continue;
    const type = pool[deterministicIndex(`${base.id}:${base.wavesSent}:${index}:type`, pool.length)];
    wave[wave.length - 1 - index] = type;
  }
  return wave;
}

function distancesFrom(graph, startId) {
  const distances = new Map([[startId, 0]]);
  const queue = [{ id: startId, distance: 0 }];
  const visited = new Set();
  while (queue.length) {
    queue.sort((a, b) => a.distance - b.distance);
    const current = queue.shift();
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    for (const connection of graph.adjacency.get(current.id) ?? []) {
      const candidate = current.distance + connection.length;
      if (candidate >= (distances.get(connection.to) ?? Infinity)) continue;
      distances.set(connection.to, candidate);
      queue.push({ id: connection.to, distance: candidate });
    }
  }
  return distances;
}

function resourceBaseTypes(level) {
  if (level >= 3) return ['copperCamp', 'tinCamp', 'ironCamp', 'bronzeCamp', 'siegeWorks'];
  if (level >= 2) return ['copperCamp', 'tinCamp'];
  return [];
}

export function unlockedBaseTypes(state) {
  return [...INITIAL_BASE_TYPES, ...resourceBaseTypes(state.civilization.level ?? 0)];
}

function chooseBaseNode(state, type, sourceNodeId = null) {
  const graph = state.world.roadGraph;
  const definition = ENEMY_BASE_DEFINITIONS[type];
  const distances = distancesFrom(graph, state.world.city.nodeId);
  const sourceNode = sourceNodeId ? graph.nodeById.get(sourceNodeId) : null;
  const occupiedNodes = new Set([
    state.world.city.nodeId,
    ...state.world.enemyBases.filter(base => base.alive).map(base => base.nodeId),
    ...state.world.outposts.filter(outpost => outpost.status === 'ACTIVE').map(outpost => outpost.nodeId)
  ]);
  const occupiedPoints = [...occupiedNodes].map(id => graph.nodeById.get(id)).filter(Boolean);
  const target = (definition.range[0] + definition.range[1]) / 2;
  const physicallyObservedChunks = new Set(state.world.roadChunks?.playerObserved ?? state.world.roadChunks?.loaded ?? []);
  const candidates = graph.nodes
    .filter(node => physicallyObservedChunks.size === 0 || physicallyObservedChunks.has(chunkForWorldPoint(node, state.world.roadChunks?.sizeMeters).id))
    .filter(node => !occupiedNodes.has(node.id) && (graph.adjacency.get(node.id)?.length ?? 0) >= 2)
    .filter(node => !sourceNode || Math.hypot(node.x - sourceNode.x, node.y - sourceNode.y) >= 150)
    .filter(node => occupiedPoints.every(point => Math.hypot(node.x - point.x, node.y - point.y) >= 100))
    .map(node => ({ node, route: distances.get(node.id) ?? Infinity }))
    .filter(item => Number.isFinite(item.route));
  const inRange = candidates.filter(item => item.route >= definition.range[0] && item.route <= definition.range[1]);
  const pool = inRange.length ? inRange : candidates.filter(item => item.route >= 120);
  return pool.sort((a, b) => Math.abs(a.route - target) - Math.abs(b.route - target))[0] ?? null;
}

function createBase(type, placement, idSeed = placement.node.id) {
  const definition = ENEMY_BASE_DEFINITIONS[type];
  return {
    id: stableId('enemy_base', type, idSeed), type, nodeId: placement.node.id,
    hp: definition.isResourceBase ? 120 : 100,
    maxHp: definition.isResourceBase ? 120 : 100,
    alive: true,
    level: 1, ageSeconds: 0,
    spawnClock: Math.max(0, definition.interval - definition.firstDelay),
    wavesSent: 0, routeDistance: placement.route
  };
}

export class WaveSystem {
  constructor(events) { this.events = events; }

  spawnWave(state, base, guard = false) {
    const wave = waveForBase(state, base);
    state.combat.waves.active ??= {};
    const waveId = stableId('wave', base.id, base.wavesSent, state.runtime?.worldTimeMs ?? Date.now());
    let spawned = 0;
    wave.forEach((type, index) => { if (spawnEnemy(state, base, type, index * (guard ? 3 : 8), waveId)) spawned += 1; });
    if (spawned > 0) {
      state.combat.waves.active[waveId] = { id: waveId, baseId: base.id, remaining: spawned, breached: false, startedAt: state.runtime?.worldTimeMs ?? Date.now() };
      this.events?.emit('combat:wave-launched', { baseId: base.id, waveId, count: spawned, guard, level: base.level ?? 1 });
    }
    if (!guard) {
      base.wavesSent += 1;
      this.events?.emit('message', { text: `${ENEMY_BASE_DEFINITIONS[base.type].name} Lv.${base.level ?? 1}から敵部隊が出撃しました。` });
    }
  }

  ensureUnlockedBases(state) {
    state.world.baseRespawns ??= [];
    const pendingTypes = new Set(state.world.baseRespawns.map(item => item.baseType));
    for (const type of unlockedBaseTypes(state)) {
      const exists = state.world.enemyBases.some(base => base.type === type && base.alive);
      if (exists || pendingTypes.has(type)) continue;
      const placement = chooseBaseNode(state, type);
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
      const placement = chooseBaseNode(state, respawn.baseType, respawn.sourceNodeId);
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
    if (state.combat.waves.resourceBaseCheckClock >= 30) {
      state.combat.waves.resourceBaseCheckClock = 0;
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
      const interval = waveIntervalForBase(definition, base.level, state.world.city.hp);
      while (base.spawnClock >= interval) {
        base.spawnClock -= interval;
        this.spawnWave(state, base);
      }
    }
  }
}
