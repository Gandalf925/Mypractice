import {
  CIVILIZATIONS, CIVILIZATION_PROJECTS, DEFENSE_LINES, PRODUCTION_RECIPES,
  RESOURCE_KEYS, RESOURCE_LABELS, SETTLEMENT_BUILDINGS
} from '../civilization/data.js';
import { bundleText, currentCivilization } from '../civilization/inventory-system.js';
import { evaluateProject } from '../civilization/progression-system.js';
import { queryRequired, setVisible } from './dom.js';
import { baseLimitForCivilization } from '../base/player-bases.js';
import { fieldBaseLimitForCivilization, fieldBaseSlotsUsed } from '../base/field-bases.js';
import { FRIENDLY_SQUAD_DEFINITIONS, FRIENDLY_SQUAD_TYPES } from '../combat/friendly-force-system.js';

function formatDuration(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours) return `${hours}時間${minutes ? `${minutes}分` : ''}`;
  if (minutes) return `${minutes}分${secs ? `${secs}秒` : ''}`;
  return `${secs}秒`;
}


const DEFENSE_LINE_LABELS = Object.freeze({
  barrier: '防壁', single: '単体攻撃', area: '範囲攻撃', slow: '減速支援', repair: '自動修復',
  medical: '主要拠点治療', fieldAid: '簡易拠点救護', survey: '道路測量', gate: '門'
});

function defenseTierCatalog(state) {
  const level = Math.max(0, Math.min(4, Number(state.civilization?.level) || 0));
  return Object.entries(DEFENSE_LINE_LABELS).map(([line, label]) => {
    const minimum = line === 'gate' ? 2 : ['survey', 'medical', 'fieldAid'].includes(line) ? 1 : 0;
    if (level < minimum) {
      return `<div class="defenseTierCard is-locked"><small>${label}</small><strong>文明Lv.${minimum}で解禁</strong><span>現在は利用できません</span></div>`;
    }
    let tier = level;
    while (tier >= minimum && !DEFENSE_LINES[line]?.[tier]) tier -= 1;
    const current = DEFENSE_LINES[line]?.[tier];
    const next = tier < 4 ? DEFENSE_LINES[line]?.[tier + 1] : null;
    return `<div class="defenseTierCard"><small>${label}・強化上限 Tier ${tier}</small><strong>${current?.name ?? '未定義'}</strong><span>${next ? `次：文明Lv.${tier + 1}で${next.name}` : '最終Tier解禁済み'}</span></div>`;
  }).join('');
}


function friendlyUnitCatalog(state) {
  const level = Math.max(0, Math.min(4, Number(state.civilization?.level) || 0));
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
    bronzeDefenses: '青銅設備', bronzeDefenseKinds: '青銅設備の種類', wallAtLeast2: '石壁以上'
  };
  return RESOURCE_LABELS[check.key] ?? SETTLEMENT_BUILDINGS[check.key]?.name ?? labels[check.key] ?? check.key;
}

export class CivilizationUi {
  constructor({ store, civilizationSystem, notifications, persist }) {
    this.store = store;
    this.system = civilizationSystem;
    this.notifications = notifications;
    this.persist = persist;
    this.panel = queryRequired('#civilizationPanel');
    this.body = queryRequired('#civilizationBody');
    this.resourceSummary = queryRequired('#resourceSummary');
    this.lastPanelRenderAt = 0;
    queryRequired('#civilizationButton').addEventListener('click', () => this.open());
    queryRequired('#closeCivilization').addEventListener('click', () => this.close());
    this.body.addEventListener('click', event => this.handleAction(event));
  }

  open() {
    this.render();
    setVisible(this.panel, true);
  }

  close() {
    setVisible(this.panel, false);
  }

  mutate(action, reason) {
    let result;
    this.store.mutate(state => { result = action(state); }, reason, { emit: true, validate: true });
    if (!result?.ok) this.notifications.show(result?.reason ?? '操作できません。');
    else this.persist?.();
    this.render();
    return result;
  }

  handleAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, resource, type, buildingId, recipeId } = button.dataset;
    if (action === 'contribute') {
      const result = this.mutate(state => this.system.progression.contribute(state, resource), 'civilization:contribute');
      if (result?.ok) this.notifications.show(`${RESOURCE_LABELS[resource]}を${result.amount}納入しました。`);
    } else if (action === 'withdraw') {
      this.mutate(state => this.system.progression.withdraw(state), 'civilization:withdraw');
    } else if (action === 'start-project') {
      this.mutate(state => this.system.progression.start(state), 'civilization:start-project');
    } else if (action === 'build-building') {
      const result = this.mutate(state => this.system.settlement.build(state, type), 'civilization:build');
      if (result?.ok) this.notifications.show(`${SETTLEMENT_BUILDINGS[type].name}を建設しました。`);
    } else if (action === 'produce') {
      const result = this.mutate(state => this.system.production.enqueue(state, buildingId, recipeId, 1), 'civilization:produce');
      if (result?.ok) this.notifications.show(`${PRODUCTION_RECIPES[recipeId].name}を生産キューへ追加しました。`);
    } else if (action === 'repair-building') {
      this.mutate(state => this.system.settlement.repair(state, buildingId), 'civilization:repair-building');
    } else if (action === 'demolish-building') {
      this.mutate(state => this.system.settlement.demolish(state, buildingId), 'civilization:demolish-building');
    } else if (action === 'collect-output') {
      this.mutate(state => this.system.production.collectOutput(state, buildingId), 'civilization:collect-output');
    }
  }

  update() {
    this.updateSummary();
    if (!this.panel.hidden && Date.now() - this.lastPanelRenderAt >= 1000) this.render();
  }

  updateSummary() {
    const state = this.store.select(value => value);
    const important = ['wood', 'stone', 'fiber', 'timber', 'cutStone', 'bronzeIngot', 'wroughtIron'];
    this.resourceSummary.textContent = important
      .filter(key => (state.inventory.resources[key] ?? 0) > 0 || ['wood', 'stone', 'fiber'].includes(key))
      .map(key => `${RESOURCE_LABELS[key]} ${Math.floor(state.inventory.resources[key] ?? 0)}`)
      .join('・');
  }

  render() {
    const state = this.store.select(value => value);
    this.updateSummary();
    this.lastPanelRenderAt = Date.now();
    const civilization = currentCivilization(state);
    const project = state.civilization.project;
    const evaluation = evaluateProject(state, { create: false });
    const resources = RESOURCE_KEYS
      .filter(key => (state.inventory.resources[key] ?? 0) > 0 || (state.inventory.overflow[key]?.amount ?? 0) > 0)
      .map(key => {
        const overflow = state.inventory.overflow[key]?.amount ?? 0;
        return `<div class="resourceRow"><span>${RESOURCE_LABELS[key]}</span><strong>${Math.floor(state.inventory.resources[key] ?? 0)}</strong>${overflow ? `<small>保留 ${overflow}</small>` : ''}</div>`;
      }).join('') || '<p class="emptyText">保有資源はありません。</p>';

    let projectHtml = '<p class="emptyText">最高文明へ到達しています。</p>';
    if (project) {
      const definition = CIVILIZATION_PROJECTS[project.targetLevel];
      const contributions = Object.entries(definition.contributions).map(([key, required]) => {
        const current = project.contributions[key] ?? 0;
        const available = state.inventory.resources[key] ?? 0;
        return `<div class="requirementRow ${current >= required ? 'complete' : ''}"><span>${RESOURCE_LABELS[key]} ${current}/${required}</span><button data-action="contribute" data-resource="${key}" ${available <= 0 || ['BUILDING','PAUSED'].includes(project.status) ? 'disabled' : ''}>最大納入</button></div>`;
      }).join('');
      const conditions = evaluation.checks.filter(check => check.kind !== 'resource').map(check =>
        `<div class="conditionRow ${check.complete ? 'complete' : ''}"><span>${check.complete ? '✓' : '○'} ${checkLabel(check)}</span><strong>${Math.floor(check.current)}/${Math.floor(check.required)}</strong></div>`
      ).join('');
      const remaining = Math.max(0, project.durationSec - (project.progressedSec ?? 0));
      projectHtml = `
        <h3>${CIVILIZATIONS[project.targetLevel].name}への発展</h3>
        <p class="sectionNote">状態：${project.status}${project.status === 'BUILDING' ? `・残り ${formatDuration(remaining)}` : ''}</p>
        <div class="requirementList">${contributions}${conditions}</div>
        <div class="buttonRow">
          <button data-action="withdraw" ${['BUILDING','PAUSED'].includes(project.status) ? 'disabled' : ''}>納入を戻す</button>
          <button class="primary" data-action="start-project" ${!evaluation.complete || project.status === 'BUILDING' ? 'disabled' : ''}>建設開始</button>
        </div>`;
    }

    const buildingCatalog = Object.entries(SETTLEMENT_BUILDINGS)
      .filter(([, definition]) => definition.level <= state.civilization.level)
      .map(([type, definition]) => {
        const count = state.civilization.buildings.filter(building => building.type === type && !building.demolished).length;
        return `<div class="catalogCard"><div><strong>${definition.name}</strong><small>所有 ${count}・費用 ${bundleText(definition.cost)}</small></div><button data-action="build-building" data-type="${type}">建設</button></div>`;
      }).join('') || '<p class="emptyText">文明発展後に集落施設が解放されます。</p>';

    const production = state.civilization.buildings.filter(building => !building.demolished).map(building => {
      const definition = SETTLEMENT_BUILDINGS[building.type];
      const recipes = this.system.production.availableRecipes(state, building);
      const queue = state.civilization.productionQueues.find(item => item.buildingId === building.id);
      const current = building.ruined ? '破壊済み' : queue?.current ? `${PRODUCTION_RECIPES[queue.current.recipeId].name} ${Math.floor(queue.current.elapsedSec)}/${queue.current.durationSec}秒` : queue?.waitingForResources ? '資源待ち' : '待機中';
      const buffer = bundleText(building.outputBuffer ?? {});
      return `<div class="productionCard ${building.ruined ? 'is-ruined' : ''}"><strong>${definition.name}</strong><small>耐久 ${Math.ceil(building.hp)}/${building.maxHp}・${current}</small>${buffer !== 'なし' ? `<small>保留：${buffer}</small>` : ''}<div class="recipeButtons">${recipes.map(recipe => `<button data-action="produce" data-building-id="${building.id}" data-recipe-id="${recipe.id}" ${building.ruined ? 'disabled' : ''}>${recipe.name}<small>${bundleText(recipe.input)}</small></button>`).join('') || '<span>生産レシピなし</span>'}</div><div class="buttonRow">${building.hp < building.maxHp ? `<button data-action="repair-building" data-building-id="${building.id}">修理</button>` : ''}${buffer !== 'なし' ? `<button data-action="collect-output" data-building-id="${building.id}">保留品を回収</button>` : ''}<button data-action="demolish-building" data-building-id="${building.id}">解体</button></div></div>`;
    }).join('') || '<p class="emptyText">生産施設はまだありません。</p>';

    const outposts = state.world.outposts.map(outpost => `<div class="conditionRow complete"><span>前哨地 ${outpost.sourceBaseType}</span><strong>${outpost.status}</strong></div>`).join('') || '<p class="emptyText">制圧済み前哨地はありません。</p>';

    this.body.innerHTML = `
      <section class="civilizationOverview"><div><span>文明</span><strong>${civilization.name}</strong></div><div><span>中央施設</span><strong>${civilization.central}</strong></div><div><span>集落建設枠</span><strong>${state.civilization.buildings.filter(item => !item.demolished).length}/${civilization.slots}</strong></div><div><span>拠点上限</span><strong>主要 ${baseLimitForCivilization(state.civilization.level)}・簡易 ${fieldBaseSlotsUsed(state)}/${fieldBaseLimitForCivilization(state.civilization.level)}</strong></div></section>
      <section><h2>資源</h2><div class="resourceGrid">${resources}</div></section>
      <section><h2>文明発展</h2>${projectHtml}</section>
      <section><h2>防衛設備Tier</h2><p class="sectionNote">通常設備はTier 0、測量施設は文明Lv.1でTier 1から建設できます。文明レベルと同じTierまで、MAP上の既設設備を個別に強化できます。</p><div class="defenseTierGrid">${defenseTierCatalog(state)}</div></section>
      <section><h2>派兵部隊</h2><p class="sectionNote">文明レベルごとに役割の異なる部隊が解禁されます。簡易拠点から派兵できるのは突撃部隊と遊撃部隊だけです。</p><div class="defenseTierGrid">${friendlyUnitCatalog(state)}</div></section>
      <section><h2>集落施設</h2><div class="catalogGrid">${buildingCatalog}</div></section>
      <section><h2>生産</h2>${production}</section>
      <section><h2>前哨地</h2>${outposts}</section>`;
  }
}
