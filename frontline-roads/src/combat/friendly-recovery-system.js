import { ownedBaseById } from '../base/field-bases.js';
import { defenseRuntimeDefinition } from './definitions.js';

export const FRIENDLY_RECOVERY_STATUS = Object.freeze({
  RECOVERING: 'RECOVERING',
  READY: 'READY'
});

export const FIELD_RECOVERY_SQUAD_TYPES = Object.freeze(['assault', 'skirmisher', 'retrieval']);

const MAJOR_BASELINE = Object.freeze({
  label: '拠点療養',
  targetRatio: 1,
  healRatioPerSecond: 0.006,
  reorganizationSeconds: 45,
  capacity: 1
});

const FIELD_BASELINE = Object.freeze({
  label: '簡易拠点で再編成',
  targetRatio: null,
  healRatioPerSecond: 0,
  reorganizationSeconds: 60,
  capacity: 1
});

function activeFacilityAtBase(state, baseId, types) {
  return (state.combat.defenses ?? [])
    .filter(defense => types.includes(defense.type) && defense.baseId === baseId && defense.hp > 0 && !defense.ruined && (defense.disabledTimer ?? 0) <= 0)
    .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0))[0] ?? null;
}

function baseKind(state, baseId) {
  return (state.world.fieldBases ?? []).some(base => base.id === baseId) ? 'FIELD' : 'MAJOR';
}

export function recoveryProfileForSquad(state, squad, baseId = squad.recoveryBaseId ?? squad.originBaseId) {
  const base = ownedBaseById(state, baseId, { includeDestroyed: true });
  if (!base || base.status !== 'ESTABLISHED' || base.hp <= 0) {
    return { ok: false, reason: '回復可能な拠点がありません。', base: null, kind: null };
  }

  const kind = baseKind(state, base.id);
  if (kind === 'FIELD') {
    const eligible = FIELD_RECOVERY_SQUAD_TYPES.includes(squad.type);
    const facility = activeFacilityAtBase(state, base.id, ['fieldAid']);
    if (!eligible) {
      return {
        ok: true, base, kind, facility: null, label: '簡易拠点で待機',
        targetRatio: Math.max(0, Math.min(1, squad.hp / Math.max(1, squad.maxHp))),
        healRatioPerSecond: 0, reorganizationSeconds: 90, capacity: 1,
        limited: true, noHealing: true
      };
    }
    if (!facility) {
      return {
        ok: true, base, kind, facility: null, ...FIELD_BASELINE,
        targetRatio: Math.max(0, Math.min(1, squad.hp / Math.max(1, squad.maxHp))),
        limited: true, noHealing: true
      };
    }
    const definition = defenseRuntimeDefinition(facility);
    return {
      ok: true, base, kind, facility,
      label: definition.name,
      targetRatio: Math.max(0, Math.min(1, Number(definition.recoveryCap) || 0.7)),
      healRatioPerSecond: Math.max(0, Number(definition.recoveryRate) || 0.008),
      reorganizationSeconds: Math.max(1, Number(definition.reorganizationSeconds) || 45),
      capacity: Math.max(1, Math.floor(Number(definition.recoveryCapacity) || 1)),
      limited: true,
      noHealing: false
    };
  }

  const facility = activeFacilityAtBase(state, base.id, ['medical']);
  if (!facility) return { ok: true, base, kind, facility: null, ...MAJOR_BASELINE, limited: false, noHealing: false };
  const definition = defenseRuntimeDefinition(facility);
  return {
    ok: true, base, kind, facility,
    label: definition.name,
    targetRatio: 1,
    healRatioPerSecond: Math.max(0, Number(definition.recoveryRate) || MAJOR_BASELINE.healRatioPerSecond),
    reorganizationSeconds: Math.max(1, Number(definition.reorganizationSeconds) || MAJOR_BASELINE.reorganizationSeconds),
    capacity: Math.max(1, Math.floor(Number(definition.recoveryCapacity) || 1)),
    limited: false,
    noHealing: false
  };
}

export function beginFriendlyRecovery(state, squad, baseId, worldTime = state.runtime?.worldTimeMs ?? Date.now()) {
  squad.recoveryBaseId = baseId;
  const profile = recoveryProfileForSquad(state, squad, baseId);
  if (!profile.ok) return profile;
  const targetRatio = profile.targetRatio == null
    ? Math.max(0, Math.min(1, squad.hp / Math.max(1, squad.maxHp)))
    : Math.max(squad.hp / Math.max(1, squad.maxHp), profile.targetRatio);
  squad.recoveryStartedAt = worldTime;
  squad.reorganizationRemaining = profile.reorganizationSeconds;
  squad.recoveryTargetHp = Math.min(squad.maxHp, Math.max(squad.hp, squad.maxHp * targetRatio));
  squad.recoveryFacilityType = profile.facility?.type ?? null;
  squad.recoveryFacilityId = profile.facility?.id ?? null;
  squad.readyAt = null;
  squad.status = FRIENDLY_RECOVERY_STATUS.RECOVERING;
  squad.order = 'HOLD';
  squad.path = null;
  squad.pathIndex = 0;
  squad.edgeId = null;
  squad.edgeProgress = 0;
  squad.commandDestinationNodeId = profile.base.nodeId;
  squad.nodeId = profile.base.nodeId;
  squad.engagedEnemyId = null;
  squad.targetBaseId = null;
  squad.missionTargetBaseId = null;
  return { ok: true, squad, profile };
}

function recoveryQueue(state, baseId) {
  return (state.combat.friendlySquads ?? [])
    .filter(squad => squad.hp > 0 && squad.status === FRIENDLY_RECOVERY_STATUS.RECOVERING && (squad.recoveryBaseId ?? squad.originBaseId) === baseId)
    .sort((a, b) => (a.recoveryStartedAt ?? 0) - (b.recoveryStartedAt ?? 0) || String(a.id).localeCompare(String(b.id)));
}

export function updateFriendlyRecovery(state, squad, deltaSeconds, events = null) {
  if (squad.status !== FRIENDLY_RECOVERY_STATUS.RECOVERING) return { updated: false };
  const baseId = squad.recoveryBaseId ?? squad.originBaseId;
  const profile = recoveryProfileForSquad(state, squad, baseId);
  if (!profile.ok) return { updated: false, stranded: true, reason: profile.reason };
  const queue = recoveryQueue(state, baseId);
  const queueIndex = queue.findIndex(item => item.id === squad.id);
  if (queueIndex >= profile.capacity) return { updated: false, queued: true, profile, queueIndex };

  squad.reorganizationRemaining = Math.max(0, Number(squad.reorganizationRemaining ?? profile.reorganizationSeconds) - deltaSeconds);
  const dynamicTargetRatio = profile.targetRatio == null
    ? squad.hp / Math.max(1, squad.maxHp)
    : Math.max(squad.hp / Math.max(1, squad.maxHp), profile.targetRatio);
  const targetHp = Math.min(squad.maxHp, Math.max(squad.hp, squad.maxHp * dynamicTargetRatio));
  squad.recoveryTargetHp = targetHp;
  squad.recoveryFacilityType = profile.facility?.type ?? null;
  squad.recoveryFacilityId = profile.facility?.id ?? null;
  if (profile.healRatioPerSecond > 0 && squad.hp < targetHp) {
    squad.hp = Math.min(targetHp, squad.hp + squad.maxHp * profile.healRatioPerSecond * deltaSeconds);
  }

  if (squad.reorganizationRemaining > 0 || squad.hp + 0.001 < targetHp) {
    return { updated: true, ready: false, profile };
  }

  squad.status = FRIENDLY_RECOVERY_STATUS.READY;
  squad.readyAt = state.runtime?.worldTimeMs ?? Date.now();
  squad.reorganizationRemaining = 0;
  squad.hp = Math.min(squad.maxHp, targetHp);
  events?.emit('friendly:squad-ready', { squadId: squad.id, originBaseId: baseId, hp: squad.hp, maxHp: squad.maxHp });
  events?.emit('message', { text: `${profile.base.name}で部隊の回復・再編成が完了しました。` });
  return { updated: true, ready: true, profile };
}

export function recoveryPresentation(state, squad) {
  const profile = recoveryProfileForSquad(state, squad);
  const targetHp = Math.max(squad.hp, Number(squad.recoveryTargetHp) || squad.hp);
  return {
    profile,
    status: squad.status,
    targetHp,
    targetRatio: targetHp / Math.max(1, squad.maxHp),
    reorganizationRemaining: Math.max(0, Number(squad.reorganizationRemaining) || 0),
    ready: squad.status === FRIENDLY_RECOVERY_STATUS.READY,
    recovering: squad.status === FRIENDLY_RECOVERY_STATUS.RECOVERING
  };
}
