import { DEFENSE_LINES, RESOURCE_OUTPOSTS, defenseLineForType } from './data.js';
import { addBundle, consumeBundle, missingBundle } from './inventory-system.js';

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
    for (const outpost of state.world.outposts) {
      const resourceDefinition = RESOURCE_OUTPOSTS[outpost.sourceBaseType];
      outpost.resource ??= resourceDefinition?.resource ?? null;
      outpost.amount = Math.max(0, Number(outpost.amount) || resourceDefinition?.amount || 0);
      outpost.intervalSec = Math.max(0, Number(outpost.intervalSec) || resourceDefinition?.intervalSec || 0);
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
