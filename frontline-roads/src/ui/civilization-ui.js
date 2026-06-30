import {
  CIVILIZATIONS, CIVILIZATION_PROJECTS, DEFENSE_LINES, PRODUCTION_RECIPES,
  RESOURCE_KEYS, RESOURCE_LABELS, SETTLEMENT_BUILDINGS, MAX_CIVILIZATION_LEVEL
} from '../civilization/data.js';
import { bundleText, currentCivilization, hasBundle } from '../civilization/inventory-system.js';
import { evaluateProject, projectContributionReserve, safeProjectContributionAmount } from '../civilization/progression-system.js';
import { bindDismissibleModal, queryRequired, setVisible } from './dom.js';
import { usedSettlementSlots, settlementSlotLimit, isStorageBuildingType } from '../civilization/settlement-system.js';
import { baseLimitForCivilization } from '../base/player-bases.js';
import { fieldBaseLimitForCivilization, fieldBaseSlotsUsed } from '../base/field-bases.js';
import { diagnoseFieldBaseNetwork } from '../base/field-base-system.js';
import {
  FRIENDLY_SQUAD_DEFINITIONS, FRIENDLY_SQUAD_TYPES, friendlyGlobalCommandStatus, friendlySquadCapacityForBase
} from '../combat/friendly-force-system.js';

function formatDuration(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours) return `${hours}時間${minutes ? `${minutes}分` : ''}`;
  if (minutes) return `${minutes}分${secs ? `${secs}秒` : ''}`;
  return `${secs}秒`;
}

function limitText(value) { return Number.isFinite(value) ? String(value) : '上限なし'; }

function resourceAmountParts(state, key) {
  const stored = Math.floor(state.inventory.resources[key] ?? 0);
  const category = RESOURCE_CATEGORY_BY_KEY[key];
  const capacity = Math.floor(state.inventory.capacity?.[category] ?? 0);
  return { stored, capacity };
}

function buildingBuildStatus(state, type) {
  const definition = SETTLEMENT_BUILDINGS[type];
  if (!definition) return { ok: false, label: '未定義', reason: '不明な施設です。' };
  if (definition.level > (state.civilization?.level ?? 0)) return { ok: false, label: '未解禁', reason: `文明Lv.${definition.level}で解禁` };
  const existing = state.civilization.buildings.filter(building => building.type === type).length;
  if (definition.limit && existing >= definition.limit) return { ok: false, label: '上限', reason: '建設上限に達しています。' };
  const sameStorageSlot = isStorageBuildingType(type) && existing > 0;
  if (usedSettlementSlots(state) >= settlementSlotLimit(state) && !sameStorageSlot) return { ok: false, label: '枠不足', reason: '集落の建設枠がありません。' };
  if (!hasBundle(state, definition.cost)) return { ok: false, label: '資源不足', reason: `不足：${bundleText(definition.cost)}` };
  return { ok: true, label: '建設', reason: '建設できます。' };
}

function recipeSummaryText(recipe) {
  const input = bundleText(recipe.input);
  const output = bundleText(recipe.output);
  const projectNote = recipe.projectDelivery ? '・発展計画へ優先納入' : '';
  return `投入 ${input}・完成 ${output}・${formatDuration(recipe.seconds)}${projectNote}`;
}

const PROJECT_STATUS_LABELS = Object.freeze({
  AVAILABLE: '準備中', CONTRIBUTING: '納入中', READY: '建設開始可能', BUILDING: '建設中', PAUSED: '一時停止'
});

function projectStatusLabel(status) { return PROJECT_STATUS_LABELS[status] ?? '準備中'; }

function checkProgressText(check) {
  if (check.key === 'cityHpStreak') return `${formatDuration(check.current)}/${formatDuration(check.required)}`;
  return `${Math.floor(check.current)}/${Math.floor(check.required)}`;
}

function tabButton(id, label, active) {
  return `<button type="button" data-ui-tab="${id}" class="${active === id ? 'active' : ''}">${label}</button>`;
}

function tabPanel(id, active, html) {
  return `<section class="uiTabPanel ${active === id ? 'active' : ''}" data-panel="${id}">${html}</section>`;
}

const RESOURCE_CATEGORIES = Object.freeze([
  ['base', '基本資材', ['wood', 'stone', 'fiber']],
  ['processed', '加工資材', ['timber', 'rope', 'cutStone', 'charcoal']],
  ['ore', '鉱石', ['copperOre', 'tinOre', 'ironOre']],
  ['metal', '金属・部品', ['copperIngot', 'tinIngot', 'bronzeIngot', 'ironBloom', 'wroughtIron', 'steel', 'mechanism']]
]);
const RESOURCE_CATEGORY_BY_KEY = Object.freeze(Object.fromEntries(
  RESOURCE_CATEGORIES.flatMap(([category, , keys]) => keys.map(key => [key, category]))
));


const CAPACITY_CATEGORY_LABELS = Object.freeze({
  base: '基本資材', processed: '加工資材', ore: '鉱石', metal: '金属・部品'
});

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

function storageBonusText(definition, count = 1) {
  const bonus = storageCapacityBonus(definition, count);
  const entries = Object.entries(bonus).filter(([, amount]) => amount > 0);
  return entries.length
    ? entries.map(([category, amount]) => `${CAPACITY_CATEGORY_LABELS[category] ?? category} +${amount}`).join('・')
    : '保管上限の増加なし';
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

function storageSummaryMarkup(state) {
  const groups = storageGroups(state);
  if (!groups.length) return '<p class="emptyText">倉庫系施設は未建設です。</p>';
  return `<div class="storageEffectGrid">${groups.map(group => {
    const count = group.buildings.length;
    const damaged = group.buildings.filter(building => building.hp < building.maxHp).length;
    return `<article class="storageEffectCard"><header><strong>${group.definition.name}</strong><small>稼働 ${count}基・建設枠 1・${damaged ? `損傷 ${damaged}基` : '全基稼働'}</small></header><p>${storageBonusText(group.definition, count)}</p></article>`;
  }).join('')}</div>`;
}

function storageActionButtons(group) {
  const damaged = group.buildings.find(building => building.hp < building.maxHp);
  const newest = [...group.buildings].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))[0];
  return `<div class="buttonRow">${damaged ? `<button data-action="repair-building" data-building-id="${damaged.id}">損傷1基を修理</button>` : ''}<button data-action="demolish-building" data-building-id="${newest?.id ?? ''}">1基を解体</button></div>`;
}

function resourceCategorySections(state) {
  return RESOURCE_CATEGORIES.map(([, label, keys]) => {
    const rows = keys
      .filter(key => (state.inventory.resources[key] ?? 0) > 0)
      .map(key => {
        const { stored, capacity } = resourceAmountParts(state, key);
        return `<div class="resourceRow compact"><span>${RESOURCE_LABELS[key]}</span><strong>${stored}/${capacity}</strong></div>`;
      }).join('') || '<p class="emptyText">該当資材なし</p>';
    return `<details class="compactDisclosure resourceCategory" open><summary>${label}</summary><div class="resourceGrid">${rows}</div></details>`;
  }).join('');
}


const DEFENSE_LINE_LABELS = Object.freeze({
  barrier: '防壁', single: '単体攻撃', area: '範囲攻撃', slow: '減速支援', repair: '自動修復',
  medical: '範囲回復', fieldBarracks: '前線兵舎', survey: '道路測量', gate: '門'
});

function defenseTierCatalog(state) {
  const level = Math.max(0, Math.min(MAX_CIVILIZATION_LEVEL, Number(state.civilization?.level) || 0));
  return Object.entries(DEFENSE_LINE_LABELS).map(([line, label]) => {
    const minimum = line === 'gate' ? 2 : ['survey', 'medical', 'fieldBarracks'].includes(line) ? 1 : 0;
    if (level < minimum) {
      return `<div class="defenseTierCard is-locked"><small>${label}</small><strong>文明Lv.${minimum}で解禁</strong><span>現在は利用できません</span></div>`;
    }
    let tier = level;
    while (tier >= minimum && !DEFENSE_LINES[line]?.[tier]) tier -= 1;
    const current = DEFENSE_LINES[line]?.[tier];
    const next = tier < MAX_CIVILIZATION_LEVEL ? DEFENSE_LINES[line]?.[tier + 1] : null;
    return `<div class="defenseTierCard"><small>${label}・強化上限 Tier ${tier}</small><strong>${current?.name ?? '未定義'}</strong><span>${next ? `次：文明Lv.${tier + 1}で${next.name}` : '最終Tier解禁済み'}</span></div>`;
  }).join('');
}


function friendlyUnitCatalog(state) {
  const level = Math.max(0, Math.min(MAX_CIVILIZATION_LEVEL, Number(state.civilization?.level) || 0));
  return FRIENDLY_SQUAD_TYPES.map(type => {
    const definition = FRIENDLY_SQUAD_DEFINITIONS[type];
    const unlocked = level >= definition.unlockLevel;
    const bases = definition.allowedBaseKinds.includes('FIELD') ? '主要・簡易拠点' : '主要拠点のみ';
    return `<div class="defenseTierCard ${unlocked ? '' : 'is-locked'}"><small>${definition.role}・${bases}</small><strong>${definition.name}</strong><span>${unlocked ? definition.description : `文明Lv.${definition.unlockLevel}で解禁`}</span></div>`;
  }).join('');
}

function checkLabel(check) {
  const labels = {
    totalKills: '敵撃破', totalCampsCaptured: '敵拠点破壊', totalRepairHpPaid: '資源を使った修理',
    totalProduced: '加工資材の生産', selfProducedBronze: '自作青銅塊', selfProducedWroughtIron: '自作鍛鉄',
    perfectWaveStreak: '完全防衛連続数', activeFieldBases: '稼働中の簡易拠点',
    copperCampsCaptured: '銅鉱野営地制圧', tinCampsCaptured: '錫鉱野営地制圧',
    ironCampsCaptured: '鉄鉱野営地制圧', siegeCaptainsDefeated: '攻城隊長撃破',
    cityHpStreak: '都市耐久の連続維持', recoveredArtifacts: '現地回収した特殊アイテム', barrier0: '丸太柵', single0: '投石台',
    otherDefense0: 'その他の防衛設備', upgradedDefenses: '改良済み防衛設備',
    upgradedDefenseKinds: '改良設備の種類', barrier2: '石壁', gate2: '石門', gate3: '青銅門',
    bronzeDefenses: '青銅設備', bronzeDefenseKinds: '青銅設備の種類', wallAtLeast2: '石壁以上',
    ironDefenses: '鉄器設備', ironDefenseKinds: '鉄器設備の種類', gate4: '鉄門',
    steelDefenses: '鋼鉄設備', steelDefenseKinds: '鋼鉄設備の種類', gate5: '鋼鉄門',
    mechanismDefenses: '機械設備', mechanismDefenseKinds: '機械設備の種類', gate6: '機関門',
    selfProducedSteel: '自作鋼材', selfProducedMechanism: '自作機構部品',
    generation5CommandersDefeated: '鋼鉄隊長撃破', generation6CommandersDefeated: '戦列指揮官撃破',
    machineWorksCaptured: '機械工廠制圧'
  };
  return RESOURCE_LABELS[check.key] ?? SETTLEMENT_BUILDINGS[check.key]?.name ?? labels[check.key] ?? check.key;
}

const DEFENSE_BUILDING_CHECKS = new Set([
  'barrier0', 'single0', 'otherDefense0', 'upgradedDefenses', 'upgradedDefenseKinds',
  'barrier2', 'gate2', 'gate3', 'bronzeDefenses', 'bronzeDefenseKinds', 'wallAtLeast2',
  'ironDefenses', 'ironDefenseKinds', 'gate4', 'steelDefenses', 'steelDefenseKinds', 'gate5',
  'mechanismDefenses', 'mechanismDefenseKinds', 'gate6'
]);

export function projectCheckGuidance(check, state) {
  if (!check || check.complete) return '';
  if (check.kind === 'artifact') return '敵拠点を破壊し、残された回収物を現地回収するか回収部隊で拠点へ持ち帰ります。';
  if (check.kind === 'building') {
    if (SETTLEMENT_BUILDINGS[check.key]) return '「文明」画面の集落施設から建設します。枠が不足している場合は不要施設を解体できます。';
    if (DEFENSE_BUILDING_CHECKS.has(check.key)) return 'MAPで対象設備を建設し、既設設備を選択して必要なTierまで強化します。門は防壁を選択して変換します。';
    return 'MAPまたは「文明」画面から必要な施設を建設します。';
  }
  const guidance = {
    totalKills: '防衛戦または派兵で敵部隊を撃破します。',
    totalCampsCaptured: '敵拠点を選択して部隊を派兵し、拠点HPを0にします。',
    totalRepairHpPaid: '損傷した防衛設備を選択し、資源を使って手動修理します。',
    totalProduced: '対応する集落施設を建設し、生産予約を実行します。',
    selfProducedBronze: '銅炉・錫炉・試験青銅炉または青銅工房を使い、自分の施設で青銅を生産します。',
    selfProducedWroughtIron: '塊鉄炉で鉄塊を作り、鍛冶場で鍛鉄へ加工します。',
    selfProducedSteel: '製鋼炉で鍛鉄と木炭から鋼材を生産します。敵拠点の報酬だけでは加算されません。',
    selfProducedMechanism: '機構工房で鋼材・加工木材・縄から機構部品を生産します。敵拠点の報酬だけでは加算されません。',
    perfectWaveStreak: '敵を都市へ到達させずに通常ウェーブを全滅させると1回加算されます。突破されると連続数は0へ戻ります。',
    activeFieldBases: 'BASESから道路上へ簡易拠点を設置します。既存拠点と建設圏が重ならない地点を選びます。',
    copperCampsCaptured: '「Cu」と表示される銅鉱野営地を破壊します。',
    tinCampsCaptured: '「Sn」と表示される錫鉱野営地を破壊します。',
    ironCampsCaptured: '「Fe」と表示される鉄鉱野営地を破壊します。',
    siegeCaptainsDefeated: '青銅期以降の攻城部隊に現れる攻城隊長を撃破します。',
    generation5CommandersDefeated: '鋼鉄世代のウェーブに現れる鋼鉄隊長を撃破します。',
    generation6CommandersDefeated: '機械世代のウェーブに現れる戦列指揮官を撃破します。',
    machineWorksCaptured: '「Mc」と表示される機械工廠を破壊します。',
    cityHpStreak: `都市HPを${Math.floor(Number(check.threshold) || 70)}以上に保ちます。下回ると維持時間は0から再計測されます。`
  };
  return guidance[check.key] ?? '条件に対応する戦闘・建設・生産を進めます。';
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

  localize(text = '') { return this.i18n?.copy?.(text) ?? text; }

  shortLabel(text = '') { return this.i18n?.short?.(text) ?? this.localize(text); }

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
    if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? '操作できません。'));
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
        return total > 0 ? { ok: true, amount: total } : { ok: false, reason: '予備を残して一括納入できる資源がありません。' };
      }, 'civilization:contribute-safe-all');
      if (result?.ok) this.notifications.show(this.localize(`予備を残して合計${result.amount}資材を納入しました。`));
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
        return total > 0 ? { ok: true, amount: total } : { ok: false, reason: '加工・金属資材を除外し、予備を残して納入できる資源がありません。' };
      }, 'civilization:contribute-safe-basic');
      if (result?.ok) this.notifications.show(this.localize(`加工・金属資材を除外し、合計${result.amount}資材を納入しました。`));
    } else if (action === 'contribute-safe') {
      const result = this.transaction(state => this.system.progression.contributeSafely(state, resource), 'civilization:contribute-safe');
      if (result?.ok) this.notifications.show(this.localize(`${RESOURCE_LABELS[resource]} ${result.amount}を納入しました。`));
    } else if (action === 'contribute-all') {
      const result = this.transaction(state => this.system.progression.contribute(state, resource), 'civilization:contribute-all');
      if (result?.ok) this.notifications.show(this.localize(`${RESOURCE_LABELS[resource]} ${result.amount}を納入しました。`));
    } else if (action === 'withdraw') {
      this.transaction(state => this.system.progression.withdraw(state), 'civilization:withdraw');
    } else if (action === 'start-project') {
      this.transaction(state => this.system.progression.start(state), 'civilization:start-project');
    } else if (action === 'build-building') {
      const result = this.transaction(state => this.system.settlement.build(state, type), 'civilization:build');
      if (result?.ok) this.notifications.show(this.localize(`${SETTLEMENT_BUILDINGS[type].name}を建設しました。`));
    } else if (action === 'produce') {
      const result = this.transaction(state => {
        const requested = quantity === 'max'
          ? this.system.production.maximumProducible(state, buildingId, recipeId).quantity
          : Math.max(1, Number(quantity) || 1);
        if (requested <= 0) return this.system.production.maximumProducible(state, buildingId, recipeId);
        return this.system.production.enqueue(state, buildingId, recipeId, requested);
      }, 'civilization:produce');
      if (result?.ok) this.notifications.show(this.localize(`${PRODUCTION_RECIPES[recipeId].name} ${result.quantity}個、生産予約しました。`));
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
      const cap = `${this.localize('上限')} ${capacity}`;
      return `<span class="resourceChip" data-resource="${key}"><small>${label}</small><strong>${stored}</strong><em>${cap}</em></span>`;
    }).join('');
    this.resourceSummary.setAttribute(
      'aria-label',
      this.localize(visibleResources.map(key => {
        const { stored, capacity } = resourceAmountParts(state, key);
        return `${RESOURCE_LABELS[key]} ${stored}、上限 ${capacity}`;
      }).join('、'))
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
        return `<div class="resourceRow"><span>${RESOURCE_LABELS[key]}</span><strong>${stored}/${capacity}</strong></div>`;
      }).join('') || '<p class="emptyText">保有資源はありません。</p>';

    let projectHtml = '<p class="emptyText">最高文明へ到達しています。</p>';
    if (project) {
      const definition = CIVILIZATION_PROJECTS[project.targetLevel];
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
        const guidance = gap > 0
          ? `${RESOURCE_LABELS[key]}があと${gap}必要です。${reserve ? `防衛・建設用に${reserve}を残して納入できます。` : '所持分を納入できます。'}`
          : '必要量を納入済みです。';
        return `<div class="requirementRow ${check.complete ? 'complete' : 'missing'}"><span>${check.complete ? '✓' : '不足'} ${RESOURCE_LABELS[key]} ${current}/${required}${reserve ? `<small>防衛予備 ${reserve}</small>` : ''}<small>${guidance}</small></span><div class="contributionButtons"><button data-action="contribute-safe" data-resource="${key}" ${safeAmount <= 0 || locked ? 'disabled' : ''}>予備を残す${safeAmount > 0 ? ` ${safeAmount}` : ''}</button><button data-action="contribute-all" data-resource="${key}" ${available <= 0 || locked ? 'disabled' : ''}>全量納入</button></div></div>`;
      };
      const conditionRow = check => {
        const fieldDiagnostic = check.key === 'activeFieldBases' ? diagnoseFieldBaseNetwork(state, check.required) : null;
        const guidance = fieldDiagnostic?.guidance ?? projectCheckGuidance(check, state);
        return `<div class="conditionRow ${check.complete ? 'complete' : 'missing'}"><span>${check.complete ? '✓' : '不足'} ${checkLabel(check)}${guidance ? `<small>${guidance}</small>` : ''}</span><strong>${checkProgressText(check)}</strong></div>`;
      };
      const missingRows = [
        ...resourceChecks.filter(check => !check.complete).map(contributionRow),
        ...otherChecks.filter(check => !check.complete).map(conditionRow)
      ].join('') || '<div class="conditionRow complete"><span>✓ 現在の発展条件はすべて達成済みです。</span><strong>OK</strong></div>';
      const completedRows = [
        ...resourceChecks.filter(check => check.complete).map(contributionRow),
        ...otherChecks.filter(check => check.complete).map(conditionRow)
      ].join('') || '<p class="emptyText">達成済み条件はまだありません。</p>';
      const remaining = Math.max(0, project.durationSec - (project.progressedSec ?? 0));
      projectHtml = `
        <h3>${CIVILIZATIONS[project.targetLevel].name}への発展</h3>
        <p class="sectionNote">状態：${projectStatusLabel(project.status)}${project.status === 'BUILDING' ? `・残り ${formatDuration(remaining)}` : ''}</p>
        <div class="civilizationProgressBox"><strong>${progressPercent}%</strong><span>${completeCount}/${allChecks.length} 条件達成</span></div>
        <div class="buttonRow">
          <button data-action="contribute-safe-basic" ${locked ? 'disabled' : ''}>基本資源だけ予備を残して一括納入</button>
          <button data-action="contribute-safe-all" ${locked ? 'disabled' : ''}>不足分を予備を残して一括納入</button>
        </div>
        <h4>不足している条件</h4>
        <div class="requirementList missingFirst">${missingRows}</div>
        <details class="completedRequirements" data-ui-disclosure="civilization.completedRequirements"${this.disclosureOpen('civilization.completedRequirements') ? ' open' : ''}><summary>達成済み条件 ${completeCount}件</summary><div class="requirementList">${completedRows}</div></details>
        <div class="buttonRow">
          <button data-action="withdraw" ${locked ? 'disabled' : ''}>納入を戻す</button>
          <button class="primary" data-action="start-project" ${!evaluation.complete || project.status === 'BUILDING' ? 'disabled' : ''}>建設開始</button>
        </div>`;
    }

    const unlockedBuildings = Object.entries(SETTLEMENT_BUILDINGS)
      .filter(([, definition]) => definition.level <= state.civilization.level);
    const storageCatalog = unlockedBuildings
      .filter(([type]) => isStorageBuildingType(type))
      .map(([type, definition]) => {
        const count = state.civilization.buildings.filter(building => building.type === type).length;
        const status = buildingBuildStatus(state, type);
        return `<div class="catalogCard storageCatalogCard"><div><strong>${definition.name}</strong><p>${definition.description}</p><small>所有 ${count}基・建設枠は同種で1枠・費用 ${bundleText(definition.cost)}</small><small>効果：${storageBonusText(definition, Math.max(1, count || 1))}</small>${!status.ok ? `<small class="statusWarning">${status.reason}</small>` : ''}</div><button data-action="build-building" data-type="${type}" ${status.ok ? '' : 'disabled'}>${status.label}</button></div>`;
      }).join('') || '<p class="emptyText">倉庫系施設はまだ解放されていません。</p>';
    const productiveCatalog = unlockedBuildings
      .filter(([type]) => !isStorageBuildingType(type))
      .map(([type, definition]) => {
        const count = state.civilization.buildings.filter(building => building.type === type).length;
        const status = buildingBuildStatus(state, type);
        return `<div class="catalogCard"><div><strong>${definition.name}</strong><p>${definition.description}</p><small>所有 ${count}・費用 ${bundleText(definition.cost)}</small>${!status.ok ? `<small class="statusWarning">${status.reason}</small>` : ''}</div><button data-action="build-building" data-type="${type}" ${status.ok ? '' : 'disabled'}>${status.label}</button></div>`;
      }).join('') || '<p class="emptyText">生産施設はまだ解放されていません。</p>';
    const storageOperations = storageGroups(state).map(group => `<div class="productionCard storageOperationCard"><strong>${group.definition.name}</strong><p class="buildingDescription">${group.definition.description}</p><small>稼働 ${group.buildings.length}基・建設枠 1・保管上限 ${storageBonusText(group.definition, group.buildings.length)}</small>${storageActionButtons(group)}</div>`).join('');
    const buildingCatalog = `<h3>倉庫・保管</h3><p class="sectionNote">同じ倉庫を複数建てても建設枠は1枠として扱い、保管上限の増加効果は合計表示します。</p>${storageSummaryMarkup(state)}${storageOperations ? `<h4>稼働中の倉庫</h4>${storageOperations}` : ''}<div class="catalogGrid compactCatalog">${storageCatalog}</div><h3>生産・加工</h3><div class="catalogGrid compactCatalog">${productiveCatalog}</div>`;

    const productionBuildings = state.civilization.buildings.filter(building => !isStorageBuildingType(building.type));
    const production = productionBuildings.map(building => {
      const definition = SETTLEMENT_BUILDINGS[building.type];
      const recipes = this.system.production.availableRecipes(state, building);
      const queue = state.civilization.productionQueues.find(item => item.buildingId === building.id);
      const summary = this.system.production.queueSummary(state, building.id);
      const current = queue?.current ? `${PRODUCTION_RECIPES[queue.current.recipeId].name} ${Math.floor(queue.current.elapsedSec)}/${queue.current.durationSec}秒` : queue?.waitingForResources ? '資源待ち' : '待機中';
      const buffer = bundleText(building.outputBuffer ?? {});
      const recipeCards = recipes.map(recipe => {
        const maximum = this.system.production.maximumProducible(state, building.id, recipe.id).quantity;
        return `<div class="productionRecipe"><div><strong>${recipe.name}</strong><small>${recipeSummaryText(recipe)}</small>${maximum <= 0 ? '<small class="statusWarning">投入資材が不足しています。</small>' : ''}</div><div class="productionQuantity"><button data-action="produce" data-building-id="${building.id}" data-recipe-id="${recipe.id}" data-quantity="1" ${maximum < 1 ? 'disabled' : ''}>+1</button><button data-action="produce" data-building-id="${building.id}" data-recipe-id="${recipe.id}" data-quantity="5" ${maximum < 5 ? 'disabled' : ''}>+5</button><button data-action="produce" data-building-id="${building.id}" data-recipe-id="${recipe.id}" data-quantity="10" ${maximum < 10 ? 'disabled' : ''}>+10</button><button data-action="produce" data-building-id="${building.id}" data-recipe-id="${recipe.id}" data-quantity="max" ${maximum <= 0 ? 'disabled' : ''}>最大 ${maximum}</button></div></div>`;
      }).join('') || '<span>稼働レシピ未解禁</span>';
      return `<div class="productionCard"><strong>${definition.name}</strong><p class="buildingDescription">${definition.description}</p><small>耐久 ${Math.ceil(building.hp)}/${building.maxHp}・${current}${summary.pendingUnits ? `・予約残 ${summary.pendingUnits}` : ''}</small>${buffer !== 'なし' ? `<small>未回収：${buffer}</small>` : ''}<div class="recipeButtons">${recipeCards}</div><div class="buttonRow">${building.hp < building.maxHp ? `<button data-action="repair-building" data-building-id="${building.id}">修理</button>` : ''}${buffer !== 'なし' ? `<button data-action="collect-output" data-building-id="${building.id}">未回収品を回収</button>` : ''}<button data-action="demolish-building" data-building-id="${building.id}">解体</button></div></div>`;
    }).join('') || '<p class="emptyText">稼働中の生産施設はまだありません。</p>';


    const active = ['progress', 'resources', 'settlement', 'production', 'reference'].includes(this.activeTab) ? this.activeTab : 'progress';
    const nextName = project ? CIVILIZATIONS[project.targetLevel]?.name : '到達済み';
    this.body.innerHTML = this.localize(`
      <div class="uiTabBar" role="tablist" aria-label="文明画面の表示切替">
        ${tabButton('progress', '発展', active)}
        ${tabButton('resources', '資源', active)}
        ${tabButton('settlement', '施設', active)}
        ${tabButton('production', '生産', active)}
        ${tabButton('reference', '解禁', active)}
      </div>
      <section class="overviewHero civilizationHero">
        <div><small>現在文明</small><strong>Lv.${state.civilization.level} ${civilization.name}</strong><span>${civilization.central}</span></div>
        <div><small>次の目標</small><strong>${nextName}</strong><span>建設枠 ${usedSettlementSlots(state)}/${civilization.slots}</span></div>
        <div><small>拠点上限</small><strong>主要 ${limitText(baseLimitForCivilization(state.civilization.level))}</strong><span>簡易 ${fieldBaseSlotsUsed(state)}/${limitText(fieldBaseLimitForCivilization(state.civilization.level))}</span></div>
      </section>
      ${tabPanel('progress', active, `<h2>文明発展</h2>${projectHtml}`)}
      ${tabPanel('resources', active, `<h2>資源一覧</h2><p class="sectionNote">通常資材は文明・建設・生産で使用します。所持数は保管上限を超えられず、上限超過分は取得されません。戦術素材はITEMS / 戦術工房で管理します。</p><h3>倉庫効果</h3>${storageSummaryMarkup(state)}${resourceCategorySections(state)}`)}
      ${tabPanel('settlement', active, `<h2>集落施設</h2><p class="sectionNote">施設は役割ごとに確認できます。倉庫は同じ種類を複数建てても建設枠は1枠扱いになり、効果は合計されます。</p>${buildingCatalog}`)}
      ${tabPanel('production', active, `<h2>生産</h2><p class="sectionNote">加工・精錬を行う稼働施設だけ表示します。倉庫は資源・施設タブで合計効果を確認します。</p>${production}`)}
      ${tabPanel('reference', active, `<h2>防衛設備Tier</h2><p class="sectionNote">文明レベルと同じTierまでMAP上の既設設備を個別に強化できます。</p><div class="defenseTierGrid compactReference">${defenseTierCatalog(state)}</div><h2>派兵部隊</h2><p class="sectionNote">現在は主要拠点 ${friendlySquadCapacityForBase(state, { kind: 'MAJOR' })}枠、簡易拠点 ${friendlySquadCapacityForBase(state, { kind: 'FIELD' })}枠、全体指揮 ${friendlyGlobalCommandStatus(state).assigned}/${friendlyGlobalCommandStatus(state).capacity}です。簡易拠点からは突撃部隊・遊撃部隊・回収部隊を派兵できます。</p><div class="defenseTierGrid compactReference">${friendlyUnitCatalog(state)}</div>`)}
    `);
  }
}
