import { ensureFieldBaseState } from './field-bases.js';
import { ensurePlayerBaseState } from './player-bases.js';

export const CIVILIZATION_PRESSURE_RAMP_SECONDS = 24 * 60 * 60;
export const OFFLINE_POST_CIV_PROTECTION_SECONDS = 24 * 60 * 60;

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

export function purgeOwnedTerritoryAfterCheckmate(state, when = nowMs(state)) {
  if (!state?.world) return { primary: null, removedPlayerBases: [], removedFieldBases: [], removedDefenseCount: 0 };
  state.world.playerBases = Array.isArray(state.world.playerBases) ? state.world.playerBases : [];
  state.world.fieldBases = Array.isArray(state.world.fieldBases) ? state.world.fieldBases : [];
  const primary = state.world.playerBases.find(base => base.primary) ?? state.world.playerBases[0] ?? null;
  const removedPlayerBases = state.world.playerBases.map(base => ({ ...removedBaseSnapshot(base), kind: base.primary ? 'PRIMARY' : 'MAJOR', removedAt: when }));
  const removedFieldBases = state.world.fieldBases.map(base => ({ ...removedBaseSnapshot(base), kind: 'FIELD', removedAt: when }));
  const removedDefenseCount = Array.isArray(state.combat?.defenses) ? state.combat.defenses.length : 0;
  state.world.playerBases = [];
  state.world.fieldBases = [];
  state.world.homeBase = null;
  if (state.world.city) {
    state.world.city.hp = 0;
    if (primary?.nodeId) state.world.city.nodeId = primary.nodeId;
    if (primary?.maxHp) state.world.city.maxHp = primary.maxHp;
  }
  state.combat ??= {};
  state.combat.defenses = [];
  state.combat.friendlySquads = [];
  state.combat.pendingSettlementDamage = [];
  return { primary, removedPlayerBases, removedFieldBases, removedDefenseCount };
}

export function collapsePlayerTerritory(state, events = null, { enemyId = null, cause = 'primary-base-destroyed' } = {}) {
  if (!state?.world) return { ok: false, reason: 'state is missing world' };
  state.runtime ??= {};
  state.combat ??= {};
  const when = nowMs(state);
  ensurePlayerBaseState(state);
  ensureFieldBaseState(state);
  const { primary, removedPlayerBases, removedFieldBases, removedDefenseCount } = purgeOwnedTerritoryAfterCheckmate(state, when);
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
  events?.emit('message', { text: '本拠地が破壊されました。所有していた主要拠点・簡易拠点・防衛施設はすべて撤去されました。' });
  return { ok: true, primaryBase: primary, destroyedCount, removedDefenseCount };
}

export function clearPlayerCheckmate(state) {
  if (state?.combat?.playerCheckmate) state.combat.playerCheckmate.active = false;
}
