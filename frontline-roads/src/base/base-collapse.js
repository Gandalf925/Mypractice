import { ensureFieldBaseState } from './field-bases.js';
import { ensurePlayerBaseState } from './player-bases.js';
import { roadUnitPosition } from '../combat/road-unit-position.js';
import { RECOVERY_ITEM_STATUS, recoveryItemPoint, releaseRecoveryItem } from '../exploration/recovery-system.js';
import { RECOVERY_BALANCE, applyCityDefeatRecovery, beginEnemyRegroup } from '../core/recovery-balance.js';

export const CIVILIZATION_PRESSURE_RAMP_SECONDS = 24 * 60 * 60;
export const OFFLINE_POST_CIV_PROTECTION_SECONDS = 24 * 60 * 60;
export const PLAYER_DEFEAT_RECOVERY_GRACE_SECONDS = 30 * 60;
export const PLAYER_DEFEAT_RECOVERY_MIN_HP_RATIO = 0.50;

function nowMs(state) {
  return Number(state?.runtime?.worldTimeMs) || Date.now();
}

function completedAtMs(state) {
  const completedAt = Math.max(0, Number(state?.civilization?.completedAt) || 0);
  if (completedAt > 0) return completedAt;
  const graceUntil = Math.max(0, Number(state?.civilization?.gracePeriodUntil) || 0);
  return graceUntil > 0 ? graceUntil : 0;
}

export function civilizationPressureRampRatio(state) {
  const level = Math.max(0, Math.floor(Number(state?.civilization?.level) || 0));
  if (level <= 0) return 1;
  const completedAt = completedAtMs(state);
  if (!completedAt) return 1;
  const graceUntil = Math.max(0, Number(state?.civilization?.gracePeriodUntil) || 0);
  const start = Math.max(completedAt, graceUntil);
  const elapsed = Math.max(0, nowMs(state) - start) / 1000;
  return Math.max(0, Math.min(1, elapsed / CIVILIZATION_PRESSURE_RAMP_SECONDS));
}

export function effectivePressureCivilizationLevel(state) {
  const level = Math.max(0, Math.min(7, Math.floor(Number(state?.civilization?.level) || 0)));
  if (level <= 0) return 0;
  const ratio = civilizationPressureRampRatio(state);
  if (ratio >= 1) return level;
  return Math.max(0, level - 1 + ratio);
}

export function isOfflinePostCivilizationProtectionActive(state) {
  if (!state?.runtime?.offlineSimulationActive) return false;
  const level = Math.max(0, Math.floor(Number(state?.civilization?.level) || 0));
  if (level <= 0) return false;
  const completedAt = completedAtMs(state);
  if (!completedAt) return false;
  const elapsedSeconds = Math.max(0, nowMs(state) - completedAt) / 1000;
  return elapsedSeconds <= OFFLINE_POST_CIV_PROTECTION_SECONDS;
}

function protectionFloorRatio(kind) {
  if (kind === 'primary') return 0.35;
  if (kind === 'major') return 0.25;
  if (kind === 'field') return 0.25;
  return 0;
}

export function applyProtectedSettlementDamage(state, settlement, damage, kind = 'major') {
  const amount = Math.max(0, Number(damage) || 0);
  if (!settlement || amount <= 0) return { damage: 0, blockedByProtection: false, floorHp: 0 };
  const before = Math.max(0, Number(settlement.hp) || 0);
  const maxHp = Math.max(1, Number(settlement.maxHp) || before || 1);
  const floorRatio = isOfflinePostCivilizationProtectionActive(state) ? protectionFloorRatio(kind) : 0;
  const floorHp = floorRatio > 0 ? Math.max(1, Math.round(maxHp * floorRatio)) : 0;
  const rawNext = Math.max(0, before - amount);
  const protectedNext = floorHp > 0 && before > floorHp && rawNext < floorHp ? floorHp : rawNext;
  settlement.hp = protectedNext;
  return {
    damage: Math.max(0, before - protectedNext),
    blockedByProtection: floorHp > 0 && rawNext < floorHp && protectedNext >= floorHp,
    floorHp
  };
}

export function isPlayerCheckmateActive(state) {
  return Boolean(state?.combat?.playerCheckmate?.active);
}

function removedBaseSnapshot(base) {
  if (!base) return null;
  return { id: base.id, name: base.name, kind: base.kind ?? (base.primary ? 'PRIMARY' : 'MAJOR'), primary: Boolean(base.primary), nodeId: base.nodeId, x: base.x, y: base.y, hp: 0, maxHp: base.maxHp, removedAt: null };
}


function finite(value) {
  return Number.isFinite(Number(value));
}

function recoveryPrimarySource(state) {
  const bases = Array.isArray(state?.world?.playerBases) ? state.world.playerBases : [];
  const fromWorld = bases.find(base => base?.primary) ?? bases[0] ?? null;
  const removed = state?.combat?.playerCheckmate?.removedPlayerBases;
  const fromRemoved = Array.isArray(removed)
    ? (removed.find(base => base?.primary || base?.kind === 'PRIMARY') ?? removed[0] ?? null)
    : null;
  return fromWorld ?? fromRemoved ?? state?.world?.homeBase ?? null;
}

export function homeBaseRecoveryRuin(state, when = nowMs(state)) {
  const source = recoveryPrimarySource(state);
  const nodeId = source?.nodeId ?? state?.world?.city?.nodeId ?? null;
  const node = nodeId ? state?.world?.roadGraph?.nodeById?.get?.(nodeId) : null;
  if (!source && !node) return null;
  const maxHp = Math.max(1, Number(source?.maxHp ?? state?.world?.city?.maxHp) || 100);
  const x = finite(source?.x) ? Number(source.x) : finite(node?.x) ? Number(node.x) : 0;
  const y = finite(source?.y) ? Number(source.y) : finite(node?.y) ? Number(node.y) : 0;
  return {
    ...(source ?? {}),
    id: source?.id || `home_base:${nodeId ?? 'recovery'}`,
    name: source?.name || 'Home Base',
    kind: 'PRIMARY',
    primary: true,
    status: 'DESTROYED',
    nodeId,
    x,
    y,
    hp: 0,
    maxHp,
    destroyedAt: Number(source?.destroyedAt) || when,
    collapsedAt: when,
    recoveryMode: true
  };
}

export function ensureHomeBaseRecoveryState(state, when = nowMs(state)) {
  if (!state?.world) return null;
  state.world.playerBases = Array.isArray(state.world.playerBases) ? state.world.playerBases : [];
  const ruin = homeBaseRecoveryRuin(state, when);
  if (!ruin) return null;
  const remainingMajor = state.world.playerBases.filter(base => base?.id && base.id !== ruin.id && !base.primary);
  state.world.playerBases = [ruin, ...remainingMajor.filter(base => base.status === 'DESTROYED' && base.hp <= 0)];
  state.world.homeBase = { ...ruin, primary: undefined };
  state.world.city ??= { nodeId: ruin.nodeId, hp: 0, maxHp: ruin.maxHp };
  state.world.city.nodeId = ruin.nodeId;
  state.world.city.maxHp = Math.max(1, Number(state.world.city.maxHp) || ruin.maxHp);
  state.world.city.hp = 0;
  return ruin;
}

export function previewHomeBaseRecovery(state) {
  const active = Boolean(state?.combat?.playerCheckmate?.active) || Number(state?.world?.city?.hp) <= 0;
  if (!active) return { ok: false, reason: 'Home base recovery is not required.' };
  const ruin = homeBaseRecoveryRuin(state);
  if (!ruin?.nodeId) return { ok: false, reason: 'Home base ruins could not be located.' };
  const opening = Math.max(0, Math.floor(Number(state?.civilization?.level) || 0)) <= 1;
  const mode = opening ? 'opening' : 'standard';
  const ratio = Math.max(PLAYER_DEFEAT_RECOVERY_MIN_HP_RATIO, Number(RECOVERY_BALANCE.cityRecoveryHpRatio?.[mode]) || PLAYER_DEFEAT_RECOVERY_MIN_HP_RATIO);
  const maxHp = Math.max(1, Number(ruin.maxHp) || Number(state?.world?.city?.maxHp) || 100);
  return {
    ok: true,
    base: ruin,
    mode,
    hp: Math.max(1, Math.round(maxHp * ratio)),
    maxHp,
    cost: RECOVERY_BALANCE.cityDefeatCost?.[mode] ?? {},
    graceSeconds: PLAYER_DEFEAT_RECOVERY_GRACE_SECONDS
  };
}

export function restoreHomeBaseAfterDefeat(state, events = null) {
  state.combat ??= {};
  const preview = previewHomeBaseRecovery(state);
  if (!preview.ok) return preview;
  const when = nowMs(state);
  const ruin = ensureHomeBaseRecoveryState(state, when);
  if (!ruin) return { ok: false, reason: 'Home base ruins could not be located.' };
  const recovery = applyCityDefeatRecovery(state, preview.mode === 'opening');
  const hp = Math.max(preview.hp, Number(recovery.hp) || 0);
  ruin.status = 'ESTABLISHED';
  ruin.hp = Math.min(preview.maxHp, Math.max(1, Math.round(hp)));
  ruin.maxHp = preview.maxHp;
  ruin.recoveryMode = false;
  ruin.rebuiltAt = when;
  ruin.recoveredAt = when;
  state.world.playerBases = [ruin];
  state.world.homeBase = { ...ruin, primary: undefined };
  state.world.city = { nodeId: ruin.nodeId, hp: ruin.hp, maxHp: ruin.maxHp };
  state.combat.playerCheckmate = {
    ...(state.combat.playerCheckmate ?? {}),
    active: false,
    recoveredAt: when,
    recoveryHp: ruin.hp
  };
  state.combat.enemies = [];
  state.combat.pendingSettlementDamage = [];
  state.combat.waves ??= { active: {}, resourceBaseCheckClock: 30 };
  state.combat.waves.active = {};
  state.combat.waves.resourceBaseCheckClock = 30;
  state.combat.waves.enemyBaseNetworkDirty = true;
  const regroupUntil = beginEnemyRegroup(state, PLAYER_DEFEAT_RECOVERY_GRACE_SECONDS);
  state.combat.defeatRecoveryGraceUntil = regroupUntil;
  for (const enemyBase of state.world?.enemyBases ?? []) {
    if (enemyBase?.alive) enemyBase.spawnClock = Math.min(Number(enemyBase.spawnClock) || 0, 0);
  }
  events?.emit('base:home-recovered', { baseId: ruin.id, hp: ruin.hp, maxHp: ruin.maxHp, graceSeconds: PLAYER_DEFEAT_RECOVERY_GRACE_SECONDS, position: { x: ruin.x, y: ruin.y } });
  events?.emit('message', { text: 'Emergency recovery complete. The home base is back online with a temporary enemy regroup grace period.' });
  return { ok: true, base: ruin, hp: ruin.hp, maxHp: ruin.maxHp, graceSeconds: PLAYER_DEFEAT_RECOVERY_GRACE_SECONDS, recovery };
}

function releaseFriendlyRecoveryItemsBeforePurge(state, events = null) {
  let releasedCount = 0;
  for (const squad of state.combat?.friendlySquads ?? []) {
    const itemId = squad?.targetRecoveryItemId;
    if (!itemId) continue;
    const item = (state.world?.recoveryItems ?? []).find(value => value.id === itemId && (!value.assignedSquadId || value.assignedSquadId === squad.id));
    if (!item) continue;
    const placement = item.status === RECOVERY_ITEM_STATUS.CARRIED
      ? (() => {
          const point = roadUnitPosition(state, squad);
          const edge = squad.edgeId ? state.world?.roadGraph?.edgeById?.get(squad.edgeId) : null;
          return { nodeId: edge ? (squad.edgeProgress <= edge.length / 2 ? edge.a : edge.b) : squad.nodeId, x: point.x, y: point.y };
        })()
      : null;
    const released = releaseRecoveryItem(state, item.id, squad.id, placement);
    if (released.ok) {
      releasedCount += 1;
      events?.emit('friendly:recovery-item-dropped', { squadId: squad.id, itemId: item.id, position: recoveryItemPoint(state, released.item) });
    }
    squad.targetRecoveryItemId = null;
    squad.recoveryCollectionProgressSec = null;
  }
  if (releasedCount > 0) events?.emit('message', { text: 'Home base was lost. Recovery items carried by squads were dropped back onto the road.' });
  return releasedCount;
}

export function purgeOwnedTerritoryAfterCheckmate(state, when = nowMs(state), events = null) {
  if (!state?.world) return { primary: null, removedPlayerBases: [], removedFieldBases: [], removedDefenseCount: 0 };
  state.world.playerBases = Array.isArray(state.world.playerBases) ? state.world.playerBases : [];
  state.world.fieldBases = Array.isArray(state.world.fieldBases) ? state.world.fieldBases : [];
  const primary = state.world.playerBases.find(base => base.primary) ?? state.world.playerBases[0] ?? recoveryPrimarySource(state);
  const existingRemovedPlayerBases = Array.isArray(state.combat?.playerCheckmate?.removedPlayerBases)
    ? state.combat.playerCheckmate.removedPlayerBases
    : [];
  const existingRemovedFieldBases = Array.isArray(state.combat?.playerCheckmate?.removedFieldBases)
    ? state.combat.playerCheckmate.removedFieldBases
    : [];
  const currentRemovedPlayerBases = state.world.playerBases.map(base => ({ ...removedBaseSnapshot(base), kind: base.primary ? 'PRIMARY' : 'MAJOR', removedAt: when }));
  const currentRemovedFieldBases = state.world.fieldBases.map(base => ({ ...removedBaseSnapshot(base), kind: 'FIELD', removedAt: when }));
  const removedPlayerBases = currentRemovedPlayerBases.length ? currentRemovedPlayerBases : existingRemovedPlayerBases;
  const removedFieldBases = currentRemovedFieldBases.length ? currentRemovedFieldBases : existingRemovedFieldBases;
  const removedDefenseCount = Math.max(
    Array.isArray(state.combat?.defenses) ? state.combat.defenses.length : 0,
    Number(state.combat?.playerCheckmate?.removedDefenseCount) || 0
  );
  releaseFriendlyRecoveryItemsBeforePurge(state, events);
  state.combat ??= {};
  state.combat.defenses = [];
  state.combat.friendlySquads = [];
  state.combat.pendingSettlementDamage = [];
  state.world.fieldBases = [];
  const ruin = ensureHomeBaseRecoveryState(state, when);
  return { primary: ruin ?? primary, removedPlayerBases, removedFieldBases, removedDefenseCount };
}

export function collapsePlayerTerritory(state, events = null, { enemyId = null, cause = 'primary-base-destroyed' } = {}) {
  if (!state?.world) return { ok: false, reason: 'state is missing world' };
  state.runtime ??= {};
  state.combat ??= {};
  const when = nowMs(state);
  ensurePlayerBaseState(state);
  ensureFieldBaseState(state);
  const { primary, removedPlayerBases, removedFieldBases, removedDefenseCount } = purgeOwnedTerritoryAfterCheckmate(state, when, events);
  const destroyedCount = removedPlayerBases.length + removedFieldBases.length;
  state.combat.playerCheckmate = {
    active: true,
    collapsedAt: when,
    enemyId,
    cause,
    removedPlayerBases,
    removedFieldBases,
    removedDefenseCount
  };
  state.combat.enemies = [];
  state.combat.waves ??= { active: {} };
  state.combat.waves.active = {};
  state.combat.waves.resourceBaseCheckClock = 30;
  state.combat.waves.enemyBaseNetworkDirty = false;
  for (const enemyBase of state.world.enemyBases ?? []) {
    if (enemyBase.alive) enemyBase.spawnClock = 0;
  }
  events?.emit('base:territory-collapsed', { primaryBaseId: primary?.id ?? null, enemyId, destroyedCount, removedDefenseCount, cause, position: primary ? { x: primary.x, y: primary.y } : null });
  events?.emit('combat:city-defeated', { checkmate: true, primaryBaseId: primary?.id ?? null, destroyedCount, removedDefenseCount, enemyId, cause });
  events?.emit('message', { text: 'Home base destroyed. Recovery mode started. Restore the home base from BASES.' });
  return { ok: true, primaryBase: primary, destroyedCount, removedDefenseCount };
}

export function clearPlayerCheckmate(state) {
  if (state?.combat?.playerCheckmate) state.combat.playerCheckmate.active = false;
}
