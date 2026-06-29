import { distance, stableId } from '../core/utilities.js';
import { ENEMY_BASE_DEFINITIONS } from '../combat/definitions.js';
import { addBundle, bundleText } from '../civilization/inventory-system.js';

export const RECOVERY_RANGE_METERS = 40;
export const RECOVERY_LOCATION_MAX_AGE_MS = 60_000;
export const RECOVERY_MAX_ACCURACY_METERS = 100;
export const RECOVERY_COLLECTION_DURATION_SECONDS = 5;
export const SQUAD_RECOVERY_COLLECTION_DURATION_SECONDS = 8;

export const RECOVERY_ITEM_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  CARRIED: 'CARRIED',
  COLLECTED: 'COLLECTED'
});

export const ARTIFACT_DEFINITIONS = Object.freeze({
  commandSeal: { name: 'Enemy Command Auth Key', description: 'Authentication key used by the enemy command chain.' },
  mechanismCore: { name: 'Siege Mechanism Core', description: 'Control core for engineer equipment and siege devices.' },
  cipherModule: { name: 'Encrypted Comms Module', description: 'Stores encrypted communications between enemy bases.' },
  armorCore: { name: 'Armor Control Core', description: 'Core component containing armored unit manufacturing and maintenance data.' },
  surveyCore: { name: 'Resource Survey Data', description: 'Regional resource data accumulated by mining bases.' },
  siegeArchive: { name: 'Siege Operation Archive', description: 'Operational records for siege weapons and invasion routes.' }
});

const ARTIFACT_BY_BASE_TYPE = Object.freeze({
  barracks: 'commandSeal', engineer: 'mechanismCore', raider: 'cipherModule', motor: 'armorCore',
  copperCamp: 'surveyCore', tinCamp: 'surveyCore', ironCamp: 'surveyCore', bronzeCamp: 'mechanismCore', siegeWorks: 'siegeArchive'
});
const VALID_STATUS = new Set(Object.values(RECOVERY_ITEM_STATUS));
const VISIBLE_MAP_STATUSES = new Set([RECOVERY_ITEM_STATUS.AVAILABLE, RECOVERY_ITEM_STATUS.RESERVED, RECOVERY_ITEM_STATUS.CARRIED]);

export function isRecoveryItemVisible(item) {
  return Boolean(item && VISIBLE_MAP_STATUSES.has(item.status));
}

export function recoveryItemStatusPresentation(item) {
  switch (item?.status) {
    case RECOVERY_ITEM_STATUS.RESERVED:
      return { label: 'Recovery squad en route', shortLabel: 'EN ROUTE', detail: 'Remains at the destroyed point until the recovery squad arrives.' };
    case RECOVERY_ITEM_STATUS.CARRIED:
      return { label: 'Carrying', shortLabel: 'CARRIED', detail: 'The recovery squad is carrying the item back. Resources and achievements are applied after arrival at base.' };
    case RECOVERY_ITEM_STATUS.AVAILABLE:
      return { label: 'Uncollected', shortLabel: 'READY', detail: 'Can be collected on site or by dispatching a recovery squad.' };
    default:
      return { label: 'Recovered', shortLabel: 'DONE', detail: 'This recovery item has already been processed.' };
  }
}

export function recoveryItemPoint(state, item) {
  if (Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y))) return { x: Number(item.x), y: Number(item.y) };
  return state.world.roadGraph?.nodeById?.get(item?.nodeId) ?? item ?? null;
}

export function ensureRecoveryState(state) {
  state.world.recoveryItems = (Array.isArray(state.world.recoveryItems) ? state.world.recoveryItems : [])
    .filter(item => item?.status !== RECOVERY_ITEM_STATUS.COLLECTED);
  state.civilization.artifacts = state.civilization.artifacts && typeof state.civilization.artifacts === 'object' ? state.civilization.artifacts : {};
  state.civilization.totalArtifactsRecovered = Math.max(0, Number(state.civilization.totalArtifactsRecovered) || 0);
  const activeSquadIds = new Set((state.combat?.friendlySquads ?? []).filter(squad => squad?.id).map(squad => squad.id));
  for (const item of state.world.recoveryItems) {
    item.status = VALID_STATUS.has(item.status) ? item.status : RECOVERY_ITEM_STATUS.AVAILABLE;
    item.artifactType = ARTIFACT_DEFINITIONS[item.artifactType] ? item.artifactType : 'commandSeal';
    item.amount = Math.max(1, Number(item.amount) || 1);
    item.loot = item.loot && typeof item.loot === 'object' ? Object.fromEntries(Object.entries(item.loot).filter(([, amount]) => Number(amount) > 0).map(([resource, amount]) => [resource, Math.floor(Number(amount))])) : {};
    item.assignedSquadId = item.assignedSquadId ?? null;
    if ([RECOVERY_ITEM_STATUS.RESERVED, RECOVERY_ITEM_STATUS.CARRIED].includes(item.status) && (!item.assignedSquadId || !activeSquadIds.has(item.assignedSquadId))) {
      item.status = RECOVERY_ITEM_STATUS.AVAILABLE;
      item.assignedSquadId = null;
    }
  }
  const active = state.world.recoveryCollection;
  const activeItem = active && state.world.recoveryItems.find(item => item.id === active.itemId && item.status === RECOVERY_ITEM_STATUS.AVAILABLE);
  if (!activeItem) state.world.recoveryCollection = null;
  else {
    active.progressSec = Math.max(0, Math.min(RECOVERY_COLLECTION_DURATION_SECONDS, Number(active.progressSec) || 0));
    active.startedAt = Number(active.startedAt) || 0;
  }
  return state.world.recoveryItems;
}

export function artifactForBaseType(baseType) { return ARTIFACT_BY_BASE_TYPE[baseType] ?? 'commandSeal'; }

export function createBaseRecoveryItem(state, base, loot = null) {
  ensureRecoveryState(state);
  if (state.world.recoveryItems.some(item => item.sourceBaseId === base.id)) return null;
  const node = state.world.roadGraph?.nodeById?.get(base.nodeId);
  if (!node) return null;
  const artifactType = artifactForBaseType(base.type);
  const item = {
    id: stableId('recovery', base.id, artifactType), sourceBaseId: base.id, sourceBaseType: base.type,
    nodeId: base.nodeId, x: node.x, y: node.y, artifactType, amount: 1, loot: { ...(loot ?? ENEMY_BASE_DEFINITIONS[base.type]?.reward ?? {}) },
    status: RECOVERY_ITEM_STATUS.AVAILABLE, assignedSquadId: null,
    droppedAt: state.runtime?.worldTimeMs ?? Date.now()
  };
  state.world.recoveryItems.push(item);
  return item;
}

export function recoveryItemPresentation(item) {
  const artifact = ARTIFACT_DEFINITIONS[item?.artifactType] ?? ARTIFACT_DEFINITIONS.commandSeal;
  const loot = item?.loot && typeof item.loot === 'object' ? item.loot : {};
  return { name: artifact.name, description: artifact.description, sourceName: ENEMY_BASE_DEFINITIONS[item?.sourceBaseType]?.name ?? 'Enemy base', loot, lootText: Object.keys(loot).length ? bundleText(loot) : 'None' };
}

export function reserveRecoveryItem(state, itemId, squadId) {
  const item = (state.world?.recoveryItems ?? []).find(value => value.id === itemId);
  if (!item || item.status !== RECOVERY_ITEM_STATUS.AVAILABLE) return { ok: false, reason: 'This recovery item is not currently available.' };
  if (state.world.recoveryCollection?.itemId === itemId) return { ok: false, reason: 'The player has already started on-site recovery.' };
  item.status = RECOVERY_ITEM_STATUS.RESERVED;
  item.assignedSquadId = squadId;
  return { ok: true, item };
}

export function markRecoveryItemCarried(state, itemId, squadId) {
  const item = (state.world?.recoveryItems ?? []).find(value => value.id === itemId);
  if (!item || item.assignedSquadId !== squadId || item.status !== RECOVERY_ITEM_STATUS.RESERVED) return { ok: false, reason: 'The recovery item reservation was lost.' };
  item.status = RECOVERY_ITEM_STATUS.CARRIED;
  item.pickedUpAt = state.runtime?.worldTimeMs ?? Date.now();
  return { ok: true, item };
}

export function releaseRecoveryItem(state, itemId, squadId, placement = null) {
  const item = (state.world?.recoveryItems ?? []).find(value => value.id === itemId);
  if (!item || (item.assignedSquadId && item.assignedSquadId !== squadId)) return { ok: false, reason: 'The recovery item cannot be released.' };
  item.status = RECOVERY_ITEM_STATUS.AVAILABLE;
  item.assignedSquadId = null;
  if (placement) {
    if (placement.nodeId) item.nodeId = placement.nodeId;
    if (Number.isFinite(Number(placement.x))) item.x = Number(placement.x);
    if (Number.isFinite(Number(placement.y))) item.y = Number(placement.y);
    item.droppedAt = state.runtime?.worldTimeMs ?? Date.now();
  }
  return { ok: true, item };
}

function awardRecoveryItem(state, item) {
  const index = (state.world?.recoveryItems ?? []).findIndex(value => value.id === item.id);
  if (index < 0) return { ok: false, reason: 'Recovery item not found.' };
  state.world.recoveryItems.splice(index, 1);
  item.status = RECOVERY_ITEM_STATUS.COLLECTED;
  item.assignedSquadId = null;
  item.collectedAt = state.runtime?.worldTimeMs ?? Date.now();
  state.civilization.artifacts[item.artifactType] = (state.civilization.artifacts[item.artifactType] ?? 0) + item.amount;
  state.civilization.totalArtifactsRecovered += item.amount;
  const lootResult = addBundle(state, item.loot ?? {});
  return { ok: true, item, artifactType: item.artifactType, amount: item.amount, loot: { ...(item.loot ?? {}) }, lootResult };
}

export function deliverRecoveryItem(state, itemId, squadId) {
  const item = (state.world?.recoveryItems ?? []).find(value => value.id === itemId);
  if (!item || item.status !== RECOVERY_ITEM_STATUS.CARRIED || item.assignedSquadId !== squadId) return { ok: false, reason: 'The squad is not carrying a recovery item.' };
  return awardRecoveryItem(state, item);
}

export function recoveryEligibility(state, item, now = Date.now()) {
  if (!item || item.status !== RECOVERY_ITEM_STATUS.AVAILABLE) return { ok: false, reason: 'This recovery item is being handled by a recovery squad or has already been collected.' };
  const player = state.player?.worldPosition;
  if (!player) return { ok: false, reason: 'Get a fresh location fix.' };
  const point = recoveryItemPoint(state, item);
  const gap = distance(player, point);
  if (gap > RECOVERY_RANGE_METERS) return { ok: false, reason: `Move within ${RECOVERY_RANGE_METERS} m of the recovery point.`, distance: gap };
  const updatedAt = Number(state.player?.locationUpdatedAt) || 0;
  if (!updatedAt || now - updatedAt > RECOVERY_LOCATION_MAX_AGE_MS) return { ok: false, reason: 'Location is too old for recovery. Refresh your current position.', distance: gap };
  const accuracy = Number(state.player?.locationAccuracy);
  if (Number.isFinite(accuracy) && accuracy > RECOVERY_MAX_ACCURACY_METERS) return { ok: false, reason: 'Location accuracy is insufficient.', distance: gap };
  return { ok: true, distance: gap };
}

export class RecoverySystem {
  constructor(events = null) { this.events = events; }

  beginCollection(state, itemId, now = Date.now()) {
    const item = (state.world?.recoveryItems ?? []).find(value => value.id === itemId);
    const eligibility = recoveryEligibility(state, item, now);
    if (!eligibility.ok) return eligibility;
    if (state.world.recoveryCollection?.itemId === itemId) return { ok: true, active: true, item };
    if (state.world.recoveryCollection) return { ok: false, reason: 'Cancel the other recovery operation before starting this one.' };
    state.world.recoveryCollection = { itemId, progressSec: 0, startedAt: state.runtime?.worldTimeMs ?? now };
    this.events?.emit('message', { text: `On-site recovery started. Hold position for ${RECOVERY_COLLECTION_DURATION_SECONDS} seconds.` });
    return { ok: true, active: true, item };
  }

  cancelCollection(state, reason = null) {
    if (!state.world.recoveryCollection) return false;
    state.world.recoveryCollection = null;
    if (reason) this.events?.emit('message', { text: `On-site recovery interrupted: ${reason}` });
    return true;
  }

  completeCollection(state, item) {
    state.world.recoveryCollection = null;
    const result = awardRecoveryItem(state, item);
    if (!result.ok) return result;
    const presentation = recoveryItemPresentation(item);
    this.events?.emit('exploration:recovery-collected', result);
    const lootText = Object.keys(result.loot ?? {}).length ? `resources: ${bundleText(result.loot)}.` : '';
    this.events?.emit('message', { text: `${presentation.name} recovered on site.${lootText}` });
    return result;
  }

  update(state, deltaSeconds, now = Date.now()) {
    const active = state.world.recoveryCollection;
    if (!active) return null;
    const item = state.world.recoveryItems.find(value => value.id === active.itemId);
    const eligibility = recoveryEligibility(state, item, now);
    if (!eligibility.ok) {
      this.cancelCollection(state, eligibility.reason);
      return { ok: false, cancelled: true, reason: eligibility.reason };
    }
    active.progressSec = Math.min(RECOVERY_COLLECTION_DURATION_SECONDS, active.progressSec + Math.max(0, Number(deltaSeconds) || 0));
    if (active.progressSec < RECOVERY_COLLECTION_DURATION_SECONDS) return { ok: true, active: true, progressSec: active.progressSec };
    return this.completeCollection(state, item);
  }
}
