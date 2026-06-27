import { RESOURCE_LABELS, RESOURCE_KEYS } from '../civilization/data.js';
import { addBundle, bundleText } from '../civilization/inventory-system.js';
import { distance, distanceSquared, stableId } from '../core/utilities.js';
import { chunkForWorldPoint, neighboringChunks } from '../roads/world-chunk-grid.js';
import { findFriendlyRoadPath } from '../combat/routing-system.js';
import { emergencyWithdrawFriendlySquadById, emergencyWithdrawFriendlySquadNear, boostFriendlySquadById, boostFriendlySquadsNear } from '../combat/friendly-force-system.js';
import { damageEnemy, enemyPosition } from '../combat/enemy-system.js';
import { destroyEnemyBase } from '../combat/enemy-base-system.js';
import { friendlySquadRuntimeDefinition, friendlySquadUnlocked } from '../combat/friendly-force-definitions.js';
import { activePlayerBases } from '../base/player-bases.js';

export const ROADSIDE_SUPPLY_VERSION = 1;
export const ROADSIDE_SUPPLY_COLLECT_RANGE_METERS = 28;
export const ROADSIDE_SUPPLY_LOCATION_MAX_AGE_MS = 60_000;
export const ROADSIDE_SUPPLY_MAX_ACCURACY_METERS = 100;
export const ROADSIDE_SUPPLY_REFRESH_SECONDS = 10;
export const ROADSIDE_SUPPLY_ACTIVE_LIMIT = 32;
export const ROADSIDE_SUPPLY_REFRESH_MOVE_METERS = 45;
export const ROADSIDE_SUPPLY_COLLECT_CHECK_SECONDS = 0.75;
export const ROADSIDE_MINE_CHECK_SECONDS = 0.75;

export const ROADSIDE_INVENTORY_KEYS = Object.freeze({
  assaultCall: 'assaultCall',
  skirmisherCall: 'skirmisherCall',
  siegeCall: 'siegeCall',
  sweepSignal: 'sweepSignal',
  breachCharge: 'breachCharge',
  roadMine: 'roadMine',
  lureSignal: 'lureSignal',
  marchBanner: 'marchBanner',
  smokeScreen: 'smokeScreen'
});

export const ROADSIDE_USE_DEFINITIONS = Object.freeze({
  assaultCall: Object.freeze({ name: '突撃出撃札', squadType: 'assault', targetKind: 'enemyBase', searchRangeMeters: 850 }),
  skirmisherCall: Object.freeze({ name: '遊撃出撃札', squadType: 'skirmisher', targetKind: 'enemy', searchRangeMeters: 650 }),
  siegeCall: Object.freeze({ name: '攻城出撃札', squadType: 'siege', targetKind: 'enemyBase', searchRangeMeters: 700 }),
  sweepSignal: Object.freeze({ name: '掃討信号弾', radiusMeters: 70 }),
  breachCharge: Object.freeze({ name: '破城爆薬', radiusMeters: 45 }),
  roadMine: Object.freeze({ name: '路上地雷', radiusMeters: 34, triggerRadiusMeters: 22, durationSeconds: 1200, maxPlaced: 3 }),
  lureSignal: Object.freeze({ name: '誘導信号弾', radiusMeters: 220, durationSeconds: 75 }),
  marchBanner: Object.freeze({ name: '行軍加速旗', radiusMeters: 120, durationSeconds: 120, speedMultiplier: 0.20 }),
  smokeScreen: Object.freeze({ name: '緊急撤退煙幕', radiusMeters: 120 })
});

const RESOURCE_TIERS = Object.freeze([
  Object.freeze({ minLevel: 0, rarity: 'common', supplies: [
    Object.freeze({ type: 'wood_crate', name: '木材箱', bundle: { wood: 18 } }),
    Object.freeze({ type: 'stone_sack', name: '石材袋', bundle: { stone: 14 } }),
    Object.freeze({ type: 'fiber_bundle', name: '繊維束', bundle: { fiber: 14 } })
  ] }),
  Object.freeze({ minLevel: 1, rarity: 'uncommon', supplies: [
    Object.freeze({ type: 'timber_box', name: '加工木材箱', bundle: { timber: 2 } }),
    Object.freeze({ type: 'rope_bundle', name: '縄束', bundle: { rope: 2 } }),
    Object.freeze({ type: 'cutstone_box', name: '切石箱', bundle: { cutStone: 2 } }),
    Object.freeze({ type: 'charcoal_bag', name: '木炭袋', bundle: { charcoal: 4 } })
  ] }),
  Object.freeze({ minLevel: 2, rarity: 'rare', supplies: [
    Object.freeze({ type: 'copper_ore_box', name: '銅鉱石箱', bundle: { copperOre: 3 } }),
    Object.freeze({ type: 'tin_ore_box', name: '錫鉱石箱', bundle: { tinOre: 2 } })
  ] }),
  Object.freeze({ minLevel: 3, rarity: 'rare', supplies: [
    Object.freeze({ type: 'iron_ore_box', name: '鉄鉱石箱', bundle: { ironOre: 2 } }),
    Object.freeze({ type: 'bronze_box', name: '青銅塊箱', bundle: { bronzeIngot: 1 } })
  ] }),
  Object.freeze({ minLevel: 4, rarity: 'epic', supplies: [Object.freeze({ type: 'wrought_iron_box', name: '鍛鉄箱', bundle: { wroughtIron: 1 } })] }),
  Object.freeze({ minLevel: 5, rarity: 'epic', supplies: [Object.freeze({ type: 'steel_box', name: '鋼材箱', bundle: { steel: 1 } })] }),
  Object.freeze({ minLevel: 6, rarity: 'epic', supplies: [Object.freeze({ type: 'mechanism_box', name: '機構部品箱', bundle: { mechanism: 1 } })] })
]);

const TACTICAL_SUPPLIES = Object.freeze([
  Object.freeze({ minLevel: 0, rollMin: 0.935, inventoryKey: 'assaultCall', name: '突撃出撃札', rarity: 'uncommon' }),
  Object.freeze({ minLevel: 1, rollMin: 0.956, inventoryKey: 'skirmisherCall', name: '遊撃出撃札', rarity: 'rare' }),
  Object.freeze({ minLevel: 1, rollMin: 0.968, inventoryKey: 'marchBanner', name: '行軍加速旗', rarity: 'rare' }),
  Object.freeze({ minLevel: 2, rollMin: 0.973, inventoryKey: 'sweepSignal', name: '掃討信号弾', rarity: 'rare' }),
  Object.freeze({ minLevel: 2, rollMin: 0.980, inventoryKey: 'roadMine', name: '路上地雷', rarity: 'rare' }),
  Object.freeze({ minLevel: 2, rollMin: 0.985, inventoryKey: 'siegeCall', name: '攻城出撃札', rarity: 'epic' }),
  Object.freeze({ minLevel: 3, rollMin: 0.990, inventoryKey: 'lureSignal', name: '誘導信号弾', rarity: 'epic' }),
  Object.freeze({ minLevel: 3, rollMin: 0.993, inventoryKey: 'smokeScreen', name: '緊急撤退煙幕', rarity: 'epic' }),
  Object.freeze({ minLevel: 3, rollMin: 0.996, inventoryKey: 'breachCharge', name: '破城爆薬', rarity: 'epic' })
]);

const RARITY_ORDER = Object.freeze({ common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 });
const DAY_MS = 86_400_000;

function hashUnit(...parts) {
  const text = parts.join('|');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function positiveHash(...parts) {
  return Math.floor(hashUnit(...parts) * 0xffffffff) >>> 0;
}

function dailyEpoch(nowMs) {
  return Math.floor((Number(nowMs) || Date.now()) / DAY_MS);
}

function finitePoint(point) {
  return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
}

function sanitizeBundle(bundle) {
  const result = {};
  for (const [key, amount] of Object.entries(bundle ?? {})) {
    if (!RESOURCE_KEYS.includes(key)) continue;
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (value > 0) result[key] = value;
  }
  return result;
}

function inventoryDefaults() {
  return Object.fromEntries(Object.values(ROADSIDE_INVENTORY_KEYS).map(key => [key, 0]));
}

export function ensureRoadsideSupplyState(state) {
  state.world.roadsideSupplies = state.world.roadsideSupplies && typeof state.world.roadsideSupplies === 'object'
    ? state.world.roadsideSupplies
    : {};
  const supplies = state.world.roadsideSupplies;
  supplies.version = ROADSIDE_SUPPLY_VERSION;
  supplies.collectedIds = Array.isArray(supplies.collectedIds) ? supplies.collectedIds.map(String).slice(-2400) : [];
  supplies.active = Array.isArray(supplies.active) ? supplies.active.filter(item => item && item.id).slice(0, ROADSIDE_SUPPLY_ACTIVE_LIMIT) : [];
  supplies.lastRefreshPoint = finitePoint(supplies.lastRefreshPoint) ? { x: Number(supplies.lastRefreshPoint.x), y: Number(supplies.lastRefreshPoint.y) } : null;
  supplies.placedMines = Array.isArray(supplies.placedMines) ? supplies.placedMines.filter(item => item && item.id && finitePoint(item)).slice(-8) : [];
  supplies.inventory = { ...inventoryDefaults(), ...(supplies.inventory && typeof supplies.inventory === 'object' ? supplies.inventory : {}) };
  for (const key of Object.values(ROADSIDE_INVENTORY_KEYS)) supplies.inventory[key] = Math.max(0, Math.floor(Number(supplies.inventory[key]) || 0));
  const epoch = String(dailyEpoch(state.runtime?.worldTimeMs ?? Date.now()));
  supplies.daily = supplies.daily && typeof supplies.daily === 'object' ? supplies.daily : {};
  if (String(supplies.daily.epoch ?? '') !== epoch) {
    supplies.daily = { epoch, collectedCount: 0, rareCollectedCount: 0, generatedAt: 0 };
  }
  supplies.daily.collectedCount = Math.max(0, Math.floor(Number(supplies.daily.collectedCount) || 0));
  supplies.daily.rareCollectedCount = Math.max(0, Math.floor(Number(supplies.daily.rareCollectedCount) || 0));
  supplies.nextRefreshAt = Math.max(0, Number(supplies.nextRefreshAt) || 0);
  supplies.nextCollectionCheckAt = Math.max(0, Number(supplies.nextCollectionCheckAt) || 0);
  supplies.nextMineCheckAt = Math.max(0, Number(supplies.nextMineCheckAt) || 0);
  return supplies;
}

export function roadsideSupplyPoint(_state, item) {
  if (finitePoint(item)) return { x: Number(item.x), y: Number(item.y) };
  return null;
}

export function roadsideSupplyPresentation(item) {
  if (!item) return { name: '補給物資', summary: '', kind: 'unknown' };
  if (item.kind === 'resource') {
    return { name: item.name ?? '資源箱', summary: bundleText(item.bundle ?? {}), kind: item.kind, rarity: item.rarity ?? 'common' };
  }
  const use = ROADSIDE_USE_DEFINITIONS[item.inventoryKey] ?? null;
  return { name: item.name ?? use?.name ?? '現地装備', summary: '消耗品インベントリへ追加', kind: item.kind, rarity: item.rarity ?? 'uncommon' };
}

function locationEligibility(state, { strict = false } = {}) {
  const player = state.player?.worldPosition;
  if (!finitePoint(player)) return { ok: false, reason: '現在地を取得してください。' };
  const updatedAt = Number(state.player?.locationUpdatedAt) || 0;
  const now = Date.now();
  if (!updatedAt || now - updatedAt > ROADSIDE_SUPPLY_LOCATION_MAX_AGE_MS) return { ok: false, reason: '位置情報が古いため使用できません。現在地を再取得してください。' };
  const accuracy = Number(state.player?.locationAccuracy);
  const maxAccuracy = strict ? 70 : ROADSIDE_SUPPLY_MAX_ACCURACY_METERS;
  if (Number.isFinite(accuracy) && accuracy > maxAccuracy) return { ok: false, reason: '位置情報の精度が不足しています。' };
  return { ok: true, player };
}

function nearestNode(state, point) {
  let best = null;
  for (const node of state.world?.roadGraph?.nodes ?? []) {
    const d2 = distanceSquared(node, point);
    if (!best || d2 < best.d2) best = { node, d2 };
  }
  return best?.node ?? null;
}

function resourceDefinitionForRoll(level, roll, seedParts) {
  const tiers = RESOURCE_TIERS.filter(tier => level >= tier.minLevel);
  const highTierBias = Math.min(0.28, level * 0.035);
  let pool = tiers[0]?.supplies ?? [];
  let rarity = tiers[0]?.rarity ?? 'common';
  if (tiers.length > 1 && roll > 0.74 - highTierBias) {
    const unlocked = tiers.slice(1);
    const tier = unlocked[Math.min(unlocked.length - 1, Math.floor(hashUnit(...seedParts, 'tier') * unlocked.length))];
    pool = tier.supplies;
    rarity = tier.rarity;
  }
  const selected = pool[Math.min(pool.length - 1, Math.floor(hashUnit(...seedParts, 'resource') * pool.length))];
  return { ...selected, bundle: sanitizeBundle(selected.bundle), rarity };
}

function tacticalDefinitionForRoll(level, roll) {
  return [...TACTICAL_SUPPLIES]
    .filter(item => level >= item.minLevel && roll >= item.rollMin)
    .sort((a, b) => b.rollMin - a.rollMin)[0] ?? null;
}

function supplyForEdge(state, edge, epoch, playerSeed) {
  if (!edge?.id || Number(edge.length) < 35) return null;
  const level = Math.max(0, Math.floor(Number(state.civilization?.level) || 0));
  const graph = state.world.roadGraph;
  const a = graph.nodeById?.get(edge.a);
  const b = graph.nodeById?.get(edge.b);
  if (!a || !b) return null;
  const edgeGeoKey = stableId(
    'roadside-edge',
    edge.id,
    edge.chunkIds?.join(',') ?? '',
    Math.round(a.x), Math.round(a.y),
    Math.round(b.x), Math.round(b.y)
  );
  const baseRoll = hashUnit('roadside', ROADSIDE_SUPPLY_VERSION, playerSeed, epoch, edgeGeoKey);
  const spawnThreshold = 0.78 - Math.min(0.10, level * 0.010);
  if (baseRoll < spawnThreshold) return null;
  const progress = 0.14 + hashUnit(edgeGeoKey, epoch, playerSeed, 'progress') * 0.72;
  const x = a.x + (b.x - a.x) * progress;
  const y = a.y + (b.y - a.y) * progress;
  const roll = hashUnit(edgeGeoKey, epoch, playerSeed, 'kind');
  const tactical = tacticalDefinitionForRoll(level, roll);
  const idSeed = [edgeGeoKey, epoch, playerSeed, tactical?.inventoryKey ?? 'resource'];
  if (tactical) {
    return {
      id: stableId('roadside', ...idSeed),
      kind: 'tactical', type: tactical.inventoryKey, inventoryKey: tactical.inventoryKey,
      name: tactical.name, rarity: tactical.rarity, x, y, edgeId: edge.id, edgeProgress: progress
    };
  }
  const resource = resourceDefinitionForRoll(level, roll, idSeed);
  return {
    id: stableId('roadside', ...idSeed),
    kind: 'resource', type: resource.type, name: resource.name, rarity: resource.rarity,
    bundle: resource.bundle, x, y, edgeId: edge.id, edgeProgress: progress
  };
}

function candidateEdgesNearPlayer(state, player) {
  const graph = state.world?.roadGraph;
  if (!graph?.edges?.length || !graph.nodeById) return [];
  const current = chunkForWorldPoint(player);
  const chunkIds = new Set(neighboringChunks(current, 2).map(chunk => chunk.id));
  const edges = [];
  for (const edge of graph.edges) {
    if (Array.isArray(edge.chunkIds) && !edge.chunkIds.some(id => chunkIds.has(String(id)))) continue;
    const a = graph.nodeById.get(edge.a);
    const b = graph.nodeById.get(edge.b);
    if (!a || !b) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (distanceSquared(mid, player) > 1300 * 1300) continue;
    edges.push(edge);
  }
  return edges;
}

function roadsideSector(item, player) {
  const angle = Math.atan2(Number(item.y) - Number(player.y), Number(item.x) - Number(player.x));
  return Math.floor((((angle + Math.PI) / (Math.PI * 2)) * 8) % 8);
}

function spacingForRoadsideItem(item, relaxed = false) {
  const rare = (RARITY_ORDER[item?.rarity] ?? 1) >= RARITY_ORDER.rare;
  if (relaxed) return rare ? 90 : 54;
  return rare ? 120 : 70;
}

function tooCloseToSelectedRoadsideItem(item, selected, relaxed = false) {
  const spacing = spacingForRoadsideItem(item, relaxed);
  const spacing2 = spacing * spacing;
  return selected.some(other => distanceSquared(item, other) < spacing2);
}

function selectDistributedRoadsideSupplies(candidates, player, limit = ROADSIDE_SUPPLY_ACTIVE_LIMIT) {
  const bands = [
    { min: 0, max: 260, limit: 6 },
    { min: 260, max: 680, limit: 12 },
    { min: 680, max: 1150, limit: Math.max(0, limit - 18) }
  ];
  const prepared = candidates.map(item => ({
    item,
    d2: distanceSquared(item, player),
    sector: roadsideSector(item, player),
    rarity: RARITY_ORDER[item.rarity] ?? 1
  })).sort((a, b) => a.d2 - b.d2 || b.rarity - a.rarity || a.item.id.localeCompare(b.item.id));
  const selected = [];
  const sectorCounts = new Map();
  const takeFromBand = (band, relaxed = false) => {
    let used = 0;
    const bandMin2 = band.min * band.min;
    const bandMax2 = band.max * band.max;
    const pool = prepared
      .filter(entry => !entry.selected && entry.d2 >= bandMin2 && entry.d2 < bandMax2)
      .sort((a, b) => (sectorCounts.get(a.sector) ?? 0) - (sectorCounts.get(b.sector) ?? 0)
        || a.d2 - b.d2
        || b.rarity - a.rarity
        || a.item.id.localeCompare(b.item.id));
    for (const entry of pool) {
      if (selected.length >= limit || used >= band.limit) break;
      const sectorCount = sectorCounts.get(entry.sector) ?? 0;
      if (!relaxed && sectorCount >= 5) continue;
      if (tooCloseToSelectedRoadsideItem(entry.item, selected, relaxed)) continue;
      entry.selected = true;
      selected.push(entry.item);
      sectorCounts.set(entry.sector, sectorCount + 1);
      used += 1;
    }
  };
  for (const band of bands) takeFromBand(band, false);
  for (const band of bands) {
    if (selected.length >= limit) break;
    takeFromBand({ ...band, limit: Math.max(0, band.limit - selected.length) + limit }, true);
  }
  if (selected.length < limit) {
    for (const entry of prepared) {
      if (selected.length >= limit) break;
      if (entry.selected) continue;
      entry.selected = true;
      selected.push(entry.item);
    }
  }
  return selected.slice(0, limit);
}

function needsRoadsideRefresh(supplies, player, nowMs, force) {
  if (force || !Array.isArray(supplies.active) || supplies.active.length === 0) return true;
  const last = supplies.lastRefreshPoint;
  const movedFar = !finitePoint(last) || distanceSquared(last, player) >= ROADSIDE_SUPPLY_REFRESH_MOVE_METERS ** 2;
  return movedFar || nowMs >= supplies.nextRefreshAt;
}

export function refreshRoadsideSupplies(state, force = false) {
  const supplies = ensureRoadsideSupplyState(state);
  const player = state.player?.worldPosition;
  const nowMs = state.runtime?.worldTimeMs ?? Date.now();
  if (!finitePoint(player) || !state.world?.roadGraph?.nodeById) {
    supplies.active = [];
    supplies.lastRefreshPoint = null;
    supplies.nextRefreshAt = nowMs + ROADSIDE_SUPPLY_REFRESH_SECONDS * 1000;
    return supplies.active;
  }
  if (!needsRoadsideRefresh(supplies, player, nowMs, force)) return supplies.active;
  supplies.nextRefreshAt = nowMs + ROADSIDE_SUPPLY_REFRESH_SECONDS * 1000;
  supplies.lastRefreshPoint = { x: Number(player.x), y: Number(player.y) };
  const epoch = dailyEpoch(nowMs);
  const playerSeed = state.world?.homeBase?.id ?? `${Math.round(state.world.roadGraph.center?.lat ?? 0)}:${Math.round(state.world.roadGraph.center?.lon ?? 0)}`;
  const collected = new Set(supplies.collectedIds);
  const candidates = [];
  for (const edge of candidateEdgesNearPlayer(state, player)) {
    const item = supplyForEdge(state, edge, epoch, playerSeed);
    if (!item || collected.has(item.id)) continue;
    if (distanceSquared(item, player) > 1150 * 1150) continue;
    candidates.push(item);
  }
  supplies.active = selectDistributedRoadsideSupplies(candidates, player, ROADSIDE_SUPPLY_ACTIVE_LIMIT);
  supplies.daily.generatedAt = nowMs;
  return supplies.active;
}

function rememberCollected(supplies, item) {
  supplies.collectedIds.push(String(item.id));
  if (supplies.collectedIds.length > 2400) supplies.collectedIds = supplies.collectedIds.slice(-2000);
  supplies.daily.collectedCount += 1;
  if ((RARITY_ORDER[item.rarity] ?? 1) >= RARITY_ORDER.rare) supplies.daily.rareCollectedCount += 1;
  supplies.active = supplies.active.filter(value => value.id !== item.id);
}

export function collectRoadsideSupply(state, item, events = null) {
  const supplies = ensureRoadsideSupplyState(state);
  if (!item || supplies.collectedIds.includes(String(item.id))) return { ok: false, reason: '既に回収済みです。' };
  rememberCollected(supplies, item);
  if (item.kind === 'resource') {
    const bundle = sanitizeBundle(item.bundle);
    addBundle(state, bundle);
    events?.emit('exploration:roadside-supply-collected', { item, bundle });
    events?.emit('message', { text: `${item.name ?? '資源箱'}を回収しました。資源：${bundleText(bundle)}。` });
    return { ok: true, item, bundle };
  }
  if (item.kind === 'tactical' && ROADSIDE_USE_DEFINITIONS[item.inventoryKey]) {
    supplies.inventory[item.inventoryKey] = (supplies.inventory[item.inventoryKey] ?? 0) + 1;
    events?.emit('exploration:roadside-supply-collected', { item, inventoryKey: item.inventoryKey });
    events?.emit('message', { text: `${item.name ?? ROADSIDE_USE_DEFINITIONS[item.inventoryKey].name}を取得しました。ITEMSから使用できます。` });
    return { ok: true, item, inventoryKey: item.inventoryKey };
  }
  return { ok: false, reason: '未対応の道端物資です。' };
}

export function collectNearbyRoadsideSupplies(state, events = null) {
  const eligibility = locationEligibility(state);
  if (!eligibility.ok) return [];
  const supplies = ensureRoadsideSupplyState(state);
  const collected = [];
  for (const item of [...(supplies.active ?? [])]) {
    if (distance(eligibility.player, item) > ROADSIDE_SUPPLY_COLLECT_RANGE_METERS) continue;
    const result = collectRoadsideSupply(state, item, events);
    if (result.ok) collected.push(result);
  }
  return collected;
}

function consumeInventory(state, key) {
  const supplies = ensureRoadsideSupplyState(state);
  if ((supplies.inventory[key] ?? 0) <= 0) return false;
  supplies.inventory[key] -= 1;
  return true;
}

function refundInventory(state, key) {
  const supplies = ensureRoadsideSupplyState(state);
  supplies.inventory[key] = (supplies.inventory[key] ?? 0) + 1;
}

export function useSweepSignal(state, events = null) {
  const eligibility = locationEligibility(state, { strict: true });
  if (!eligibility.ok) return eligibility;
  if (!consumeInventory(state, 'sweepSignal')) return { ok: false, reason: '掃討信号弾を所持していません。' };
  const radius = ROADSIDE_USE_DEFINITIONS.sweepSignal.radiusMeters;
  let killed = 0;
  for (const enemy of state.combat?.enemies ?? []) {
    if (enemy.hp <= 0 || enemy.departDelay > 0) continue;
    if (distanceSquared(enemyPosition(state, enemy), eligibility.player) > radius * radius) continue;
    if (damageEnemy(state, enemy, enemy.maxHp * 20 + 9999, events)) killed += 1;
  }
  state.combat.enemies = (state.combat.enemies ?? []).filter(enemy => enemy.hp > 0);
  events?.emit('exploration:roadside-item-used', { itemKey: 'sweepSignal', killed });
  events?.emit('message', { text: killed > 0 ? `掃討信号弾で周囲${radius}mの敵${killed}体を排除しました。` : `掃討信号弾を使用しましたが、周囲${radius}mに対象はいませんでした。` });
  return { ok: true, killed };
}

export function useBreachCharge(state, events = null) {
  const eligibility = locationEligibility(state, { strict: true });
  if (!eligibility.ok) return eligibility;
  if (!consumeInventory(state, 'breachCharge')) return { ok: false, reason: '破城爆薬を所持していません。' };
  const radius = ROADSIDE_USE_DEFINITIONS.breachCharge.radiusMeters;
  const graph = state.world?.roadGraph;
  const candidates = (state.world?.enemyBases ?? [])
    .filter(base => base.alive && base.hp > 0)
    .map(base => ({ base, point: graph?.nodeById?.get(base.nodeId) ?? base }))
    .filter(entry => finitePoint(entry.point) && distanceSquared(entry.point, eligibility.player) <= radius * radius)
    .sort((a, b) => distanceSquared(a.point, eligibility.player) - distanceSquared(b.point, eligibility.player));
  const target = candidates[0]?.base ?? null;
  if (!target) {
    refundInventory(state, 'breachCharge');
    return { ok: false, reason: `半径${radius}m以内に破壊可能な敵拠点がありません。` };
  }
  target.hp = 0;
  destroyEnemyBase(state, target, events, { roadsideItem: 'breachCharge' });
  events?.emit('exploration:roadside-item-used', { itemKey: 'breachCharge', baseId: target.id });
  events?.emit('message', { text: `破城爆薬で${target.name ?? '敵拠点'}を破壊しました。` });
  return { ok: true, base: target };
}

function nearestAttackTargetBase(state, player, rangeMeters) {
  const graph = state.world?.roadGraph;
  return (state.world?.enemyBases ?? [])
    .filter(base => base.alive && base.hp > 0)
    .map(base => ({ base, point: graph?.nodeById?.get(base.nodeId) ?? base }))
    .filter(entry => finitePoint(entry.point) && distanceSquared(entry.point, player) <= rangeMeters * rangeMeters)
    .sort((a, b) => distanceSquared(a.point, player) - distanceSquared(b.point, player))[0]?.base ?? null;
}

function nearestEnemyTarget(state, player, rangeMeters) {
  return (state.combat?.enemies ?? [])
    .filter(enemy => enemy.hp > 0 && enemy.departDelay <= 0)
    .map(enemy => ({ enemy, point: enemyPosition(state, enemy) }))
    .filter(entry => finitePoint(entry.point) && distanceSquared(entry.point, player) <= rangeMeters * rangeMeters)
    .sort((a, b) => distanceSquared(a.point, player) - distanceSquared(b.point, player))[0]?.enemy ?? null;
}

function temporaryActiveCount(state) {
  return (state.combat?.friendlySquads ?? []).filter(squad => squad.temporaryDeployment && squad.hp > 0 && !['RECOVERING', 'READY'].includes(squad.status)).length;
}

export function useLocalDeploymentCall(state, key, events = null) {
  const definition = ROADSIDE_USE_DEFINITIONS[key];
  if (!definition?.squadType) return { ok: false, reason: 'このアイテムは現地出撃に対応していません。' };
  const eligibility = locationEligibility(state, { strict: true });
  if (!eligibility.ok) return eligibility;
  if (temporaryActiveCount(state) >= 1) return { ok: false, reason: '現地出撃中の一時部隊が残っています。任務完了後に使用してください。' };
  if (!friendlySquadUnlocked(state, definition.squadType)) return { ok: false, reason: `${definition.name}は現在の文明レベルでは使用できません。` };
  if (!consumeInventory(state, key)) return { ok: false, reason: `${definition.name}を所持していません。` };

  const originNode = nearestNode(state, eligibility.player);
  if (!originNode) { refundInventory(state, key); return { ok: false, reason: '現在地周辺の道路ノードが見つかりません。' }; }
  const target = definition.targetKind === 'enemy'
    ? nearestEnemyTarget(state, eligibility.player, definition.searchRangeMeters)
    : nearestAttackTargetBase(state, eligibility.player, definition.searchRangeMeters);
  if (!target) {
    refundInventory(state, key);
    return { ok: false, reason: `現在地から${definition.searchRangeMeters}m以内に出撃対象がありません。` };
  }
  const targetNodeId = definition.targetKind === 'enemy'
    ? target.nodeId
    : target.nodeId;
  const path = findFriendlyRoadPath(state, originNode.id, targetNodeId);
  if (!path) { refundInventory(state, key); return { ok: false, reason: '現在地から対象へ接続する道路経路がありません。' }; }
  const runtime = friendlySquadRuntimeDefinition(state, definition.squadType);
  const fallbackBase = activePlayerBases(state)[0] ?? state.world?.homeBase ?? null;
  const squadId = stableId('local_squad', key, originNode.id, target.id, state.runtime?.worldTimeMs ?? Date.now(), positiveHash(key, target.id));
  const squad = {
    id: squadId,
    type: runtime.type,
    members: runtime.members,
    hp: runtime.hp,
    maxHp: runtime.hp,
    originBaseId: fallbackBase?.id ?? 'local',
    deployedAt: state.runtime?.worldTimeMs ?? Date.now(),
    missionType: definition.targetKind === 'enemy' ? 'INTERCEPT' : 'ATTACK',
    targetBaseId: definition.targetKind === 'enemy' ? null : target.id,
    missionTargetBaseId: definition.targetKind === 'enemy' ? null : target.id,
    targetEnemyId: definition.targetKind === 'enemy' ? target.id : null,
    targetRecoveryItemId: null,
    recoveryCollectionProgressSec: null,
    nodeId: originNode.id,
    path: { nodeIds: [...path.nodeIds], edgeIds: [...path.edgeIds], cost: path.cost, targetId: path.targetId ?? targetNodeId },
    pathIndex: 0,
    edgeId: path.edgeIds[0] ?? null,
    edgeProgress: 0,
    status: 'OUTBOUND',
    order: 'ADVANCE',
    commandDestinationNodeId: targetNodeId,
    travelHistoryNodeIds: [originNode.id],
    engagedEnemyId: null,
    combatCooldown: 0,
    departDelay: 0,
    formationId: null,
    formationTargetId: null,
    formationSpeed: null,
    formationSize: null,
    recoveryBaseId: fallbackBase?.id ?? null,
    recoveryStartedAt: null,
    reorganizationRemaining: 0,
    readyAt: null,
    temporaryDeployment: { itemKey: key, name: definition.name, createdAt: state.runtime?.worldTimeMs ?? Date.now() }
  };
  state.combat.friendlySquads.push(squad);
  events?.emit('friendly:squad-deployed', { squad, origin: { nodeId: originNode.id, name: '現在地' }, target, cost: {}, temporary: true });
  events?.emit('message', { text: `${definition.name}を使用し、現在地から${runtime.name}を一時出撃させました。` });
  return { ok: true, squad, target };
}


function placedMineLimitReached(state) {
  const supplies = ensureRoadsideSupplyState(state);
  const now = state.runtime?.worldTimeMs ?? Date.now();
  const duration = ROADSIDE_USE_DEFINITIONS.roadMine.durationSeconds * 1000;
  supplies.placedMines = (supplies.placedMines ?? []).filter(mine => now - (Number(mine.placedAt) || 0) <= duration);
  return supplies.placedMines.length >= ROADSIDE_USE_DEFINITIONS.roadMine.maxPlaced;
}

export function updateRoadsideMines(state, events = null) {
  const supplies = ensureRoadsideSupplyState(state);
  const now = state.runtime?.worldTimeMs ?? Date.now();
  const definition = ROADSIDE_USE_DEFINITIONS.roadMine;
  let detonated = 0;
  supplies.placedMines = (supplies.placedMines ?? []).filter(mine => {
    if (now - (Number(mine.placedAt) || 0) > definition.durationSeconds * 1000) return false;
    const triggerRadius2 = definition.triggerRadiusMeters ** 2;
    const triggered = (state.combat?.enemies ?? []).some(enemy => enemy.hp > 0 && enemy.departDelay <= 0 && distanceSquared(enemyPosition(state, enemy), mine) <= triggerRadius2);
    if (!triggered) return true;
    let hits = 0;
    for (const enemy of state.combat?.enemies ?? []) {
      if (enemy.hp <= 0 || enemy.departDelay > 0) continue;
      if (distanceSquared(enemyPosition(state, enemy), mine) > definition.radiusMeters ** 2) continue;
      if (damageEnemy(state, enemy, enemy.maxHp * 0.85 + 80, events)) hits += 1;
    }
    state.combat.enemies = (state.combat.enemies ?? []).filter(enemy => enemy.hp > 0);
    detonated += 1;
    events?.emit('exploration:roadside-mine-detonated', { mineId: mine.id, hits });
    events?.emit('message', { text: `路上地雷が起爆し、敵${hits}体に損害を与えました。` });
    return false;
  });
  return { detonated };
}

export function useRoadMine(state, events = null) {
  const eligibility = locationEligibility(state, { strict: true });
  if (!eligibility.ok) return eligibility;
  if (placedMineLimitReached(state)) return { ok: false, reason: `路上地雷は同時に${ROADSIDE_USE_DEFINITIONS.roadMine.maxPlaced}個までです。` };
  if (!consumeInventory(state, 'roadMine')) return { ok: false, reason: '路上地雷を所持していません。' };
  const originNode = nearestNode(state, eligibility.player);
  if (!originNode || distanceSquared(originNode, eligibility.player) > 70 * 70) {
    refundInventory(state, 'roadMine');
    return { ok: false, reason: '道路上または道路付近で使用してください。' };
  }
  const supplies = ensureRoadsideSupplyState(state);
  const now = state.runtime?.worldTimeMs ?? Date.now();
  const mine = { id: stableId('roadside-mine', originNode.id, now, positiveHash('mine', now)), x: originNode.x, y: originNode.y, nodeId: originNode.id, placedAt: now };
  supplies.placedMines.push(mine);
  events?.emit('exploration:roadside-item-used', { itemKey: 'roadMine', mineId: mine.id });
  events?.emit('message', { text: '現在地付近の道路に路上地雷を設置しました。敵が通過すると起爆します。' });
  return { ok: true, mine };
}

export function useLureSignal(state, events = null) {
  const eligibility = locationEligibility(state, { strict: true });
  if (!eligibility.ok) return eligibility;
  if (!consumeInventory(state, 'lureSignal')) return { ok: false, reason: '誘導信号弾を所持していません。' };
  const node = nearestNode(state, eligibility.player);
  if (!node) { refundInventory(state, 'lureSignal'); return { ok: false, reason: '現在地周辺の道路ノードが見つかりません。' }; }
  const definition = ROADSIDE_USE_DEFINITIONS.lureSignal;
  const now = state.runtime?.worldTimeMs ?? Date.now();
  let affected = 0;
  for (const enemy of state.combat?.enemies ?? []) {
    if (enemy.hp <= 0 || enemy.departDelay > 0) continue;
    if (distanceSquared(enemyPosition(state, enemy), eligibility.player) > definition.radiusMeters ** 2) continue;
    enemy.roadsideLureNodeId = node.id;
    enemy.roadsideLureUntil = now + definition.durationSeconds * 1000;
    enemy.targetDefenseId = null;
    enemy.targetFieldBaseId = null;
    enemy.targetPlayerBaseId = null;
    enemy.targetSquadId = null;
    enemy.path = null;
    enemy.edgeId = null;
    enemy.edgeProgress = 0;
    enemy.reroutePending = true;
    affected += 1;
  }
  events?.emit('exploration:roadside-item-used', { itemKey: 'lureSignal', affected });
  events?.emit('message', { text: affected ? `誘導信号弾で敵${affected}体を現在地周辺へ誘導しました。` : '誘導信号弾を使用しましたが、周囲に誘導対象の敵はいませんでした。' });
  return { ok: true, affected };
}


export function useMarchBannerOnSquad(state, squadId, events = null) {
  if (!consumeInventory(state, 'marchBanner')) return { ok: false, reason: '行軍加速旗を所持していません。' };
  const definition = ROADSIDE_USE_DEFINITIONS.marchBanner;
  const result = boostFriendlySquadById(state, squadId, definition.durationSeconds, definition.speedMultiplier, events);
  if (!result.ok) refundInventory(state, 'marchBanner');
  return result;
}

export function useSmokeScreenOnSquad(state, squadId, events = null) {
  if (!consumeInventory(state, 'smokeScreen')) return { ok: false, reason: '緊急撤退煙幕を所持していません。' };
  const result = emergencyWithdrawFriendlySquadById(state, squadId, events);
  if (!result.ok) refundInventory(state, 'smokeScreen');
  return result;
}

export function useMarchBanner(state, events = null) {
  const eligibility = locationEligibility(state, { strict: true });
  if (!eligibility.ok) return eligibility;
  if (!consumeInventory(state, 'marchBanner')) return { ok: false, reason: '行軍加速旗を所持していません。' };
  const definition = ROADSIDE_USE_DEFINITIONS.marchBanner;
  const result = boostFriendlySquadsNear(state, eligibility.player, definition.radiusMeters, definition.durationSeconds, definition.speedMultiplier, events);
  if (!result.ok) refundInventory(state, 'marchBanner');
  return result;
}

export function useSmokeScreen(state, events = null) {
  const eligibility = locationEligibility(state, { strict: true });
  if (!eligibility.ok) return eligibility;
  if (!consumeInventory(state, 'smokeScreen')) return { ok: false, reason: '緊急撤退煙幕を所持していません。' };
  const definition = ROADSIDE_USE_DEFINITIONS.smokeScreen;
  const result = emergencyWithdrawFriendlySquadNear(state, eligibility.player, definition.radiusMeters, events);
  if (!result.ok) refundInventory(state, 'smokeScreen');
  return result;
}

export class RoadsideSupplySystem {
  constructor(events = null) { this.events = events; }
  update(state, _deltaSeconds = 0) {
    const supplies = ensureRoadsideSupplyState(state);
    const now = state.runtime?.worldTimeMs ?? Date.now();
    refreshRoadsideSupplies(state);
    let collected = [];
    if (now >= supplies.nextCollectionCheckAt) {
      supplies.nextCollectionCheckAt = now + ROADSIDE_SUPPLY_COLLECT_CHECK_SECONDS * 1000;
      collected = collectNearbyRoadsideSupplies(state, this.events);
    }
    if ((supplies.placedMines?.length ?? 0) > 0 && now >= supplies.nextMineCheckAt) {
      supplies.nextMineCheckAt = now + ROADSIDE_MINE_CHECK_SECONDS * 1000;
      updateRoadsideMines(state, this.events);
    }
    return collected;
  }
  refresh(state, force = true) { return refreshRoadsideSupplies(state, force); }
  use(state, key) {
    if (key === 'sweepSignal') return useSweepSignal(state, this.events);
    if (key === 'breachCharge') return useBreachCharge(state, this.events);
    if (key === 'roadMine') return useRoadMine(state, this.events);
    if (key === 'lureSignal') return useLureSignal(state, this.events);
    if (key === 'marchBanner') return useMarchBanner(state, this.events);
    if (key === 'smokeScreen') return useSmokeScreen(state, this.events);
    return useLocalDeploymentCall(state, key, this.events);
  }
  useOnSquad(state, key, squadId) {
    if (key === 'marchBanner') return useMarchBannerOnSquad(state, squadId, this.events);
    if (key === 'smokeScreen') return useSmokeScreenOnSquad(state, squadId, this.events);
    return { ok: false, reason: 'このアイテムは選択部隊への使用に対応していません。' };
  }
}
