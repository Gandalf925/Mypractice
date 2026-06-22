import { deepClone } from '../core/utilities.js';
import { CIVILIZATIONS, CIVILIZATION_PROJECTS, DEFENSE_LINES, SETTLEMENT_BUILDINGS, defenseLineForType } from './data.js';
import { addBundle, consumeBundle } from './inventory-system.js';
import { defenseLine, repairCostForDefense } from './repair-cost.js';

export function createProgressState() {
  return {
    totalRepairHpPaid: 0,
    totalProduced: {},
    selfProducedBronze: 0,
    selfProducedWroughtIron: 0,
    perfectWaveStreak: 0,
    bossesDefeated: {},
    campsCapturedByType: {},
    cityHpStreaks: { 50: 0, 60: 0, 70: 0 }
  };
}

export function ensureProject(state) {
  if ((state.civilization.level ?? 0) >= 4) {
    state.civilization.project = null;
    return null;
  }
  const targetLevel = (state.civilization.level ?? 0) + 1;
  const definition = CIVILIZATION_PROJECTS[targetLevel];
  const existing = state.civilization.project;
  if (!existing || existing.targetLevel !== targetLevel) {
    state.civilization.project = {
      targetLevel,
      status: 'AVAILABLE',
      contributions: {},
      durationSec: definition.durationSec,
      progressedSec: 0,
      startedAt: null
    };
  }
  return state.civilization.project;
}

function defenseCount(state, predicate) {
  return state.combat.defenses.filter(defense => defense.hp > 0 && !defense.ruined && predicate(defense)).length;
}

function buildingCheckValue(state, key) {
  if (SETTLEMENT_BUILDINGS[key]) return state.civilization.buildings.filter(building => building.type === key && !building.ruined && !building.demolished).length;
  if (key === 'barrier0') return defenseCount(state, defense => defense.kind === 'barrier' && (defense.tier ?? 0) >= 0);
  if (key === 'single0') return defenseCount(state, defense => defenseLineForType(defense.type) === 'single');
  if (key === 'otherDefense0') return defenseCount(state, defense => ['area', 'slow', 'repair'].includes(defenseLineForType(defense.type)));
  if (key === 'upgradedDefenses') return defenseCount(state, defense => (defense.tier ?? 0) >= 1);
  if (key === 'upgradedDefenseKinds') return new Set(state.combat.defenses.filter(defense => defense.hp > 0 && !defense.ruined && (defense.tier ?? 0) >= 1).map(defense => defenseLineForType(defense.type))).size;
  if (key === 'barrier2') return defenseCount(state, defense => defense.kind === 'barrier' && !defense.isGate && (defense.tier ?? 0) >= 2);
  if (key === 'gate2') return defenseCount(state, defense => defense.kind === 'barrier' && defense.isGate && (defense.tier ?? 0) >= 2);
  if (key === 'gate3') return defenseCount(state, defense => defense.kind === 'barrier' && defense.isGate && (defense.tier ?? 0) >= 3);
  if (key === 'bronzeDefenses') return defenseCount(state, defense => (defense.tier ?? 0) >= 3);
  if (key === 'bronzeDefenseKinds') return new Set(state.combat.defenses.filter(defense => defense.hp > 0 && !defense.ruined && (defense.tier ?? 0) >= 3).map(defense => defenseLineForType(defense.type))).size;
  if (key === 'wallAtLeast2') return defenseCount(state, defense => defense.kind === 'barrier' && !defense.isGate && (defense.tier ?? 0) >= 2);
  return 0;
}

function progressCheckValue(state, key, requirement) {
  const progress = state.civilization.progress;
  if (key === 'totalKills') return state.statistics.kills;
  if (key === 'totalCampsCaptured') return state.statistics.campsCaptured;
  if (key === 'totalRepairHpPaid') return progress.totalRepairHpPaid;
  if (key === 'totalProduced') return Object.values(progress.totalProduced).reduce((sum, value) => sum + Number(value || 0), 0);
  if (key === 'selfProducedBronze') return progress.selfProducedBronze;
  if (key === 'selfProducedWroughtIron') return progress.selfProducedWroughtIron;
  if (key === 'perfectWaveStreak') return progress.perfectWaveStreak;
  if (key === 'siegeCaptainsDefeated') return progress.bossesDefeated.siegeCaptain ?? 0;
  if (key === 'simultaneousOutposts') return state.world.outposts.filter(outpost => outpost.status === 'ACTIVE').length;
  if (key === 'copperCampsCaptured') return progress.campsCapturedByType.copperCamp ?? 0;
  if (key === 'tinCampsCaptured') return progress.campsCapturedByType.tinCamp ?? 0;
  if (key === 'ironCampsCaptured') return progress.campsCapturedByType.ironCamp ?? 0;
  if (key === 'cityHpStreak') return progress.cityHpStreaks[requirement.threshold] ?? 0;
  return 0;
}

export function evaluateProject(state, { create = true } = {}) {
  const project = create ? ensureProject(state) : state.civilization.project;
  if (!project) return { complete: true, checks: [] };
  const definition = CIVILIZATION_PROJECTS[project.targetLevel];
  const checks = [];
  for (const [key, required] of Object.entries(definition.contributions)) {
    const current = project.contributions[key] ?? 0;
    checks.push({ kind: 'resource', key, current, required, complete: current >= required });
  }
  for (const [key, required] of Object.entries(definition.buildings)) {
    const current = buildingCheckValue(state, key);
    checks.push({ kind: 'building', key, current, required, complete: current >= required });
  }
  for (const [key, required] of Object.entries(definition.progress)) {
    const requiredValue = key === 'cityHpStreak' ? required.seconds : required;
    const current = progressCheckValue(state, key, required);
    checks.push({ kind: 'progress', key, current, required: requiredValue, complete: current >= requiredValue });
  }
  return { complete: checks.every(check => check.complete), checks, project, definition };
}

export class ProgressionSystem {
  constructor(events = null) {
    this.events = events;
  }

  contribute(state, resource, amount = Infinity) {
    const project = ensureProject(state);
    if (!project || ['BUILDING', 'PAUSED'].includes(project.status)) return { ok: false, reason: '現在は納入できません。' };
    const definition = CIVILIZATION_PROJECTS[project.targetLevel];
    const required = definition.contributions[resource] ?? 0;
    const current = project.contributions[resource] ?? 0;
    const available = state.inventory.resources[resource] ?? 0;
    const accepted = Math.min(Math.max(0, required - current), Math.max(0, Math.floor(amount)), available);
    if (accepted <= 0 || !consumeBundle(state, { [resource]: accepted })) return { ok: false, reason: '納入できる資源がありません。' };
    project.contributions[resource] = current + accepted;
    project.status = evaluateProject(state).complete ? 'READY' : 'CONTRIBUTING';
    return { ok: true, amount: accepted };
  }

  withdraw(state) {
    const project = ensureProject(state);
    if (!project || ['BUILDING', 'PAUSED'].includes(project.status)) return { ok: false, reason: '建設開始後は引き出せません。' };
    const refund = deepClone(project.contributions);
    project.contributions = {};
    project.status = 'AVAILABLE';
    addBundle(state, refund);
    return { ok: true, refund };
  }

  start(state) {
    const evaluation = evaluateProject(state);
    if (!evaluation.project || !evaluation.complete) return { ok: false, reason: '発展条件を満たしていません。', checks: evaluation.checks };
    evaluation.project.status = 'BUILDING';
    evaluation.project.startedAt = state.runtime?.worldTimeMs ?? Date.now();
    return { ok: true };
  }

  update(state, deltaSeconds) {
    const progress = state.civilization.progress;
    for (const threshold of [50, 60, 70]) {
      progress.cityHpStreaks[threshold] = state.world.city.hp >= threshold
        ? (progress.cityHpStreaks[threshold] ?? 0) + deltaSeconds
        : 0;
    }
    const project = ensureProject(state);
    if (!project) return;
    if (project.status !== 'BUILDING') {
      if (!['PAUSED'].includes(project.status)) project.status = evaluateProject(state).complete ? 'READY' : Object.keys(project.contributions).length ? 'CONTRIBUTING' : 'AVAILABLE';
      return;
    }
    project.progressedSec = Math.min(project.durationSec, (project.progressedSec ?? 0) + deltaSeconds);
    if (project.progressedSec < project.durationSec) return;
    const level = project.targetLevel;
    state.civilization.level = level;
    const worldNow = state.runtime?.worldTimeMs ?? Date.now();
    state.civilization.completedAt = worldNow;
    state.civilization.gracePeriodUntil = CIVILIZATIONS[level].graceMinutes > 0 ? worldNow + CIVILIZATIONS[level].graceMinutes * 60000 : null;
    state.civilization.project = null;
    ensureProject(state);
    this.events?.emit('civilization:level-up', { level, civilization: CIVILIZATIONS[level] });
    this.events?.emit('message', { text: `${CIVILIZATIONS[level].name}へ発展しました。` });
  }

  repairDefense(state, defenseId) {
    const defense = state.combat.defenses.find(item => item.id === defenseId);
    if (!defense) return { ok: false, reason: '設備が見つかりません。' };
    const missingHp = Math.max(0, defense.maxHp - defense.hp);
    if (missingHp <= 0 && !defense.ruined) return { ok: false, reason: '修理は不要です。' };
    const line = defenseLine(defense);
    const cost = repairCostForDefense(defense, missingHp);
    if (!consumeBundle(state, cost)) return { ok: false, reason: '修理資源が不足しています。' };
    defense.hp = defense.maxHp;
    defense.ruined = false;
    state.civilization.progress.totalRepairHpPaid += missingHp;
    this.events?.emit('combat:defense-repaired', { defenseId: defense.id, repairHp: missingHp, cost, automatic: false });
    return { ok: true, defense, cost };
  }

  convertBarrierToGate(state, defenseId) {
    const defense = state.combat.defenses.find(item => item.id === defenseId && item.kind === 'barrier' && !item.isGate && item.hp > 0);
    if (!defense) return { ok: false, reason: '変換できる防壁がありません。' };
    const civilizationLevel = state.civilization.level ?? 0;
    if (civilizationLevel < 2) return { ok: false, reason: '石工集落以上で利用できます。' };
    const tier = Math.min(civilizationLevel, Math.max(2, defense.tier ?? 0));
    const definition = DEFENSE_LINES.gate[tier];
    if (!definition) return { ok: false, reason: '門へ変換できません。' };
    const source = definition.cost ?? definition.upgrade ?? {};
    const cost = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, Math.max(1, Math.ceil(value * 0.5))]));
    if (!consumeBundle(state, cost)) return { ok: false, reason: '門への変換資源が不足しています。' };
    defense.isGate = true;
    defense.line = 'gate';
    defense.tier = tier;
    defense.defenseKey = definition.key;
    defense.maxHp = definition.hp;
    defense.hp = definition.hp;
    this.events?.emit('combat:defense-upgraded', { defenseId: defense.id, tier: defense.tier, gate: true });
    return { ok: true, defense, cost };
  }

  upgradeDefense(state, defenseId) {
    const defense = state.combat.defenses.find(item => item.id === defenseId && item.hp > 0 && !item.ruined);
    if (!defense) return { ok: false, reason: '設備が見つかりません。' };
    const line = defense.isGate ? 'gate' : defense.kind === 'barrier' ? 'barrier' : defenseLineForType(defense.type);
    const nextTier = (defense.tier ?? 0) + 1;
    if (nextTier > (state.civilization.level ?? 0)) return { ok: false, reason: '文明レベルが不足しています。' };
    const definition = DEFENSE_LINES[line]?.[nextTier];
    if (!definition) return { ok: false, reason: 'これ以上強化できません。' };
    const cost = definition.upgrade ?? definition.cost ?? {};
    if (!consumeBundle(state, cost)) return { ok: false, reason: '強化資源が不足しています。' };
    defense.tier = nextTier;
    defense.defenseKey = definition.key;
    if (definition.hp) defense.maxHp = definition.hp;
    else defense.maxHp = Math.round(defense.maxHp * (1 + nextTier * 0.18));
    defense.hp = defense.maxHp;
    this.events?.emit('combat:defense-upgraded', { defenseId: defense.id, tier: defense.tier, gate: false });
    return { ok: true, defense, cost };
  }
}
