import { distance, stableId } from '../core/utilities.js';
import { addBundle } from '../civilization/inventory-system.js';
import { ENEMY_DEFINITIONS, MAX_ENEMIES } from './definitions.js';
import { findCombatPath, findCombatPathToTargets } from './routing-system.js';

const FACILITY_ATTACK_RANGE_METERS = 20;
const FACILITY_PRIORITY_PENALTY_SECONDS = 18;

function stableRouteBias(text) {
  let hash = 2166136261;
  for (const character of String(text)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 0.86 + ((hash >>> 0) % 29) / 100;
}

export function enemyPosition(state, enemy) {
  const graph = state.world.roadGraph;
  if (!enemy.edgeId || !enemy.path) return graph.nodeById.get(enemy.nodeId) ?? { x: 0, y: 0 };
  const edge = graph.edgeById.get(enemy.edgeId);
  const fromId = enemy.path.nodeIds[enemy.pathIndex];
  const toId = enemy.path.nodeIds[enemy.pathIndex + 1];
  const from = graph.nodeById.get(fromId);
  const to = graph.nodeById.get(toId);
  if (!edge || !from || !to) return graph.nodeById.get(enemy.nodeId) ?? { x: 0, y: 0 };
  const t = Math.max(0, Math.min(1, enemy.edgeProgress / Math.max(1, edge.length)));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export function spawnEnemy(state, base, type, departDelay = 0, waveId = null) {
  if (state.combat.enemies.length >= MAX_ENEMIES) return null;
  const definition = ENEMY_DEFINITIONS[type];
  if (!definition) return null;
  const id = stableId('enemy', base.id, type, base.wavesSent, state.combat.enemies.length, state.runtime?.worldTimeMs ?? Date.now());
  const enemy = {
    id,
    type, hp: definition.hp, maxHp: definition.hp, nodeId: base.nodeId,
    path: null, pathIndex: 0, edgeId: null, edgeProgress: 0,
    slowTimer: 0, slowMultiplier: 0.52, attackClock: 0, departDelay,
    sourceBaseId: base.id, waveId, waveResolved: false, rewardGranted: false,
    reroutePending: false, routeBias: stableRouteBias(id), targetDefenseId: null, notifiedDefenseIds: []
  };
  state.combat.enemies.push(enemy);
  return enemy;
}

function activeTowerById(state, defenseId) {
  if (!defenseId) return null;
  return state.combat.defenses.find(defense =>
    defense.id === defenseId && defense.kind === 'tower' && defense.hp > 0 && !defense.ruined
  ) ?? null;
}

function facilityTargetCandidates(state, definition) {
  const priorities = definition.targetPriorities ?? [];
  if (!priorities.length) return [];
  const rankByType = new Map(priorities.map((type, index) => [type, index]));
  return state.combat.defenses
    .filter(defense => defense.kind === 'tower' && defense.hp > 0 && !defense.ruined && rankByType.has(defense.type))
    .map(defense => ({
      nodeId: defense.nodeId,
      targetObjectId: defense.id,
      priorityPenalty: rankByType.get(defense.type) * FACILITY_PRIORITY_PENALTY_SECONDS
    }));
}

function planPath(state, enemy) {
  const definition = ENEMY_DEFINITIONS[enemy.type] ?? ENEMY_DEFINITIONS.infantry;
  const targets = facilityTargetCandidates(state, definition);
  if (targets.length) {
    const facilityPath = findCombatPathToTargets(state, enemy.nodeId, targets, enemy.type, enemy.routeBias ?? 1);
    if (facilityPath) {
      enemy.targetDefenseId = facilityPath.targetObjectId;
      return facilityPath;
    }
  }
  enemy.targetDefenseId = null;
  return findCombatPath(state, enemy.nodeId, state.world.city.nodeId, enemy.type, null, enemy.routeBias ?? 1);
}

function ensurePath(state, enemy) {
  if (enemy.targetDefenseId && !activeTowerById(state, enemy.targetDefenseId)) {
    enemy.targetDefenseId = null;
    enemy.reroutePending = true;
  }
  const expectedTargetId = enemy.targetDefenseId
    ? activeTowerById(state, enemy.targetDefenseId)?.nodeId
    : state.world.city.nodeId;
  const currentPathValid = expectedTargetId && enemy.path?.targetId === expectedTargetId && enemy.pathIndex < enemy.path.edgeIds.length;
  if (currentPathValid && !enemy.reroutePending) return true;

  const currentEdgeLength = enemy.edgeId ? state.world.roadGraph.edgeById.get(enemy.edgeId)?.length ?? 0 : 0;
  if (enemy.path && enemy.edgeId && enemy.edgeProgress > 0 && enemy.edgeProgress < currentEdgeLength) {
    enemy.reroutePending = true;
    return true;
  }

  const path = planPath(state, enemy);
  enemy.path = path;
  enemy.pathIndex = 0;
  enemy.edgeId = path?.edgeIds[0] ?? null;
  enemy.edgeProgress = 0;
  enemy.reroutePending = false;
  return Boolean(path);
}

function invalidateDefenseTargetPaths(state, defenseId) {
  for (const enemy of state.combat.enemies) {
    if (enemy.targetDefenseId !== defenseId) continue;
    enemy.targetDefenseId = null;
    enemy.reroutePending = true;
  }
}

function attackTargetFacility(state, enemy, definition, deltaSeconds, events) {
  const target = activeTowerById(state, enemy.targetDefenseId);
  if (!target) return false;
  const node = state.world.roadGraph.nodeById.get(target.nodeId);
  if (!node || distance(enemyPosition(state, enemy), node) > FACILITY_ATTACK_RANGE_METERS) return false;

  enemy.notifiedDefenseIds ??= [];
  if (!enemy.notifiedDefenseIds.includes(target.id)) {
    enemy.notifiedDefenseIds.push(target.id);
    if ((definition.stunSeconds ?? 0) > 0) {
      target.disabledTimer = Math.max(target.disabledTimer ?? 0, definition.stunSeconds);
    }
    events?.emit('message', { text: definition.attackMessage ?? `${definition.name}が防衛施設を攻撃しています。` });
  }

  target.hp -= Math.max(0.1, definition.facilityDps ?? definition.barrierDps ?? 1) * deltaSeconds;
  if (target.hp > 0) return true;

  target.hp = 0;
  target.ruined = true;
  invalidateDefenseTargetPaths(state, target.id);
  events?.emit('combat:defense-destroyed', { defenseId: target.id, position: node });
  events?.emit('message', { text: `${target.type === 'relay' ? '修復中継所' : '防衛施設'}が敵の集中攻撃で破壊されました。` });
  return true;
}

function resolveWaveEnemy(state, enemy, breached) {
  if (!enemy.waveId || enemy.waveResolved) return;
  enemy.waveResolved = true;
  const record = state.combat.waves.active?.[enemy.waveId];
  if (!record) return;
  record.remaining = Math.max(0, record.remaining - 1);
  if (breached) record.breached = true;
  if (record.remaining > 0) return;
  if (record.breached) state.civilization.progress.perfectWaveStreak = 0;
  else state.civilization.progress.perfectWaveStreak = (state.civilization.progress.perfectWaveStreak ?? 0) + 1;
  delete state.combat.waves.active[enemy.waveId];
}

export function damageEnemy(state, enemy, amount, events = null, spatial = null) {
  if (enemy.hp <= 0 || enemy.rewardGranted) return false;
  if (!(ENEMY_DEFINITIONS[enemy.type]?.shieldAura > 0)) {
    const position = spatial?.positions?.get(enemy.id) ?? enemyPosition(state, enemy);
    const shieldCandidates = spatial ? spatial.query(position, 14) : state.combat.enemies.map(other => ({ enemy: other, position: enemyPosition(state, other) }));
    const protectedByShield = shieldCandidates.some(entry => {
      const other = entry.enemy;
      return other !== enemy && other.hp > 0 && (ENEMY_DEFINITIONS[other.type]?.shieldAura > 0) && distance(entry.position, position) <= 14;
    });
    if (protectedByShield) amount *= 0.7;
  }
  enemy.hp -= amount;
  if (enemy.hp > 0) return false;
  enemy.hp = 0;
  enemy.rewardGranted = true;
  const definition = ENEMY_DEFINITIONS[enemy.type];
  let drops = { ...(definition.drops ?? {}) };
  const sourceBase = state.world.enemyBases.find(base => base.id === enemy.sourceBaseId);
  if (['miner', 'oreCarrier'].includes(enemy.type)) {
    if (sourceBase?.type === 'tinCamp') drops = { stone: drops.stone ?? 2, tinOre: Math.max(1, drops.tinOre ?? 1) };
    if (sourceBase?.type === 'ironCamp') drops = { stone: drops.stone ?? 2, ironOre: Math.max(1, drops.ironOre ?? 1) };
  }
  addBundle(state, drops);
  resolveWaveEnemy(state, enemy, false);
  state.statistics.kills += 1;
  if (enemy.type === 'siegeCaptain') {
    state.civilization.progress.bossesDefeated.siegeCaptain = (state.civilization.progress.bossesDefeated.siegeCaptain ?? 0) + 1;
  }
  events?.emit('combat:enemy-killed', { enemyId: enemy.id, position: enemyPosition(state, enemy), type: enemy.type, drops });
  return true;
}

export class EnemySystem {
  constructor(events) { this.events = events; }

  invalidateAllPaths(state) {
    for (const enemy of state.combat.enemies) enemy.reroutePending = true;
  }

  updateEnemy(state, enemy, deltaSeconds, frame) {
    if (enemy.departDelay > 0) {
      enemy.departDelay = Math.max(0, enemy.departDelay - deltaSeconds);
      return false;
    }
    enemy.slowTimer = Math.max(0, enemy.slowTimer - deltaSeconds);
    const definition = ENEMY_DEFINITIONS[enemy.type] ?? ENEMY_DEFINITIONS.infantry;

    if (attackTargetFacility(state, enemy, definition, deltaSeconds, this.events)) return false;
    if (!ensurePath(state, enemy) || !enemy.edgeId) return false;

    const graph = state.world.roadGraph;
    const edge = graph.edgeById.get(enemy.edgeId);
    if (!edge) { enemy.path = null; return false; }

    const barrier = frame.barriers.get(edge.id) ?? null;
    const barrierPosition = edge.length * 0.5;
    if (barrier && enemy.edgeProgress >= barrierPosition - 1 && enemy.edgeProgress <= barrierPosition + 2) {
      enemy.attackClock += deltaSeconds;
      if (enemy.attackClock >= 0.5) {
        enemy.attackClock = 0;
        barrier.hp -= definition.barrierDps * 0.5;
        if (barrier.hp <= 0) {
          barrier.hp = 0;
          barrier.ruined = true;
          this.invalidateAllPaths(state);
          const a = graph.nodeById.get(edge.a);
          const b = graph.nodeById.get(edge.b);
          this.events?.emit('combat:defense-destroyed', { defenseId: barrier.id, position: a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null });
          this.events?.emit('message', { text: '防壁が破壊され、敵の流れが変わりました。' });
        }
      }
      return false;
    }

    let commanderMultiplier = 1;
    if (enemy.type !== 'commander') {
      const position = frame.spatial.positions.get(enemy.id) ?? enemyPosition(state, enemy);
      const commanded = frame.spatial.commanders.some(entry => entry.enemy.hp > 0 && distance(entry.position, position) <= 35);
      if (commanded) commanderMultiplier = 1 + (ENEMY_DEFINITIONS.commander.commanderAura ?? 0);
    }
    const slowBase = enemy.slowMultiplier ?? 0.52;
    const slowMultiplier = enemy.slowTimer > 0
      ? 1 - (1 - slowBase) * (1 - (definition.slowResistance ?? 0))
      : 1;
    enemy.edgeProgress += definition.speed * commanderMultiplier * slowMultiplier * deltaSeconds;

    if (enemy.edgeProgress < edge.length) return false;
    enemy.nodeId = enemy.path.nodeIds[enemy.pathIndex + 1];
    enemy.pathIndex += 1;
    enemy.edgeProgress = 0;

    if (enemy.reroutePending && enemy.nodeId !== enemy.path.targetId) {
      enemy.path = null;
      enemy.pathIndex = 0;
      enemy.edgeId = null;
      enemy.reroutePending = false;
      return false;
    }

    if (enemy.nodeId === enemy.path.targetId && enemy.path.targetId === state.world.city.nodeId) {
      state.world.city.hp = Math.max(0, state.world.city.hp - definition.cityDamage);
      if ((definition.settlementDamage ?? 0) > 0) {
        state.combat.pendingSettlementDamage ??= [];
        state.combat.pendingSettlementDamage.push({ enemyId: enemy.id, enemyType: enemy.type, damage: definition.settlementDamage });
      }
      resolveWaveEnemy(state, enemy, true);
      this.events?.emit('combat:city-hit', { damage: definition.cityDamage, enemyId: enemy.id });
      return true;
    }

    if (enemy.pathIndex >= enemy.path.edgeIds.length) {
      enemy.edgeId = null;
      return false;
    }
    enemy.edgeId = enemy.path.edgeIds[enemy.pathIndex];
    return false;
  }

  update(state, deltaSeconds, spatial = null) {
    if (!spatial) {
      const positions = new Map();
      const commanders = [];
      const entries = [];
      for (const enemy of state.combat.enemies) {
        if (enemy.hp <= 0 || enemy.departDelay > 0) continue;
        const position = enemyPosition(state, enemy);
        const entry = { enemy, position };
        positions.set(enemy.id, position);
        entries.push(entry);
        if (enemy.type === 'commander') commanders.push(entry);
      }
      spatial = {
        positions,
        commanders,
        query(point, range) {
          const limit = range * range;
          return entries.filter(entry => {
            const dx = entry.position.x - point.x;
            const dy = entry.position.y - point.y;
            return dx * dx + dy * dy <= limit;
          });
        }
      };
    }
    const barriers = new Map();
    for (const defense of state.combat.defenses) {
      if (defense.kind === 'barrier' && defense.hp > 0 && !defense.ruined) barriers.set(defense.edgeId, defense);
    }
    const frame = { spatial, barriers };
    const remove = new Set();
    for (const enemy of state.combat.enemies) {
      if (enemy.hp <= 0 || this.updateEnemy(state, enemy, deltaSeconds, frame)) remove.add(enemy.id);
    }
    if (remove.size > 0) state.combat.enemies = state.combat.enemies.filter(enemy => !remove.has(enemy.id) && enemy.hp > 0);
  }
}
