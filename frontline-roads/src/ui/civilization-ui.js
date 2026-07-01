import {
  CIVILIZATIONS, CIVILIZATION_PROJECTS, DEFENSE_LINES, PRODUCTION_RECIPES,
  RESOURCE_KEYS, RESOURCE_LABELS, SETTLEMENT_BUILDINGS, MAX_CIVILIZATION_LEVEL
} from '../civilization/data.js';
import { bundleText, currentCivilization, hasBundle } from '../civilization/inventory-system.js';
import { evaluateProject, projectContributionReserve, safeProjectContributionAmount } from '../civilization/progression-system.js';
import { bindDismissibleModal, escapeHtml, queryRequired, setVisible } from './dom.js';
import { usedSettlementSlots, settlementSlotLimit, isStorageBuildingType } from '../civilization/settlement-system.js';
import { baseLimitForCivilization } from '../base/player-bases.js';
import { fieldBaseLimitForCivilization, fieldBaseSlotsUsed } from '../base/field-bases.js';
import { diagnoseFieldBaseNetwork } from '../base/field-base-system.js';
import {
  FRIENDLY_SQUAD_DEFINITIONS, FRIENDLY_SQUAD_TYPES, friendlyGlobalCommandStatus, friendlySquadCapacityForBase
} from '../combat/friendly-force-system.js';
import { runtimeMessage } from '../i18n/catalog.js';

function languageCode(i18n) { return i18n?.language ?? 'ja'; }
function messageValue(i18n, key, params = {}, fallback = '') {
  return runtimeMessage(languageCode(i18n), key, params, fallback);
}
function htmlMessage(i18n, key, params = {}, fallback = '') {
  return escapeHtml(messageValue(i18n, key, params, fallback));
}
function i18nCopy(i18n, text = '') { return i18n?.copy?.(text) ?? String(text ?? ''); }
function htmlCopy(i18n, text = '') { return escapeHtml(i18nCopy(i18n, text)); }
function i18nBundle(i18n, bundle = {}) { return i18n?.bundleText?.(bundle) ?? bundleText(bundle); }
function htmlBundle(i18n, bundle = {}) { return escapeHtml(i18nBundle(i18n, bundle)); }
function separator(i18n) { return messageValue(i18n, 'civilization.inlineSeparator', {}, '・'); }

function formatDuration(seconds, i18n = null) {
  const value = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours && minutes) return messageValue(i18n, 'civilization.durationHoursMinutes', { hours, minutes }, `${hours}時間${minutes}分`);
  if (hours) return messageValue(i18n, 'civilization.durationHours', { hours }, `${hours}時間`);
  if (minutes && secs) return messageValue(i18n, 'civilization.durationMinutesSeconds', { minutes, seconds: secs }, `${minutes}分${secs}秒`);
  if (minutes) return messageValue(i18n, 'civilization.durationMinutes', { minutes }, `${minutes}分`);
  return messageValue(i18n, 'civilization.durationSeconds', { seconds: secs }, `${secs}秒`);
}

function limitText(value, i18n = null) {
  return Number.isFinite(value) ? String(value) : messageValue(i18n, 'civilization.limitUnlimited', {}, '上限なし');
}

function resourceName(i18n, key) { return i18nCopy(i18n, RESOURCE_LABELS[key] ?? key); }
function buildingName(i18n, definition) { return i18nCopy(i18n, definition?.name ?? ''); }
function buildingDescription(i18n, definition) { return i18nCopy(i18n, definition?.description ?? ''); }
function recipeName(i18n, recipe) { return i18nCopy(i18n, recipe?.name ?? ''); }
function civilizationName(i18n, civilization) { return i18nCopy(i18n, civilization?.name ?? ''); }
function civilizationCentral(i18n, civilization) { return i18nCopy(i18n, civilization?.central ?? ''); }
function defenseName(i18n, definition) { return i18nCopy(i18n, definition?.name ?? ''); }
function squadText(i18n, text = '') { return i18nCopy(i18n, text); }

function resourceAmountParts(state, key) {
  const stored = Math.floor(state.inventory.resources[key] ?? 0);
  const category = RESOURCE_CATEGORY_BY_KEY[key];
  const capacity = Math.floor(state.inventory.capacity?.[category] ?? 0);
  return { stored, capacity };
}

function buildingBuildStatus(state, type, i18n = null) {
  const definition = SETTLEMENT_BUILDINGS[type];
  if (!definition) {
    return {
      ok: false,
      label: messageValue(i18n, 'civilization.buildStatusUndefined', {}, '未定義'),
      reason: messageValue(i18n, 'civilization.buildReasonUnknown', {}, '不明な施設です。')
    };
  }
  if (definition.level > (state.civilization?.level ?? 0)) {
    return {
      ok: false,
      label: messageValue(i18n, 'civilization.buildStatusLocked', {}, '未解禁'),
      reason: messageValue(i18n, 'civilization.buildReasonUnlockLevel', { level: definition.level }, `文明Lv.${definition.level}で解禁`)
    };
  }
  const existing = state.civilization.buildings.filter(building => building.type === type).length;
  if (definition.limit && existing >= definition.limit) {
    return {
      ok: false,
      label: messageValue(i18n, 'civilization.buildStatusLimit', {}, '上限'),
      reason: messageValue(i18n, 'civilization.buildReasonLimitReached', {}, '建設上限に達しています。')
    };
  }
  const sameStorageSlot = isStorageBuildingType(type) && existing > 0;
  if (usedSettlementSlots(state) >= settlementSlotLimit(state) && !sameStorageSlot) {
    return {
      ok: false,
      label: messageValue(i18n, 'civilization.buildStatusNoSlot', {}, '枠不足'),
      reason: messageValue(i18n, 'civilization.buildReasonNoSlot', {}, '集落の建設枠がありません。')
    };
  }
  if (!hasBundle(state, definition.cost)) {
    return {
      ok: false,
      label: messageValue(i18n, 'civilization.buildStatusShortage', {}, '資源不足'),
      reason: messageValue(i18n, 'civilization.buildReasonShortage', { cost: i18nBundle(i18n, definition.cost) }, `不足：${bundleText(definition.cost)}`)
    };
  }
  return {
    ok: true,
    label: messageValue(i18n, 'civilization.buildStatusBuild', {}, '建設'),
    reason: messageValue(i18n, 'civilization.buildReasonReady', {}, '建設できます。')
  };
}

function recipeSummaryText(recipe, i18n = null) {
  const input = i18nBundle(i18n, recipe.input);
  const output = i18nBundle(i18n, recipe.output);
  const projectNote = recipe.projectDelivery ? messageValue(i18n, 'civilization.recipeProjectDelivery', {}, '・発展計画へ優先納入') : '';
  return messageValue(i18n, 'civilization.recipeSummary', {
    input,
    output,
    duration: formatDuration(recipe.seconds, i18n),
    projectNote
  }, `投入 ${input}・完成 ${output}・${formatDuration(recipe.seconds, i18n)}${projectNote}`);
}

const PROJECT_STATUS_KEYS = Object.freeze({
  AVAILABLE: ['civilization.projectStatusAvailable', '準備中'],
  CONTRIBUTING: ['civilization.projectStatusContributing', '納入中'],
  READY: ['civilization.projectStatusReady', '建設開始可能'],
  BUILDING: ['civilization.projectStatusBuilding', '建設中'],
  PAUSED: ['civilization.projectStatusPaused', '一時停止']
});

function projectStatusLabel(status, i18n = null) {
  const [key, fallback] = PROJECT_STATUS_KEYS[status] ?? PROJECT_STATUS_KEYS.AVAILABLE;
  return messageValue(i18n, key, {}, fallback);
}

function checkProgressText(check) {
  return `${Math.floor(check.current)}/${Math.floor(check.required)}`;
}

function tabButton(id, label, active) {
  return `<button type="button" data-ui-tab="${id}" class="${active === id ? 'active' : ''}">${escapeHtml(label)}</button>`;
}

function tabPanel(id, active, html) {
  return `<section class="uiTabPanel ${active === id ? 'active' : ''}" data-panel="${id}">${html}</section>`;
}

const RESOURCE_CATEGORIES = Object.freeze([
  ['base', 'civilization.resourceCategoryBase', '基本資材', ['wood', 'stone', 'fiber']],
  ['processed', 'civilization.resourceCategoryProcessed', '加工資材', ['timber', 'rope', 'cutStone', 'charcoal']],
  ['ore', 'civilization.resourceCategoryOre', '鉱石', ['copperOre', 'tinOre', 'ironOre']],
  ['metal', 'civilization.resourceCategoryMetal', '金属・部品', ['copperIngot', 'tinIngot', 'bronzeIngot', 'ironBloom', 'wroughtIron', 'steel', 'mechanism']]
]);
const RESOURCE_CATEGORY_BY_KEY = Object.freeze(Object.fromEntries(
  RESOURCE_CATEGORIES.flatMap(([category, , , keys]) => keys.map(key => [key, category]))
));

const CAPACITY_CATEGORY_KEYS = Object.freeze({
  base: ['civilization.resourceCategoryBase', '基本資材'],
  processed: ['civilization.resourceCategoryProcessed', '加工資材'],
  ore: ['civilization.resourceCategoryOre', '鉱石'],
  metal: ['civilization.resourceCategoryMetal', '金属・部品']
});

function capacityCategoryLabel(category, i18n = null) {
  const [key, fallback] = CAPACITY_CATEGORY_KEYS[category] ?? [null, category];
  return key ? messageValue(i18n, key, {}, fallback) : String(category);
}

function storageCapacityBonus(definition, count = 1) {
  const result = {};
  const copies = Math.max(0, Math.floor(Number(count) || 0));
  for (let index = 0; index < copies; index += 1) {
    const multiplier = index === 0 ? 1 : 0.5;
    for (const [category, amount] of Object.entries(definition?.capacityBonus ?? {})) {
      result[category] = (result[category] ?? 0) + Math.floor(Number(amount) * multiplier);
    }
  }
  return result;
}

function storageBonusText(definition, count = 1, i18n = null) {
  const bonus = storageCapacityBonus(definition, count);
  const entries = Object.entries(bonus).filter(([, amount]) => amount > 0);
  return entries.length
    ? entries.map(([category, amount]) => messageValue(i18n, 'civilization.storageBonusEntry', { category: capacityCategoryLabel(category, i18n), amount }, `${capacityCategoryLabel(category, i18n)} +${amount}`)).join(separator(i18n))
    : messageValue(i18n, 'civilization.storageNoBonus', {}, '保管上限の増加なし');
}

function storageGroups(state) {
  const groups = new Map();
  for (const building of state.civilization?.buildings ?? []) {
    const definition = SETTLEMENT_BUILDINGS[building.type];
    if (!definition?.capacityBonus) continue;
    if (!groups.has(building.type)) groups.set(building.type, { type: building.type, definition, buildings: [] });
    groups.get(building.type).buildings.push(building);
  }
  return [...groups.values()].sort((a, b) => a.definition.level - b.definition.level || String(a.type).localeCompare(String(b.type)));
}

function storageSummaryMarkup(state, i18n = null) {
  const groups = storageGroups(state);
  if (!groups.length) return `<p class="emptyText">${htmlMessage(i18n, 'civilization.storageEmpty', {}, '倉庫系施設は未建設です。')}</p>`;
  return `<div class="storageEffectGrid">${groups.map(group => {
    const count = group.buildings.length;
    const damaged = group.buildings.filter(building => building.hp < building.maxHp).length;
    const status = damaged
      ? messageValue(i18n, 'civilization.storageDamaged', { count: damaged }, `損傷 ${damaged}基`)
      : messageValue(i18n, 'civilization.storageAllOperating', {}, '全基稼働');
    const summary = messageValue(i18n, 'civilization.storageCardStatus', { count, status }, `稼働 ${count}基・建設枠 1・${status}`);
    return `<article class="storageEffectCard"><header><strong>${htmlCopy(i18n, group.definition.name)}</strong><small>${escapeHtml(summary)}</small></header><p>${escapeHtml(storageBonusText(group.definition, count, i18n))}</p></article>`;
  }).join('')}</div>`;
}

function storageActionButtons(group, i18n = null) {
  const damaged = group.buildings.find(building => building.hp < building.maxHp);
  const newest = [...group.buildings].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))[0];
  return `<div class="buttonRow">${damaged ? `<button data-action="repair-building" data-building-id="${escapeHtml(damaged.id)}">${htmlMessage(i18n, 'civilization.repairOneDamaged', {}, '損傷1基を修理')}</button>` : ''}<button data-action="demolish-building" data-building-id="${escapeHtml(newest?.id ?? '')}">${htmlMessage(i18n, 'civilization.demolishOne', {}, '1基を解体')}</button></div>`;
}

function resourceCategorySections(state, i18n = null) {
  return RESOURCE_CATEGORIES.map(([, labelKey, fallback, keys]) => {
    const rows = keys
      .filter(key => (state.inventory.resources[key] ?? 0) > 0)
      .map(key => {
        const { stored, capacity } = resourceAmountParts(state, key);
        return `<div class="resourceRow compact"><span>${escapeHtml(resourceName(i18n, key))}</span><strong>${stored}/${capacity}</strong></div>`;
      }).join('') || `<p class="emptyText">${htmlMessage(i18n, 'civilization.resourceNoneInCategory', {}, '該当資材なし')}</p>`;
    return `<details class="compactDisclosure resourceCategory" open><summary>${htmlMessage(i18n, labelKey, {}, fallback)}</summary><div class="resourceGrid">${rows}</div></details>`;
  }).join('');
}

const DEFENSE_LINE_KEYS = Object.freeze({
  barrier: ['civilization.defenseLineBarrier', '防壁'],
  single: ['civilization.defenseLineSingle', '単体攻撃'],
  area: ['civilization.defenseLineArea', '範囲攻撃'],
  slow: ['civilization.defenseLineSlow', '減速支援'],
  repair: ['civilization.defenseLineRepair', '自動修復'],
  medical: ['civilization.defenseLineMedical', '範囲回復'],
  fieldBarracks: ['civilization.defenseLineFieldBarracks', '前線兵舎'],
  survey: ['civilization.defenseLineSurvey', '道路測量'],
  gate: ['civilization.defenseLineGate', '門']
});

function defenseLineLabel(line, i18n = null) {
  const [key, fallback] = DEFENSE_LINE_KEYS[line] ?? [null, line];
  return key ? messageValue(i18n, key, {}, fallback) : String(line);
}

function defenseTierCatalog(state, i18n = null) {
  const level = Math.max(0, Math.min(MAX_CIVILIZATION_LEVEL, Number(state.civilization?.level) || 0));
  return Object.keys(DEFENSE_LINE_KEYS).map(line => {
    const label = defenseLineLabel(line, i18n);
    const minimum = line === 'gate' ? 2 : ['survey', 'medical', 'fieldBarracks'].includes(line) ? 1 : 0;
    if (level < minimum) {
      return `<div class="defenseTierCard is-locked"><small>${escapeHtml(label)}</small><strong>${htmlMessage(i18n, 'civilization.unlockAtLevel', { level: minimum }, `文明Lv.${minimum}で解禁`)}</strong><span>${htmlMessage(i18n, 'civilization.currentlyUnavailable', {}, '現在は利用できません')}</span></div>`;
    }
    let tier = level;
    while (tier >= minimum && !DEFENSE_LINES[line]?.[tier]) tier -= 1;
    const current = DEFENSE_LINES[line]?.[tier];
    const next = tier < MAX_CIVILIZATION_LEVEL ? DEFENSE_LINES[line]?.[tier + 1] : null;
    const small = messageValue(i18n, 'civilization.defenseTierLimit', { label, tier }, `${label}・強化上限 Tier ${tier}`);
    const nextText = next
      ? messageValue(i18n, 'civilization.defenseNextUnlock', { level: tier + 1, name: defenseName(i18n, next) }, `次：文明Lv.${tier + 1}で${defenseName(i18n, next)}`)
      : messageValue(i18n, 'civilization.defenseFinalUnlocked', {}, '最終Tier解禁済み');
    return `<div class="defenseTierCard"><small>${escapeHtml(small)}</small><strong>${escapeHtml(defenseName(i18n, current))}</strong><span>${escapeHtml(nextText)}</span></div>`;
  }).join('');
}

function friendlyUnitCatalog(state, i18n = null) {
  const level = Math.max(0, Math.min(MAX_CIVILIZATION_LEVEL, Number(state.civilization?.level) || 0));
  return FRIENDLY_SQUAD_TYPES.map(type => {
    const definition = FRIENDLY_SQUAD_DEFINITIONS[type];
    const unlocked = level >= definition.unlockLevel;
    const bases = definition.allowedBaseKinds.includes('FIELD')
      ? messageValue(i18n, 'civilization.baseAccessMajorField', {}, '主要・簡易拠点')
      : messageValue(i18n, 'civilization.baseAccessMajorOnly', {}, '主要拠点のみ');
    const role = squadText(i18n, definition.role);
    const small = messageValue(i18n, 'civilization.squadRoleBases', { role, bases }, `${role}・${bases}`);
    const body = unlocked
      ? squadText(i18n, definition.description)
      : messageValue(i18n, 'civilization.unlockAtLevel', { level: definition.unlockLevel }, `文明Lv.${definition.unlockLevel}で解禁`);
    return `<div class="defenseTierCard ${unlocked ? '' : 'is-locked'}"><small>${escapeHtml(small)}</small><strong>${htmlCopy(i18n, definition.name)}</strong><span>${escapeHtml(body)}</span></div>`;
  }).join('');
}

const CHECK_LABEL_KEYS = Object.freeze({
  totalKills: ['civilization.check.totalKills', '敵撃破'],
  totalCampsCaptured: ['civilization.check.totalCampsCaptured', '敵拠点破壊'],
  totalProduced: ['civilization.check.totalProduced', '加工資材の生産'],
  selfProducedBronze: ['civilization.check.selfProducedBronze', '自作青銅塊'],
  selfProducedWroughtIron: ['civilization.check.selfProducedWroughtIron', '自作鍛鉄'],
  activeFieldBases: ['civilization.check.activeFieldBases', '稼働中の簡易拠点'],
  copperCampsCaptured: ['civilization.check.copperCampsCaptured', '銅鉱野営地制圧'],
  tinCampsCaptured: ['civilization.check.tinCampsCaptured', '錫鉱野営地制圧'],
  ironCampsCaptured: ['civilization.check.ironCampsCaptured', '鉄鉱野営地制圧'],
  siegeCaptainsDefeated: ['civilization.check.siegeCaptainsDefeated', '攻城隊長撃破'],
  recoveredArtifacts: ['civilization.check.recoveredArtifacts', '現地回収した特殊アイテム'],
  barrier0: ['civilization.check.barrier0', '丸太柵'],
  single0: ['civilization.check.single0', '投石台'],
  otherDefense0: ['civilization.check.otherDefense0', 'その他の防衛設備'],
  upgradedDefenses: ['civilization.check.upgradedDefenses', '改良済み防衛設備'],
  upgradedDefenseKinds: ['civilization.check.upgradedDefenseKinds', '改良設備の種類'],
  barrier2: ['civilization.check.barrier2', '石壁'],
  gate2: ['civilization.check.gate2', '石門'],
  gate3: ['civilization.check.gate3', '青銅門'],
  bronzeDefenses: ['civilization.check.bronzeDefenses', '青銅設備'],
  bronzeDefenseKinds: ['civilization.check.bronzeDefenseKinds', '青銅設備の種類'],
  wallAtLeast2: ['civilization.check.wallAtLeast2', '石壁以上'],
  ironDefenses: ['civilization.check.ironDefenses', '鉄器設備'],
  ironDefenseKinds: ['civilization.check.ironDefenseKinds', '鉄器設備の種類'],
  gate4: ['civilization.check.gate4', '鉄門'],
  steelDefenses: ['civilization.check.steelDefenses', '鋼鉄設備'],
  steelDefenseKinds: ['civilization.check.steelDefenseKinds', '鋼鉄設備の種類'],
  gate5: ['civilization.check.gate5', '鋼鉄門'],
  mechanismDefenses: ['civilization.check.mechanismDefenses', '機械設備'],
  mechanismDefenseKinds: ['civilization.check.mechanismDefenseKinds', '機械設備の種類'],
  gate6: ['civilization.check.gate6', '機関門'],
  selfProducedSteel: ['civilization.check.selfProducedSteel', '自作鋼材'],
  selfProducedMechanism: ['civilization.check.selfProducedMechanism', '自作機構部品'],
  generation5CommandersDefeated: ['civilization.check.generation5CommandersDefeated', '鋼鉄隊長撃破'],
  generation6CommandersDefeated: ['civilization.check.generation6CommandersDefeated', '戦列指揮官撃破'],
  machineWorksCaptured: ['civilization.check.machineWorksCaptured', '機械工廠制圧']
});

function checkLabel(check, i18n = null) {
  const [key, fallback] = CHECK_LABEL_KEYS[check.key] ?? [null, check.key];
  return key ? messageValue(i18n, key, {}, fallback) : String(check.key);
}

const DEFENSE_BUILDING_CHECKS = new Set([
  'barrier0', 'single0', 'otherDefense0', 'upgradedDefenses', 'upgradedDefenseKinds', 'barrier2',
  'gate2', 'gate3', 'bronzeDefenses', 'bronzeDefenseKinds', 'wallAtLeast2', 'ironDefenses',
  'ironDefenseKinds', 'gate4', 'steelDefenses', 'steelDefenseKinds', 'gate5', 'mechanismDefenses',
  'mechanismDefenseKinds', 'gate6'
]);

const CHECK_GUIDANCE_KEYS = Object.freeze({
  totalKills: ['civilization.guidance.totalKills', '防衛戦または派兵で敵部隊を撃破します。'],
  totalCampsCaptured: ['civilization.guidance.totalCampsCaptured', '敵拠点を選択して部隊を派兵し、拠点HPを0にします。'],
  totalProduced: ['civilization.guidance.totalProduced', '対応する集落施設を建設し、生産予約を実行します。'],
  selfProducedBronze: ['civilization.guidance.selfProducedBronze', '銅炉・錫炉・試験青銅炉または青銅工房を使い、自分の施設で青銅を生産します。'],
  selfProducedWroughtIron: ['civilization.guidance.selfProducedWroughtIron', '塊鉄炉で鉄塊を作り、鍛冶場で鍛鉄へ加工します。'],
  selfProducedSteel: ['civilization.guidance.selfProducedSteel', '製鋼炉で鍛鉄と木炭から鋼材を生産します。敵拠点の報酬だけでは加算されません。'],
  selfProducedMechanism: ['civilization.guidance.selfProducedMechanism', '機構工房で鋼材・加工木材・縄から機構部品を生産します。敵拠点の報酬だけでは加算されません。'],
  activeFieldBases: ['civilization.guidance.activeFieldBases', 'BASESから道路上へ簡易拠点を設置します。既存拠点と建設圏が重ならない地点を選びます。'],
  copperCampsCaptured: ['civilization.guidance.copperCampsCaptured', '「Cu」と表示される銅鉱野営地を破壊します。'],
  tinCampsCaptured: ['civilization.guidance.tinCampsCaptured', '「Sn」と表示される錫鉱野営地を破壊します。'],
  ironCampsCaptured: ['civilization.guidance.ironCampsCaptured', '「Fe」と表示される鉄鉱野営地を破壊します。'],
  siegeCaptainsDefeated: ['civilization.guidance.siegeCaptainsDefeated', '青銅期以降の攻城部隊に現れる攻城隊長を撃破します。'],
  generation5CommandersDefeated: ['civilization.guidance.generation5CommandersDefeated', '鋼鉄世代のウェーブに現れる鋼鉄隊長を撃破します。'],
  generation6CommandersDefeated: ['civilization.guidance.generation6CommandersDefeated', '機械世代のウェーブに現れる戦列指揮官を撃破します。'],
  machineWorksCaptured: ['civilization.guidance.machineWorksCaptured', '「Mc」と表示される機械工廠を破壊します。']
});

function projectCheckGuidance(check, state, i18n = null) {
  if (check.kind === 'artifact') return messageValue(i18n, 'civilization.guidance.artifact', {}, '敵拠点を破壊し、残された回収物を現地回収するか回収部隊で拠点へ持ち帰ります。');
  if (check.kind === 'building') {
    if (SETTLEMENT_BUILDINGS[check.key]) return messageValue(i18n, 'civilization.guidance.settlementBuilding', {}, '「文明」画面の集落施設から建設します。枠が不足している場合は不要施設を解体できます。');
    if (DEFENSE_BUILDING_CHECKS.has(check.key)) return messageValue(i18n, 'civilization.guidance.defenseBuilding', {}, 'MAPで対象設備を建設し、既設設備を選択して必要なTierまで強化します。門は防壁を選択して変換します。');
    return messageValue(i18n, 'civilization.guidance.genericBuilding', {}, 'MAPまたは「文明」画面から必要な施設を建設します。');
  }
  const [key, fallback] = CHECK_GUIDANCE_KEYS[check.key] ?? [null, '条件に対応する戦闘・建設・生産を進めます。'];
  return key ? messageValue(i18n, key, {}, fallback) : messageValue(i18n, 'civilization.guidance.generic', {}, fallback);
}

export class CivilizationUi {
  constructor({ store, civilizationSystem, notifications, persist, i18n = null }) {
    this.store = store;
    this.system = civilizationSystem;
    this.notifications = notifications;
    this.persist = persist;
    this.i18n = i18n;
    this.panel = queryRequired('#civilizationPanel');
    this.body = queryRequired('#civilizationBody');
    this.resourceSummary = queryRequired('#resourceSummary');
    this.lastPanelRenderAt = 0;
    this.activeTab = 'progress';
    this.disclosureState = new Map();
    queryRequired('#civilizationButton').addEventListener('click', () => this.open());
    queryRequired('#closeCivilization').addEventListener('click', () => this.close());
    bindDismissibleModal(this.panel, () => this.close());
    this.body.addEventListener('click', event => this.handleAction(event));
    this.body.addEventListener('toggle', event => this.handleDisclosureToggle(event), true);
  }

  localize(text = '') { return i18nCopy(this.i18n, text); }

  shortLabel(text = '') { return this.i18n?.short?.(text) ?? this.localize(text); }

  msg(key, params = {}, fallback = '') { return messageValue(this.i18n, key, params, fallback); }

  htmlMsg(key, params = {}, fallback = '') { return htmlMessage(this.i18n, key, params, fallback); }

  bundle(bundle = {}) { return i18nBundle(this.i18n, bundle); }

  htmlCopy(text = '') { return htmlCopy(this.i18n, text); }

  notify(key, params = {}, fallback = '') { this.notifications.show(this.msg(key, params, fallback)); }

  reasonPayload(result, key, fallback = '') {
    if (result?.reasonKey) return { key: result.reasonKey, params: result.reasonParams ?? {}, text: result.reason ?? fallback };
    return result?.reason ? this.localize(result.reason) : this.msg(key, {}, fallback);
  }

  notifyFailure(result, key, fallback = '') { this.notifications.show(this.reasonPayload(result, key, fallback)); }

  handleDisclosureToggle(event) {
    const target = event?.target;
    if (!target?.matches?.('details[data-ui-disclosure]')) return;
    const key = target.dataset?.uiDisclosure;
    if (!key) return;
    this.disclosureState.set(key, Boolean(target.open));
  }

  disclosureOpen(key, fallback = false) {
    return this.disclosureState.has(key) ? Boolean(this.disclosureState.get(key)) : fallback;
  }

  open() {
    this.render();
    setVisible(this.panel, true);
  }

  close() {
    setVisible(this.panel, false);
  }

  transaction(action, reason) {
    let result;
    this.store.transaction(state => { result = action(state); }, reason, { emit: true, validate: true });
    if (!result?.ok) this.notifications.show(this.reasonPayload(result, 'civilization.operationUnavailable', '操作できません。'));
    else this.persist?.();
    this.render();
    return result;
  }

  handleAction(event) {
    const tabButton = event.target.closest('button[data-ui-tab]');
    if (tabButton?.dataset?.uiTab) {
      this.activeTab = tabButton.dataset.uiTab || 'progress';
      this.render();
      return;
    }
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, resource, type, buildingId, recipeId, quantity } = button.dataset;
    if (action === 'contribute-safe-all') {
      const result = this.transaction(state => {
        let total = 0;
        const project = state.civilization?.project;
        const definition = project ? CIVILIZATION_PROJECTS[project.targetLevel] : null;
        for (const key of Object.keys(definition?.contributions ?? {})) {
          const amount = safeProjectContributionAmount(state, key);
          if (amount <= 0) continue;
          const contributed = this.system.progression.contribute(state, key, amount);
          if (contributed?.ok) total += contributed.amount;
        }
        return total > 0 ? { ok: true, amount: total } : { ok: false, reason: this.msg('civilization.contributeSafeAllUnavailable', {}, '予備を残して一括納入できる資源がありません。') };
      }, 'civilization:contribute-safe-all');
      if (result?.ok) this.notify('civilization.contributedSafeAll', { amount: result.amount }, `予備を残して合計${result.amount}資材を納入しました。`);
    } else if (action === 'contribute-safe-basic') {
      const protectedKeys = new Set(['bronzeIngot', 'wroughtIron', 'steel', 'mechanism']);
      const result = this.transaction(state => {
        let total = 0;
        const project = state.civilization?.project;
        const definition = project ? CIVILIZATION_PROJECTS[project.targetLevel] : null;
        for (const key of Object.keys(definition?.contributions ?? {})) {
          if (protectedKeys.has(key)) continue;
          const amount = safeProjectContributionAmount(state, key);
          if (amount <= 0) continue;
          const contributed = this.system.progression.contribute(state, key, amount);
          if (contributed?.ok) total += contributed.amount;
        }
        return total > 0 ? { ok: true, amount: total } : { ok: false, reason: this.msg('civilization.contributeSafeBasicUnavailable', {}, '加工・金属資材を除外し、予備を残して納入できる資源がありません。') };
      }, 'civilization:contribute-safe-basic');
      if (result?.ok) this.notify('civilization.contributedSafeBasic', { amount: result.amount }, `加工・金属資材を除外し、合計${result.amount}資材を納入しました。`);
    } else if (action === 'contribute-safe') {
      const result = this.transaction(state => this.system.progression.contributeSafely(state, resource), 'civilization:contribute-safe');
      if (result?.ok) this.notify('civilization.contributedResource', { resourceName: resourceName(this.i18n, resource), amount: result.amount }, `${RESOURCE_LABELS[resource]} ${result.amount}を納入しました。`);
    } else if (action === 'contribute-all') {
      const result = this.transaction(state => this.system.progression.contribute(state, resource), 'civilization:contribute-all');
      if (result?.ok) this.notify('civilization.contributedResource', { resourceName: resourceName(this.i18n, resource), amount: result.amount }, `${RESOURCE_LABELS[resource]} ${result.amount}を納入しました。`);
    } else if (action === 'withdraw') {
      this.transaction(state => this.system.progression.withdraw(state), 'civilization:withdraw');
    } else if (action === 'start-project') {
      this.transaction(state => this.system.progression.start(state), 'civilization:start-project');
    } else if (action === 'build-building') {
      const result = this.transaction(state => this.system.settlement.build(state, type), 'civilization:build');
      if (result?.ok) this.notify('civilization.buildingBuilt', { buildingName: buildingName(this.i18n, SETTLEMENT_BUILDINGS[type]) }, `${SETTLEMENT_BUILDINGS[type].name}を建設しました。`);
    } else if (action === 'produce') {
      const result = this.transaction(state => {
        const requested = quantity === 'max'
          ? this.system.production.maximumProducible(state, buildingId, recipeId).quantity
          : Math.max(1, Number(quantity) || 1);
        if (requested <= 0) return this.system.production.maximumProducible(state, buildingId, recipeId);
        return this.system.production.enqueue(state, buildingId, recipeId, requested);
      }, 'civilization:produce');
      if (result?.ok) this.notify('civilization.productionQueued', { recipeName: recipeName(this.i18n, PRODUCTION_RECIPES[recipeId]), quantity: result.quantity }, `${PRODUCTION_RECIPES[recipeId].name} ${result.quantity}個、生産予約しました。`);
    } else if (action === 'repair-building') {
      this.transaction(state => this.system.settlement.repair(state, buildingId), 'civilization:repair-building');
    } else if (action === 'demolish-building') {
      this.transaction(state => this.system.settlement.demolish(state, buildingId), 'civilization:demolish-building');
    } else if (action === 'collect-output') {
      this.transaction(state => this.system.production.collectOutput(state, buildingId), 'civilization:collect-output');
    }
  }

  update(state = this.store.snapshot()) {
    this.updateSummary(state);
    if (!this.panel.hidden && Date.now() - this.lastPanelRenderAt >= 1000) this.render(state);
  }

  updateSummary(state = this.store.snapshot()) {
    const visibleResources = RESOURCE_KEYS.filter(key =>
      (state.inventory.resources[key] ?? 0) > 0
      || ['wood', 'stone', 'fiber'].includes(key)
    );
    this.resourceSummary.innerHTML = visibleResources.map(key => {
      const { stored, capacity } = resourceAmountParts(state, key);
      const label = this.shortLabel(RESOURCE_LABELS[key]);
      const cap = this.msg('civilization.capacityLabel', { capacity }, `上限 ${capacity}`);
      return `<span class="resourceChip" data-resource="${escapeHtml(key)}"><small>${escapeHtml(label)}</small><strong>${stored}</strong><em>${escapeHtml(cap)}</em></span>`;
    }).join('');
    this.resourceSummary.setAttribute(
      'aria-label',
      visibleResources.map(key => {
        const { stored, capacity } = resourceAmountParts(state, key);
        return this.msg('civilization.resourceAriaEntry', { resourceName: resourceName(this.i18n, key), stored, capacity }, `${RESOURCE_LABELS[key]} ${stored}、上限 ${capacity}`);
      }).join(this.msg('civilization.listSeparator', {}, '、'))
    );
  }

  render(state = this.store.snapshot()) {
    this.updateSummary(state);
    this.lastPanelRenderAt = Date.now();
    const civilization = currentCivilization(state);
    const project = state.civilization.project;
    const evaluation = evaluateProject(state);
    const resources = RESOURCE_KEYS
      .filter(key => (state.inventory.resources[key] ?? 0) > 0)
      .map(key => {
        const { stored, capacity } = resourceAmountParts(state, key);
        return `<div class="resourceRow"><span>${escapeHtml(resourceName(this.i18n, key))}</span><strong>${stored}/${capacity}</strong></div>`;
      }).join('') || `<p class="emptyText">${this.htmlMsg('civilization.resourcesEmpty', {}, '保有資源はありません。')}</p>`;
    void resources;

    let projectHtml = `<p class="emptyText">${this.htmlMsg('civilization.maxReached', {}, '最高文明へ到達しています。')}</p>`;
    if (project) {
      const locked = ['BUILDING', 'PAUSED'].includes(project.status);
      const resourceChecks = evaluation.checks.filter(check => check.kind === 'resource');
      const otherChecks = evaluation.checks.filter(check => check.kind !== 'resource');
      const allChecks = [...resourceChecks, ...otherChecks];
      const completeCount = allChecks.filter(check => check.complete).length;
      const progressPercent = allChecks.length ? Math.floor((completeCount / allChecks.length) * 100) : 100;
      const contributionRow = check => {
        const key = check.key;
        const required = check.required;
        const current = project.contributions[key] ?? 0;
        const available = state.inventory.resources[key] ?? 0;
        const safeAmount = safeProjectContributionAmount(state, key);
        const reserve = projectContributionReserve(state, key);
        const gap = Math.max(0, required - current);
        const name = resourceName(this.i18n, key);
        const guidance = gap > 0
          ? (reserve
            ? this.msg('civilization.resourceNeedGuidance', { resourceName: name, gap, reserve }, `${RESOURCE_LABELS[key]}があと${gap}必要です。防衛・建設用に${reserve}を残して納入できます。`)
            : this.msg('civilization.resourceNeedGuidanceNoReserve', { resourceName: name, gap }, `${RESOURCE_LABELS[key]}があと${gap}必要です。所持分を納入できます。`))
          : this.msg('civilization.resourceCompleteGuidance', {}, '必要量を納入済みです。');
        const statusLabel = check.complete ? '✓' : this.msg('civilization.missing', {}, '不足');
        const reserveSmall = reserve ? `<small>${this.htmlMsg('civilization.defenseReserve', { reserve }, `防衛予備 ${reserve}`)}</small>` : '';
        return `<div class="requirementRow ${check.complete ? 'complete' : 'missing'}"><span>${escapeHtml(statusLabel)} ${escapeHtml(name)} ${Math.floor(current)}/${Math.floor(required)}${reserveSmall}<small>${escapeHtml(guidance)}</small></span><div class="contributionButtons"><button data-action="contribute-safe" data-resource="${escapeHtml(key)}" ${safeAmount <= 0 || locked ? 'disabled' : ''}>${this.htmlMsg('civilization.buttonKeepReserve', {}, '予備を残す')}${safeAmount > 0 ? ` ${safeAmount}` : ''}</button><button data-action="contribute-all" data-resource="${escapeHtml(key)}" ${available <= 0 || locked ? 'disabled' : ''}>${this.htmlMsg('civilization.buttonContributeAll', {}, '全量納入')}</button></div></div>`;
      };
      const conditionRow = check => {
        const fieldDiagnostic = check.key === 'activeFieldBases' ? diagnoseFieldBaseNetwork(state, check.required) : null;
        const guidance = fieldDiagnostic?.guidance ? this.localize(fieldDiagnostic.guidance) : projectCheckGuidance(check, state, this.i18n);
        const statusLabel = check.complete ? '✓' : this.msg('civilization.missing', {}, '不足');
        return `<div class="conditionRow ${check.complete ? 'complete' : 'missing'}"><span>${escapeHtml(statusLabel)} ${escapeHtml(checkLabel(check, this.i18n))}${guidance ? `<small>${escapeHtml(guidance)}</small>` : ''}</span><strong>${escapeHtml(checkProgressText(check))}</strong></div>`;
      };
      const missingRows = [
        ...resourceChecks.filter(check => !check.complete).map(contributionRow),
        ...otherChecks.filter(check => !check.complete).map(conditionRow)
      ].join('') || `<div class="conditionRow complete"><span>✓ ${this.htmlMsg('civilization.allCurrentConditionsComplete', {}, '現在の発展条件はすべて達成済みです。')}</span><strong>OK</strong></div>`;
      const completedRows = [
        ...resourceChecks.filter(check => check.complete).map(contributionRow),
        ...otherChecks.filter(check => check.complete).map(conditionRow)
      ].join('') || `<p class="emptyText">${this.htmlMsg('civilization.completedEmpty', {}, '達成済み条件はまだありません。')}</p>`;
      const remaining = Math.max(0, project.durationSec - (project.progressedSec ?? 0));
      const targetName = civilizationName(this.i18n, CIVILIZATIONS[project.targetLevel]);
      const status = projectStatusLabel(project.status, this.i18n);
      const statusLine = project.status === 'BUILDING'
        ? this.msg('civilization.projectStatusWithRemaining', { status, duration: formatDuration(remaining, this.i18n) }, `状態：${status}・残り ${formatDuration(remaining, this.i18n)}`)
        : this.msg('civilization.projectStatusOnly', { status }, `状態：${status}`);
      projectHtml = `
        <h3>${this.htmlMsg('civilization.projectTitle', { targetName }, `${targetName}への発展`)}</h3>
        <p class="sectionNote">${escapeHtml(statusLine)}</p>
        <div class="civilizationProgressBox"><strong>${progressPercent}%</strong><span>${this.htmlMsg('civilization.conditionsAchieved', { complete: completeCount, total: allChecks.length }, `${completeCount}/${allChecks.length} 条件達成`)}</span></div>
        <div class="buttonRow">
          <button data-action="contribute-safe-basic" ${locked ? 'disabled' : ''}>${this.htmlMsg('civilization.buttonContributeSafeBasic', {}, '基本資源だけ予備を残して一括納入')}</button>
          <button data-action="contribute-safe-all" ${locked ? 'disabled' : ''}>${this.htmlMsg('civilization.buttonContributeSafeAll', {}, '不足分を予備を残して一括納入')}</button>
        </div>
        <h4>${this.htmlMsg('civilization.missingConditionsTitle', {}, '不足している条件')}</h4>
        <div class="requirementList missingFirst">${missingRows}</div>
        <details class="completedRequirements" data-ui-disclosure="civilization.completedRequirements"${this.disclosureOpen('civilization.completedRequirements') ? ' open' : ''}><summary>${this.htmlMsg('civilization.completedConditionsSummary', { count: completeCount }, `達成済み条件 ${completeCount}件`)}</summary><div class="requirementList">${completedRows}</div></details>
        <div class="buttonRow">
          <button data-action="withdraw" ${locked ? 'disabled' : ''}>${this.htmlMsg('civilization.buttonWithdraw', {}, '納入を戻す')}</button>
          <button class="primary" data-action="start-project" ${!evaluation.complete || project.status === 'BUILDING' ? 'disabled' : ''}>${this.htmlMsg('civilization.buttonStartProject', {}, '建設開始')}</button>
        </div>`;
    }

    const unlockedBuildings = Object.entries(SETTLEMENT_BUILDINGS)
      .filter(([, definition]) => definition.level <= state.civilization.level);
    const storageCatalog = unlockedBuildings
      .filter(([type]) => isStorageBuildingType(type))
      .map(([type, definition]) => {
        const count = state.civilization.buildings.filter(building => building.type === type).length;
        const status = buildingBuildStatus(state, type, this.i18n);
        const ownedCost = this.msg('civilization.storageCatalogMeta', { count, cost: this.bundle(definition.cost) }, `所有 ${count}基・建設枠は同種で1枠・費用 ${bundleText(definition.cost)}`);
        const effect = this.msg('civilization.effectLine', { effect: storageBonusText(definition, Math.max(1, count || 1), this.i18n) }, `効果：${storageBonusText(definition, Math.max(1, count || 1), this.i18n)}`);
        return `<div class="catalogCard storageCatalogCard"><div><strong>${escapeHtml(buildingName(this.i18n, definition))}</strong><p>${escapeHtml(buildingDescription(this.i18n, definition))}</p><small>${escapeHtml(ownedCost)}</small><small>${escapeHtml(effect)}</small>${!status.ok ? `<small class="statusWarning">${escapeHtml(status.reason)}</small>` : ''}</div><button data-action="build-building" data-type="${escapeHtml(type)}" ${status.ok ? '' : 'disabled'}>${escapeHtml(status.label)}</button></div>`;
      }).join('') || `<p class="emptyText">${this.htmlMsg('civilization.storageCatalogEmpty', {}, '倉庫系施設はまだ解放されていません。')}</p>`;
    const productiveCatalog = unlockedBuildings
      .filter(([type]) => !isStorageBuildingType(type))
      .map(([type, definition]) => {
        const count = state.civilization.buildings.filter(building => building.type === type).length;
        const status = buildingBuildStatus(state, type, this.i18n);
        const ownedCost = this.msg('civilization.productiveCatalogMeta', { count, cost: this.bundle(definition.cost) }, `所有 ${count}・費用 ${bundleText(definition.cost)}`);
        return `<div class="catalogCard"><div><strong>${escapeHtml(buildingName(this.i18n, definition))}</strong><p>${escapeHtml(buildingDescription(this.i18n, definition))}</p><small>${escapeHtml(ownedCost)}</small>${!status.ok ? `<small class="statusWarning">${escapeHtml(status.reason)}</small>` : ''}</div><button data-action="build-building" data-type="${escapeHtml(type)}" ${status.ok ? '' : 'disabled'}>${escapeHtml(status.label)}</button></div>`;
      }).join('') || `<p class="emptyText">${this.htmlMsg('civilization.productiveCatalogEmpty', {}, '生産施設はまだ解放されていません。')}</p>`;
    const storageOperations = storageGroups(state).map(group => {
      const summary = this.msg('civilization.storageOperationMeta', {
        count: group.buildings.length,
        effect: storageBonusText(group.definition, group.buildings.length, this.i18n)
      }, `稼働 ${group.buildings.length}基・建設枠 1・保管上限 ${storageBonusText(group.definition, group.buildings.length, this.i18n)}`);
      return `<div class="productionCard storageOperationCard"><strong>${escapeHtml(buildingName(this.i18n, group.definition))}</strong><p class="buildingDescription">${escapeHtml(buildingDescription(this.i18n, group.definition))}</p><small>${escapeHtml(summary)}</small>${storageActionButtons(group, this.i18n)}</div>`;
    }).join('');
    const buildingCatalog = `<h3>${this.htmlMsg('civilization.storageHeading', {}, '倉庫・保管')}</h3><p class="sectionNote">${this.htmlMsg('civilization.storageNote', {}, '同じ倉庫を複数建てても建設枠は1枠として扱い、保管上限の増加効果は合計表示します。')}</p>${storageSummaryMarkup(state, this.i18n)}${storageOperations ? `<h4>${this.htmlMsg('civilization.activeStorageHeading', {}, '稼働中の倉庫')}</h4>${storageOperations}` : ''}<div class="catalogGrid compactCatalog">${storageCatalog}</div><h3>${this.htmlMsg('civilization.productionFacilityHeading', {}, '生産・加工')}</h3><div class="catalogGrid compactCatalog">${productiveCatalog}</div>`;

    const productionBuildings = state.civilization.buildings.filter(building => !isStorageBuildingType(building.type));
    const production = productionBuildings.map(building => {
      const definition = SETTLEMENT_BUILDINGS[building.type];
      const recipes = this.system.production.availableRecipes(state, building);
      const queue = state.civilization.productionQueues.find(item => item.buildingId === building.id);
      const summary = this.system.production.queueSummary(state, building.id);
      const current = queue?.current
        ? this.msg('civilization.productionCurrent', { recipeName: recipeName(this.i18n, PRODUCTION_RECIPES[queue.current.recipeId]), elapsed: Math.floor(queue.current.elapsedSec), duration: queue.current.durationSec }, `${PRODUCTION_RECIPES[queue.current.recipeId].name} ${Math.floor(queue.current.elapsedSec)}/${queue.current.durationSec}秒`)
        : queue?.waitingForResources
          ? this.msg('civilization.productionWaitingResources', {}, '資源待ち')
          : this.msg('civilization.productionIdle', {}, '待機中');
      const buffer = this.bundle(building.outputBuffer ?? {});
      const none = this.msg('civilization.none', {}, 'なし');
      const recipeCards = recipes.map(recipe => {
        const maximum = this.system.production.maximumProducible(state, building.id, recipe.id).quantity;
        return `<div class="productionRecipe"><div><strong>${escapeHtml(recipeName(this.i18n, recipe))}</strong><small>${escapeHtml(recipeSummaryText(recipe, this.i18n))}</small>${maximum <= 0 ? `<small class="statusWarning">${this.htmlMsg('civilization.recipeInputShortage', {}, '投入資材が不足しています。')}</small>` : ''}</div><div class="productionQuantity"><button data-action="produce" data-building-id="${escapeHtml(building.id)}" data-recipe-id="${escapeHtml(recipe.id)}" data-quantity="1" ${maximum < 1 ? 'disabled' : ''}>+1</button><button data-action="produce" data-building-id="${escapeHtml(building.id)}" data-recipe-id="${escapeHtml(recipe.id)}" data-quantity="5" ${maximum < 5 ? 'disabled' : ''}>+5</button><button data-action="produce" data-building-id="${escapeHtml(building.id)}" data-recipe-id="${escapeHtml(recipe.id)}" data-quantity="10" ${maximum < 10 ? 'disabled' : ''}>+10</button><button data-action="produce" data-building-id="${escapeHtml(building.id)}" data-recipe-id="${escapeHtml(recipe.id)}" data-quantity="max" ${maximum <= 0 ? 'disabled' : ''}>${this.htmlMsg('civilization.buttonProduceMax', { maximum }, `最大 ${maximum}`)}</button></div></div>`;
      }).join('') || `<span>${this.htmlMsg('civilization.noActiveRecipes', {}, '稼働レシピ未解禁')}</span>`;
      const durability = this.msg('civilization.productionDurability', { hp: Math.ceil(building.hp), maxHp: building.maxHp, status: current, pending: summary.pendingUnits ? this.msg('civilization.pendingUnits', { count: summary.pendingUnits }, `予約残 ${summary.pendingUnits}`) : '' }, `耐久 ${Math.ceil(building.hp)}/${building.maxHp}・${current}${summary.pendingUnits ? `・予約残 ${summary.pendingUnits}` : ''}`);
      return `<div class="productionCard"><strong>${escapeHtml(buildingName(this.i18n, definition))}</strong><p class="buildingDescription">${escapeHtml(buildingDescription(this.i18n, definition))}</p><small>${escapeHtml(durability)}</small>${buffer !== none ? `<small>${this.htmlMsg('civilization.uncollectedOutput', { output: buffer }, `未回収：${buffer}`)}</small>` : ''}<div class="recipeButtons">${recipeCards}</div><div class="buttonRow">${building.hp < building.maxHp ? `<button data-action="repair-building" data-building-id="${escapeHtml(building.id)}">${this.htmlMsg('civilization.buttonRepair', {}, '修理')}</button>` : ''}${buffer !== none ? `<button data-action="collect-output" data-building-id="${escapeHtml(building.id)}">${this.htmlMsg('civilization.buttonCollectOutput', {}, '未回収品を回収')}</button>` : ''}<button data-action="demolish-building" data-building-id="${escapeHtml(building.id)}">${this.htmlMsg('civilization.buttonDemolish', {}, '解体')}</button></div></div>`;
    }).join('') || `<p class="emptyText">${this.htmlMsg('civilization.productionEmpty', {}, '稼働中の生産施設はまだありません。')}</p>`;

    const active = ['progress', 'resources', 'settlement', 'production', 'reference'].includes(this.activeTab) ? this.activeTab : 'progress';
    const nextName = project ? civilizationName(this.i18n, CIVILIZATIONS[project.targetLevel]) : this.msg('civilization.targetReached', {}, '到達済み');
    const majorLimit = limitText(baseLimitForCivilization(state.civilization.level), this.i18n);
    const fieldLimit = limitText(fieldBaseLimitForCivilization(state.civilization.level), this.i18n);
    const command = friendlyGlobalCommandStatus(state);
    const referenceSquadsNote = this.msg('civilization.referenceSquadsNote', {
      majorCapacity: friendlySquadCapacityForBase(state, { kind: 'MAJOR' }),
      fieldCapacity: friendlySquadCapacityForBase(state, { kind: 'FIELD' }),
      assigned: command.assigned,
      capacity: command.capacity
    }, `現在は主要拠点 ${friendlySquadCapacityForBase(state, { kind: 'MAJOR' })}枠、簡易拠点 ${friendlySquadCapacityForBase(state, { kind: 'FIELD' })}枠、全体指揮 ${command.assigned}/${command.capacity}です。簡易拠点からは突撃部隊・遊撃部隊・回収部隊を派兵できます。`);
    this.body.innerHTML = `
      <div class="uiTabBar" role="tablist" aria-label="${this.htmlMsg('civilization.tabAria', {}, '文明画面の表示切替')}">
        ${tabButton('progress', this.msg('civilization.tabProgress', {}, '発展'), active)}
        ${tabButton('resources', this.msg('civilization.tabResources', {}, '資源'), active)}
        ${tabButton('settlement', this.msg('civilization.tabSettlement', {}, '施設'), active)}
        ${tabButton('production', this.msg('civilization.tabProduction', {}, '生産'), active)}
        ${tabButton('reference', this.msg('civilization.tabReference', {}, '解禁'), active)}
      </div>
      <section class="overviewHero civilizationHero">
        <div><small>${this.htmlMsg('civilization.currentCivilization', {}, '現在文明')}</small><strong>Lv.${state.civilization.level} ${escapeHtml(civilizationName(this.i18n, civilization))}</strong><span>${escapeHtml(civilizationCentral(this.i18n, civilization))}</span></div>
        <div><small>${this.htmlMsg('civilization.nextTarget', {}, '次の目標')}</small><strong>${escapeHtml(nextName)}</strong><span>${this.htmlMsg('civilization.settlementSlots', { used: usedSettlementSlots(state), total: civilization.slots }, `建設枠 ${usedSettlementSlots(state)}/${civilization.slots}`)}</span></div>
        <div><small>${this.htmlMsg('civilization.baseLimits', {}, '拠点上限')}</small><strong>${this.htmlMsg('civilization.majorLimit', { limit: majorLimit }, `主要 ${majorLimit}`)}</strong><span>${this.htmlMsg('civilization.fieldLimit', { used: fieldBaseSlotsUsed(state), limit: fieldLimit }, `簡易 ${fieldBaseSlotsUsed(state)}/${fieldLimit}`)}</span></div>
      </section>
      ${tabPanel('progress', active, `<h2>${this.htmlMsg('civilization.progressTitle', {}, '文明発展')}</h2>${projectHtml}`)}
      ${tabPanel('resources', active, `<h2>${this.htmlMsg('civilization.resourcesTitle', {}, '資源一覧')}</h2><p class="sectionNote">${this.htmlMsg('civilization.resourcesNote', {}, '通常資材は文明・建設・生産で使用します。所持数は保管上限を超えられず、上限超過分は取得されません。戦術素材はITEMS / 戦術工房で管理します。')}</p><h3>${this.htmlMsg('civilization.storageEffectTitle', {}, '倉庫効果')}</h3>${storageSummaryMarkup(state, this.i18n)}${resourceCategorySections(state, this.i18n)}`)}
      ${tabPanel('settlement', active, `<h2>${this.htmlMsg('civilization.settlementTitle', {}, '集落施設')}</h2><p class="sectionNote">${this.htmlMsg('civilization.settlementNote', {}, '施設は役割ごとに確認できます。倉庫は同じ種類を複数建てても建設枠は1枠扱いになり、効果は合計されます。')}</p>${buildingCatalog}`)}
      ${tabPanel('production', active, `<h2>${this.htmlMsg('civilization.productionTitle', {}, '生産')}</h2><p class="sectionNote">${this.htmlMsg('civilization.productionNote', {}, '加工・精錬を行う稼働施設だけ表示します。倉庫は資源・施設タブで合計効果を確認します。')}</p>${production}`)}
      ${tabPanel('reference', active, `<h2>${this.htmlMsg('civilization.defenseTierTitle', {}, '防衛設備Tier')}</h2><p class="sectionNote">${this.htmlMsg('civilization.defenseTierNote', {}, '文明レベルと同じTierまでMAP上の既設設備を個別に強化できます。')}</p><div class="defenseTierGrid compactReference">${defenseTierCatalog(state, this.i18n)}</div><h2>${this.htmlMsg('civilization.squadReferenceTitle', {}, '派兵部隊')}</h2><p class="sectionNote">${escapeHtml(referenceSquadsNote)}</p><div class="defenseTierGrid compactReference">${friendlyUnitCatalog(state, this.i18n)}</div>`)}
    `;
  }
}
