import { distance, stableId } from '../core/utilities.js';
import { ENEMY_BASE_DEFINITIONS } from '../combat/definitions.js';

export const RECOVERY_RANGE_METERS = 40;
export const RECOVERY_LOCATION_MAX_AGE_MS = 60_000;
export const RECOVERY_MAX_ACCURACY_METERS = 100;
export const RECOVERY_COLLECTION_DURATION_SECONDS = 5;

export const ARTIFACT_DEFINITIONS = Object.freeze({
  commandSeal: { name: '敵指揮認証鍵', description: '敵部隊の指揮系統に使われていた認証鍵です。' },
  mechanismCore: { name: '攻城機構コア', description: '工兵設備と攻城装置の制御中枢です。' },
  cipherModule: { name: '暗号通信モジュール', description: '敵拠点間の暗号通信を保持しています。' },
  armorCore: { name: '装甲制御コア', description: '装甲部隊の製造・整備情報を含む中枢部品です。' },
  surveyCore: { name: '資源調査データ', description: '採掘拠点が蓄積した地域資源データです。' },
  siegeArchive: { name: '攻城作戦記録', description: '攻城兵器と侵攻経路の作戦記録です。' }
});

const ARTIFACT_BY_BASE_TYPE = Object.freeze({
  barracks: 'commandSeal',
  engineer: 'mechanismCore',
  raider: 'cipherModule',
  motor: 'armorCore',
  copperCamp: 'surveyCore',
  tinCamp: 'surveyCore',
  ironCamp: 'surveyCore',
  bronzeCamp: 'mechanismCore',
  siegeWorks: 'siegeArchive'
});

export function ensureRecoveryState(state) {
  state.world.recoveryItems = (Array.isArray(state.world.recoveryItems) ? state.world.recoveryItems : [])
    .filter(item => item?.status !== 'COLLECTED');
  state.civilization.artifacts = state.civilization.artifacts && typeof state.civilization.artifacts === 'object'
    ? state.civilization.artifacts
    : {};
  state.civilization.totalArtifactsRecovered = Math.max(0, Number(state.civilization.totalArtifactsRecovered) || 0);
  for (const item of state.world.recoveryItems) {
    item.status = 'AVAILABLE';
    item.artifactType = ARTIFACT_DEFINITIONS[item.artifactType] ? item.artifactType : 'commandSeal';
    item.amount = Math.max(1, Number(item.amount) || 1);
  }
  const active = state.world.recoveryCollection;
  if (!active || !state.world.recoveryItems.some(item => item.id === active.itemId)) state.world.recoveryCollection = null;
  else {
    active.progressSec = Math.max(0, Math.min(RECOVERY_COLLECTION_DURATION_SECONDS, Number(active.progressSec) || 0));
    active.startedAt = Number(active.startedAt) || 0;
  }
  return state.world.recoveryItems;
}

export function artifactForBaseType(baseType) {
  return ARTIFACT_BY_BASE_TYPE[baseType] ?? 'commandSeal';
}

export function createBaseRecoveryItem(state, base) {
  ensureRecoveryState(state);
  if (state.world.recoveryItems.some(item => item.sourceBaseId === base.id)) return null;
  const node = state.world.roadGraph?.nodeById?.get(base.nodeId);
  if (!node) return null;
  const artifactType = artifactForBaseType(base.type);
  const item = {
    id: stableId('recovery', base.id, artifactType),
    sourceBaseId: base.id,
    sourceBaseType: base.type,
    nodeId: base.nodeId,
    x: node.x,
    y: node.y,
    artifactType,
    amount: 1,
    status: 'AVAILABLE',
    droppedAt: state.runtime?.worldTimeMs ?? Date.now()
  };
  state.world.recoveryItems.push(item);
  return item;
}

export function recoveryItemPresentation(item) {
  const artifact = ARTIFACT_DEFINITIONS[item?.artifactType] ?? ARTIFACT_DEFINITIONS.commandSeal;
  return {
    name: artifact.name,
    description: artifact.description,
    sourceName: ENEMY_BASE_DEFINITIONS[item?.sourceBaseType]?.name ?? '敵拠点'
  };
}

export function recoveryEligibility(state, item, now = Date.now()) {
  if (!item || item.status !== 'AVAILABLE') return { ok: false, reason: 'この回収物は既に取得済みです。' };
  const player = state.player?.worldPosition;
  if (!player) return { ok: false, reason: '最新の位置情報を取得してください。' };
  const itemPoint = state.world.roadGraph?.nodeById?.get(item.nodeId) ?? item;
  const gap = distance(player, itemPoint);
  if (gap > RECOVERY_RANGE_METERS) return { ok: false, reason: `回収地点の${RECOVERY_RANGE_METERS}m以内へ移動してください。`, distance: gap };
  const updatedAt = Number(state.player?.locationUpdatedAt) || 0;
  if (!updatedAt || now - updatedAt > RECOVERY_LOCATION_MAX_AGE_MS) return { ok: false, reason: '位置情報が古いため回収できません。現在地を再取得してください。', distance: gap };
  const accuracy = Number(state.player?.locationAccuracy);
  if (Number.isFinite(accuracy) && accuracy > RECOVERY_MAX_ACCURACY_METERS) return { ok: false, reason: '位置情報の精度が不足しています。', distance: gap };
  return { ok: true, distance: gap };
}

export class RecoverySystem {
  constructor(events = null) {
    this.events = events;
  }

  beginCollection(state, itemId, now = Date.now()) {
    const items = ensureRecoveryState(state);
    const item = items.find(value => value.id === itemId);
    const eligibility = recoveryEligibility(state, item, now);
    if (!eligibility.ok) return eligibility;
    if (state.world.recoveryCollection?.itemId === itemId) return { ok: true, active: true, item };
    if (state.world.recoveryCollection) return { ok: false, reason: '別の回収作業を中断してから開始してください。' };
    state.world.recoveryCollection = {
      itemId,
      progressSec: 0,
      startedAt: state.runtime?.worldTimeMs ?? now
    };
    this.events?.emit('message', { text: `現地回収を開始しました。${RECOVERY_COLLECTION_DURATION_SECONDS}秒間その場を維持してください。` });
    return { ok: true, active: true, item };
  }

  cancelCollection(state, reason = null) {
    if (!state.world.recoveryCollection) return false;
    state.world.recoveryCollection = null;
    if (reason) this.events?.emit('message', { text: `現地回収を中断しました：${reason}` });
    return true;
  }

  completeCollection(state, item) {
    const index = state.world.recoveryItems.findIndex(value => value.id === item.id);
    if (index < 0) return { ok: false, reason: '回収物が見つかりません。' };
    state.world.recoveryItems.splice(index, 1);
    state.world.recoveryCollection = null;
    item.status = 'COLLECTED';
    item.collectedAt = state.runtime?.worldTimeMs ?? Date.now();
    state.civilization.artifacts[item.artifactType] = (state.civilization.artifacts[item.artifactType] ?? 0) + item.amount;
    state.civilization.totalArtifactsRecovered += item.amount;
    const presentation = recoveryItemPresentation(item);
    this.events?.emit('exploration:recovery-collected', { item, artifactType: item.artifactType, amount: item.amount });
    this.events?.emit('message', { text: `${presentation.name}を現地回収しました。` });
    return { ok: true, item, artifactType: item.artifactType, amount: item.amount };
  }

  update(state, deltaSeconds, now = Date.now()) {
    ensureRecoveryState(state);
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
