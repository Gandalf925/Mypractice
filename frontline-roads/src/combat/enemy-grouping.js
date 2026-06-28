import { ENEMY_DEFINITIONS } from './definitions.js';
import { scaleEnemyDefinition } from './enemy-scaling.js';

const IMPORTANT_ENEMY_TYPES = new Set([
  'siegeCaptain', 'steelCaptain', 'machineCommander', 'royalCommander',
  'commander', 'warDrummer', 'bodyguard', 'steelGuard', 'royalGuard'
]);

export function enemyUnitCount(enemy) {
  return Math.max(1, Math.floor(Number(enemy?.unitCount ?? enemy?.count) || 1));
}

export function enemyUnitHp(enemy) {
  const base = ENEMY_DEFINITIONS[enemy?.type] ?? ENEMY_DEFINITIONS.infantry;
  const definition = scaleEnemyDefinition(base, enemy?.level ?? 1);
  return Math.max(1, Number(enemy?.unitHp) || Number(definition.hp) || Number(enemy?.maxHp) || 1);
}

export function enemyTotalPopulation(state) {
  return (state?.combat?.enemies ?? []).reduce((total, enemy) => {
    if (!enemy || enemy.hp <= 0 || enemy.rewardGranted) return total;
    return total + enemyUnitCount(enemy);
  }, 0);
}

export function enemyGroupLimitForState(state, type = 'infantry') {
  if (IMPORTANT_ENEMY_TYPES.has(type)) return 1;
  const level = Math.max(0, Math.min(7, Math.floor(Number(state?.civilization?.level) || 0)));
  if (level <= 1) return 3;
  if (level === 2) return 5;
  if (level === 3) return 7;
  if (level <= 5) return 9;
  return 11;
}

export function normalizeEnemyGroup(enemy) {
  if (!enemy) return enemy;
  const count = enemyUnitCount(enemy);
  const unitHp = enemyUnitHp(enemy);
  enemy.unitCount = count;
  enemy.unitHp = unitHp;
  const maximumPool = unitHp * count;
  const previousMax = Math.max(1, Number(enemy.maxHp) || maximumPool);
  const previousHp = Math.max(0, Math.min(previousMax, Number(enemy.hp ?? previousMax) || 0));
  if (enemy.hpPool == null) {
    enemy.hpPool = count === 1 ? previousHp : previousHp / previousMax * maximumPool;
  }
  enemy.maxHp = maximumPool;
  enemy.hp = Math.max(0, Math.min(maximumPool, Number(enemy.hpPool) || 0));
  enemy.maxUnitCount ??= count;
  return enemy;
}

export function setEnemyUnitCount(enemy, unitCount, preserveRatio = true) {
  const previousCount = enemyUnitCount(enemy);
  const previousUnitHp = enemyUnitHp(enemy);
  const previousMaximum = Math.max(1, previousUnitHp * previousCount);
  const previousHp = Math.max(0, Math.min(previousMaximum, Number(enemy.hpPool ?? enemy.hp ?? previousMaximum) || 0));
  const nextCount = Math.max(1, Math.floor(Number(unitCount) || 1));
  const unitHp = previousUnitHp;
  const nextMaximum = unitHp * nextCount;
  enemy.unitCount = nextCount;
  enemy.unitHp = unitHp;
  enemy.maxHp = nextMaximum;
  enemy.hpPool = preserveRatio ? previousHp / previousMaximum * nextMaximum : Math.min(previousHp, nextMaximum);
  enemy.hp = Math.max(0, Math.min(nextMaximum, enemy.hpPool));
  enemy.maxUnitCount = Math.max(nextCount, Math.floor(Number(enemy.maxUnitCount) || nextCount));
  return enemy;
}

export function enemyRepresentativeBlipCount(enemy, quality = 'balanced') {
  const count = enemyUnitCount(enemy);
  if (count <= 1) return 1;
  const minimalLimit = count <= 5 ? count : Math.min(10, Math.ceil(4 + Math.sqrt(count) * 1.8));
  const balancedLimit = count <= 8 ? count : Math.min(18, Math.ceil(6 + Math.sqrt(count) * 2.4));
  const fullLimit = count <= 12 ? count : Math.min(28, Math.ceil(8 + Math.sqrt(count) * 3.2));
  return quality === 'full' ? fullLimit : quality === 'minimal' ? minimalLimit : balancedLimit;
}

export function groupAttackMultiplier(enemy, mode = 'field') {
  const count = enemyUnitCount(enemy);
  if (count <= 1) return 1;
  const cap = mode === 'friendly'
    ? 4
    : mode === 'barrier'
      ? 9
      : mode === 'settlement'
        ? 8
        : mode === 'facility'
          ? 7
          : 5;
  const active = Math.min(count, cap);
  const efficiency = mode === 'friendly'
    ? 0.62
    : mode === 'barrier'
      ? 0.88
      : mode === 'facility'
        ? 0.82
        : mode === 'settlement'
          ? 0.82
          : 0.72;
  return 1 + (active - 1) * efficiency;
}

export function splashDamageMultiplierForGroup(enemy, definition = {}, { centered = false, contactBonus = 1 } = {}) {
  const count = enemyUnitCount(enemy);
  if (count <= 1) return 1;
  const radius = Math.max(1, Number(definition.blastRadius ?? definition.splashRadius) || 18);
  const baseAffected = Math.max(1, Number(definition.maxTargets ?? definition.maxSplashTargets) || 3);
  const density = Math.min(count, Math.ceil(baseAffected + radius / 7));
  const centeredBonus = centered ? 1.18 : 1;
  return Math.max(1, Math.min(count, density * centeredBonus * Math.max(1, contactBonus)));
}
