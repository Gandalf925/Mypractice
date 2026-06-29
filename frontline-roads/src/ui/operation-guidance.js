import { distance, formatMeters } from '../core/utilities.js';
import { evaluateProject } from '../civilization/progression-system.js';
import { CIVILIZATIONS, RESOURCE_LABELS, SETTLEMENT_BUILDINGS } from '../civilization/data.js';
import { ownedBaseById } from '../base/field-bases.js';
import { RECOVERY_ITEM_STATUS, isRecoveryItemVisible, recoveryItemPoint, recoveryItemPresentation } from '../exploration/recovery-system.js';
import { ROADSIDE_USE_DEFINITIONS, TACTICAL_RECIPES, TACTICAL_WORKSHOP_BUILDING, ensureRoadsideSupplyState } from '../exploration/roadside-supplies.js';
import { hasBundle, missingBundle } from '../civilization/inventory-system.js';
import { ENEMY_BASE_DEFINITIONS } from '../combat/definitions.js';

const MAX_OPERATIONS = 4;
const MAX_WALK_TARGETS = 5;
const FIRST_GUIDE_SECONDS = 10 * 60;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function activeBases(state) {
  return [
    ...(state.world?.playerBases ?? []),
    ...(state.world?.fieldBases ?? [])
  ].filter(base => base?.status === 'ESTABLISHED' && base.hp > 0);
}

function activePlayerBases(state) {
  return (state.world?.playerBases ?? []).filter(base => base?.status === 'ESTABLISHED' && base.hp > 0);
}

function operation(id, priority, title, detail, action = null, tag = 'Recommended') {
  return { id, priority, title, detail, action, tag };
}

function incompleteProjectOperations(state) {
  const evaluation = evaluateProject(state);
  if (evaluation.complete || !evaluation.project) return [];
  const civilization = CIVILIZATIONS[evaluation.project.targetLevel];
  const incomplete = evaluation.checks.filter(check => !check.complete);
  const resourceMissing = incomplete
    .filter(check => check.kind === 'resource')
    .slice(0, 3)
    .map(check => `${RESOURCE_LABELS[check.key] ?? check.key} ${Math.max(0, check.required - check.current)}`);
  const nonResource = incomplete.find(check => check.kind !== 'resource');
  const detailParts = [];
  if (resourceMissing.length) detailParts.push(`Missing: ${resourceMissing.join(' · ')}`);
  if (nonResource) detailParts.push(labelForProjectCheck(nonResource));
  return [operation(
    'civilization-next',
    80,
    `${civilization?.name ?? `Civ Lv.${evaluation.project.targetLevel}`} to Growth`,
    detailParts.join(' / ') || 'Requirements can be checked.',
    'Open CIV',
    'Civilization'
  )];
}

function labelForProjectCheck(check) {
  if (check.kind === 'building') return `Facilitiesrequirements ${Math.floor(check.current)}/${check.required}`;
  if (check.kind === 'artifact') return `RecoveryItem ${Math.floor(check.current)}/${check.required}`;
  if (check.kind === 'progress') {
    if (check.key === 'totalKills') return `Enemy kills ${Math.floor(check.current)}/${check.required}`;
    if (check.key === 'totalCampsCaptured') return `Enemy baseAttack ${Math.floor(check.current)}/${check.required}`;
    if (check.key === 'cityHpStreak') return `city HP ${Math.floor(check.current)}/${check.required} sec`;
    return `Progressrequirements ${Math.floor(check.current)}/${check.required}`;
  }
  return `${check.kind} ${Math.floor(check.current)}/${check.required}`;
}

function nearestEnemyBaseOperation(state) {
  const player = state.player?.worldPosition;
  const bases = (state.world?.enemyBases ?? []).filter(base => base.alive && base.hp > 0 && finitePoint(base));
  if (!bases.length) return [];
  const reference = finitePoint(player) ? player : state.world?.homeBase;
  if (!finitePoint(reference)) return [];
  const base = bases.map(item => ({ item, meters: distance(reference, item) })).sort((a, b) => a.meters - b.meters)[0];
  const definition = ENEMY_BASE_DEFINITIONS[base.item.type];
  return [operation(
    'enemy-base-nearest',
    55,
    'Attack an enemy base',
    `${definition?.name ?? 'Enemy base'} · ${formatMeters(base.meters)} · A recovery item appears after capture.`,
    'Select on map',
    'Attack'
  )];
}

function recoveryOperations(state) {
  const items = (state.world?.recoveryItems ?? []).filter(item => isRecoveryItemVisible(item));
  const available = items.find(item => item.status === RECOVERY_ITEM_STATUS.AVAILABLE);
  const reserved = items.find(item => item.status === RECOVERY_ITEM_STATUS.RESERVED);
  const carried = items.find(item => item.status === RECOVERY_ITEM_STATUS.CARRIED);
  const baseReady = activeBases(state).some(base => base.hp > 0);
  if (available) {
    const presentation = recoveryItemPresentation(available);
    const point = recoveryItemPoint(state, available);
    const player = state.player?.worldPosition;
    const meters = finitePoint(player) && finitePoint(point) ? ` · ${formatMeters(distance(player, point))}` : '';
    return [operation('recovery-available', 65, 'Secure recovery item', `${presentation.name}${meters} · ${baseReady ? 'A recovery squad or field recovery is available.' : 'A base able to dispatch squads is required.'}`, 'Select recovery item', 'Recovery')];
  }
  if (reserved) return [operation('recovery-reserved', 40, 'Recovery squad en route', `${recoveryItemPresentation(reserved).name} is en route. It remains visible until arrival.`, null, 'Recovery')];
  if (carried) return [operation('recovery-carried', 42, 'Carrying recovery item', `${recoveryItemPresentation(carried).name} is being carried back to base.`, null, 'Recovery')];
  return [];
}

function repairOperations(state) {
  const damaged = (state.combat?.defenses ?? [])
    .filter(defense => defense.hp > 0 && defense.maxHp > 0 && defense.hp < defense.maxHp * 0.72)
    .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
  if (!damaged.length) return [];
  return [operation('repair-defense', 46, 'Repair damaged facilities', `Repairs needed ${damaged.length} · Most damaged facility HP ${Math.ceil(damaged[0].hp)}/${Math.ceil(damaged[0].maxHp)}`, 'Select facility', 'Defense')];
}

function workshopOperations(state) {
  const hasWorkshop = (state.civilization?.buildings ?? []).some(building => building.type === TACTICAL_WORKSHOP_BUILDING && building.hp > 0);
  if (!hasWorkshop) return [];
  const craftable = Object.entries(TACTICAL_RECIPES ?? {})
    .filter(([key, recipe]) => (state.civilization?.level ?? 0) >= (recipe.level ?? 0) && hasBundle(state, recipe.cost ?? {}) && hasTacticalMaterials(state, recipe.materials ?? {}))
    .map(([key]) => ROADSIDE_USE_DEFINITIONS[key]?.name ?? key)
    .slice(0, 3);
  if (!craftable.length) return [];
  return [operation('tactical-workshop', 38, 'Tactical items craftable', craftable.join(' · '), 'Open ITEMS', 'Craft')];
}

function hasTacticalMaterials(state, required) {
  const inventory = ensureRoadsideSupplyState(state).materials ?? {};
  return Object.entries(required ?? {}).every(([key, amount]) => (inventory[key] ?? 0) >= amount);
}

function firstTenMinuteOperations(state) {
  const created = Number(state.runtime?.createdAt) || Number(state.runtime?.worldTimeMs) || Date.now();
  const now = Number(state.runtime?.worldTimeMs) || Date.now();
  if (now - created > FIRST_GUIDE_SECONDS * 1000) return [];
  const results = [];
  const defenses = (state.combat?.defenses ?? []).filter(defense => defense.hp > 0);
  const captures = Number(state.statistics?.campsCaptured) || Number(state.civilization?.progress?.campsCapturedByType?.raiderCamp) || 0;
  const level = Number(state.civilization?.level) || 0;
  if (!defenses.length) results.push(operation('first-defense', 95, 'Place defense facilities first', 'Place Stone Throwers, Log Palisades, and Vine Snares on roads around the base.', 'Open BASES', 'First steps'));
  else if (captures <= 0) results.push(operation('first-attack-base', 90, 'Capture one enemy base', 'Civilization growth requires capturing an enemy base and securing recovery items.', 'Select enemy base', 'First steps'));
  else if (level <= 0) results.push(operation('first-civ1', 88, 'Civ Lv.1 to Growth', 'Open CIV, deliver missing resources, and start development.', 'Open CIV', 'First steps'));
  return results;
}

export function buildOperationGuidance(state) {
  const operations = [
    ...firstTenMinuteOperations(state),
    ...incompleteProjectOperations(state),
    ...recoveryOperations(state),
    ...nearestEnemyBaseOperation(state),
    ...workshopOperations(state),
    ...repairOperations(state)
  ];
  const unique = [];
  const seen = new Set();
  for (const item of operations.sort((a, b) => b.priority - a.priority)) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
    if (unique.length >= MAX_OPERATIONS) break;
  }
  return { operations: unique, walkTargets: buildWalkTargets(state) };
}

export function buildWalkTargets(state) {
  const player = state.player?.worldPosition;
  if (!finitePoint(player)) return [];
  const targets = [];
  for (const item of state.world?.roadsideSupplies?.active ?? []) {
    if (!finitePoint(item)) continue;
    const rarityRank = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }[item.rarity] ?? 0;
    if (rarityRank < 2 && item.kind !== 'tactical') continue;
    targets.push({ id: `supply:${item.id}`, kind: 'Supplies', title: item.name ?? 'Roadside Supplies', detail: `${rarityLabel(item.rarity)} · ${formatMeters(distance(player, item))}`, meters: distance(player, item), priority: 40 + rarityRank * 10 });
  }
  for (const item of state.world?.recoveryItems ?? []) {
    if (!isRecoveryItemVisible(item)) continue;
    const point = recoveryItemPoint(state, item);
    if (!finitePoint(point)) continue;
    targets.push({ id: `recovery:${item.id}`, kind: 'Recovery', title: recoveryItemPresentation(item).name, detail: `${statusText(item.status)} · ${formatMeters(distance(player, point))}`, meters: distance(player, point), priority: 70 });
  }
  for (const base of state.world?.enemyBases ?? []) {
    if (!base.alive || base.hp <= 0 || !finitePoint(base)) continue;
    const meters = distance(player, base);
    if (meters > 900) continue;
    targets.push({ id: `enemyBase:${base.id}`, kind: 'Attack', title: ENEMY_BASE_DEFINITIONS[base.type]?.name ?? 'Enemy base', detail: `HP ${Math.ceil(base.hp)}/${Math.ceil(base.maxHp)} · ${formatMeters(meters)}`, meters, priority: 55 });
  }
  return targets.sort((a, b) => b.priority - a.priority || a.meters - b.meters).slice(0, MAX_WALK_TARGETS);
}

function rarityLabel(rarity) {
  if (rarity === 'legendary') return 'Legendary';
  if (rarity === 'epic') return 'Epic';
  if (rarity === 'rare') return 'Rare';
  if (rarity === 'uncommon') return 'Uncommon';
  return 'Common';
}

function statusText(status) {
  if (status === RECOVERY_ITEM_STATUS.RESERVED) return 'Recovery squad en route';
  if (status === RECOVERY_ITEM_STATUS.CARRIED) return 'Carrying';
  if (status === RECOVERY_ITEM_STATUS.COLLECTED) return 'Recovered';
  return 'Uncollected';
}

export function operationGuidanceMarkup(guidance) {
  const operations = guidance?.operations ?? [];
  const walkTargets = guidance?.walkTargets ?? [];
  const opHtml = operations.length ? operations.map(item => `<article class="opsCard"><div><span>${esc(item.tag)}</span><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></div>${item.action ? `<em>${esc(item.action)}</em>` : ''}</article>`).join('') : '<p class="emptyText">There are no urgent operation goals. Check nearby enemies, supplies, and civilization requirements.</p>';
  const walkHtml = walkTargets.length ? walkTargets.map(item => `<article class="walkTargetCard"><span>${esc(item.kind)}</span><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></article>`).join('') : '<p class="emptyText">There are no priority walk targets near your current location.</p>';
  return `<section class="opsSummary"><h2>NEXT OPS</h2><p class="sectionNote">Shows useful next actions for the current situation in priority order.</p><div class="opsGrid">${opHtml}</div></section><section class="opsSummary"><h2>WALK TARGETS</h2><div class="walkTargetGrid">${walkHtml}</div></section>`;
}
