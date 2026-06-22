import { distance, stableId } from '../core/utilities.js';
import { ENEMY_BASE_CAPTURE_RANGE_METERS, ENEMY_BASE_DEFINITIONS } from '../combat/definitions.js';
import { DEFENSE_LINES, RESOURCE_OUTPOSTS, defenseLineForType } from './data.js';
import { addBundle, consumeBundle, missingBundle } from './inventory-system.js';

const OUTPOST_MAX_HP = 240;
const BASE_RESPAWN_MIN_SECONDS = 4 * 60 * 60;
const BASE_RESPAWN_MAX_SECONDS = 6 * 60 * 60;

function deterministicRespawnSeconds(baseId) {
  let hash = 2166136261;
  for (const character of String(baseId)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const span = BASE_RESPAWN_MAX_SECONDS - BASE_RESPAWN_MIN_SECONDS;
  return BASE_RESPAWN_MIN_SECONDS + ((hash >>> 0) % (span + 1));
}

function defaultOutpostDefenseKey(state) {
  const tier = Math.max(0, Math.min(4, state.civilization.level ?? 0));
  return DEFENSE_LINES.single[tier]?.key ?? DEFENSE_LINES.single[0].key;
}

function defenseByKey(key) {
  for (const line of Object.values(DEFENSE_LINES)) {
    if (!Array.isArray(line)) continue;
    const found = line.find(definition => definition?.key === key);
    if (found) return found;
  }
  return null;
}

export class OutpostSystem {
  constructor(events = null) {
    this.events = events;
  }

  beginCapture(state, baseId) {
    const base = state.world.enemyBases.find(item => item.id === baseId && item.alive);
    if (!base) return { ok: false, reason: '敵拠点が見つかりません。' };
    const node = state.world.roadGraph.nodeById.get(base.nodeId);
    const player = state.player.worldPosition;
    if (!player || !node || distance(player, node) > ENEMY_BASE_CAPTURE_RANGE_METERS) return { ok: false, reason: `敵拠点の${ENEMY_BASE_CAPTURE_RANGE_METERS}m以内へ移動してください。` };
    if (state.combat.enemies.some(enemy => enemy.hp > 0 && enemy.sourceBaseId === base.id)) {
      return { ok: false, reason: 'この拠点から出撃した敵を先に排除してください。' };
    }
    base.captureActive = true;
    base.captureProgress ??= 0;
    this.events?.emit('message', { text: '敵拠点の制圧を開始しました。範囲内に留まってください。' });
    return { ok: true, base };
  }

  completeCapture(state, base) {
    const definition = ENEMY_BASE_DEFINITIONS[base.type];
    const resourceDefinition = RESOURCE_OUTPOSTS[base.type];
    base.alive = false;
    base.captured = true;
    base.captureActive = false;
    base.captureProgress = definition?.captureDuration ?? base.captureProgress ?? 0;
    state.statistics.campsCaptured += 1;
    state.civilization.progress.campsCapturedByType[base.type] = (state.civilization.progress.campsCapturedByType[base.type] ?? 0) + 1;
    addBundle(state, definition?.reward ?? {});

    const outpost = {
      id: stableId('outpost', base.id, state.statistics.campsCaptured),
      nodeId: base.nodeId,
      sourceBaseId: base.id,
      sourceBaseType: base.type,
      status: 'RUINED',
      hp: 0,
      maxHp: OUTPOST_MAX_HP,
      defenseKey: null,
      productionClock: 0,
      resource: resourceDefinition?.resource ?? null,
      amount: resourceDefinition?.amount ?? 0,
      intervalSec: resourceDefinition?.intervalSec ?? 0,
      capturedAt: state.runtime?.worldTimeMs ?? Date.now(),
      restoredAt: null
    };
    state.world.outposts.push(outpost);
    state.world.baseRespawns ??= [];
    state.world.baseRespawns.push({
      id: stableId('respawn', base.id, state.statistics.campsCaptured),
      baseType: base.type,
      sourceNodeId: base.nodeId,
      remainingSec: deterministicRespawnSeconds(base.id),
      attempts: 0
    });

    this.events?.emit('civilization:outpost-captured', { outpost, base });
    this.events?.emit('message', { text: `${definition?.name ?? '敵拠点'}を制圧しました。廃墟前哨地を修復できます。` });
    return outpost;
  }

  restoreCost(state, outpost, defenseKey = defaultOutpostDefenseKey(state)) {
    const definition = defenseByKey(defenseKey) ?? DEFENSE_LINES.single[0];
    const source = definition.cost ?? definition.upgrade ?? { wood: 30, stone: 20, fiber: 10 };
    return Object.fromEntries(Object.entries(source).map(([resource, amount]) => [resource, Math.max(1, Math.ceil(amount * 0.6))]));
  }

  restore(state, outpostId, defenseKey = defaultOutpostDefenseKey(state)) {
    const outpost = state.world.outposts.find(item => item.id === outpostId);
    if (!outpost || outpost.status !== 'RUINED') return { ok: false, reason: '修復できる廃墟前哨地ではありません。' };
    const cost = this.restoreCost(state, outpost, defenseKey);
    if (!consumeBundle(state, cost)) return { ok: false, reason: '資源が不足しています。', missing: missingBundle(state, cost) };
    outpost.status = 'ACTIVE';
    outpost.defenseKey = defenseKey;
    outpost.hp = outpost.maxHp;
    outpost.restoredAt = state.runtime?.worldTimeMs ?? Date.now();
    state.civilization.progress.simultaneousOutposts = Math.max(
      state.civilization.progress.simultaneousOutposts ?? 0,
      state.world.outposts.filter(item => item.status === 'ACTIVE').length
    );
    this.events?.emit('civilization:outpost-restored', { outpost, cost });
    this.events?.emit('message', { text: '前哨地を修復し、稼働を開始しました。' });
    return { ok: true, outpost, cost };
  }

  update(state, deltaSeconds) {
    for (const base of state.world.enemyBases) {
      if (!base.alive || !base.captureActive) continue;
      const node = state.world.roadGraph.nodeById.get(base.nodeId);
      const player = state.player.worldPosition;
      if (!player || !node || distance(player, node) > ENEMY_BASE_CAPTURE_RANGE_METERS) {
        base.captureActive = false;
        this.events?.emit('message', { text: '制圧範囲から離れたため、制圧を一時停止しました。' });
        continue;
      }
      if (state.combat.enemies.some(enemy => enemy.hp > 0 && enemy.sourceBaseId === base.id)) {
        base.captureActive = false;
        continue;
      }
      base.captureProgress = (base.captureProgress ?? 0) + deltaSeconds;
      if (base.captureProgress >= (ENEMY_BASE_DEFINITIONS[base.type]?.captureDuration ?? 60)) this.completeCapture(state, base);
    }

    for (const outpost of state.world.outposts) {
      if (outpost.status !== 'ACTIVE' || !outpost.resource || outpost.intervalSec <= 0) continue;
      outpost.productionClock = (outpost.productionClock ?? 0) + deltaSeconds;
      while (outpost.productionClock >= outpost.intervalSec) {
        outpost.productionClock -= outpost.intervalSec;
        addBundle(state, { [outpost.resource]: outpost.amount });
      }
    }
  }
}

export function outpostDefenseLine(outpost) {
  const definition = defenseByKey(outpost?.defenseKey);
  return definition?.type ? defenseLineForType(definition.type) : 'single';
}
