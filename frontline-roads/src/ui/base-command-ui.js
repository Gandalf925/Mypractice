import { distance } from '../core/utilities.js';
import { activePlayerBases, baseLimitForCivilization, playerBaseSlotsUsed } from '../base/player-bases.js';
import {
  activeFieldBases,
  fieldBaseLimitForCivilization,
  fieldBaseSlotsUsed
} from '../base/field-bases.js';
import { enemyPosition } from '../combat/enemy-system.js';
import { defenseWorldPosition } from '../combat/combat-geometry.js';
import { bindDismissibleModal, escapeHtml, queryRequired, setVisible } from './dom.js';
import { bundleText } from '../civilization/inventory-system.js';
import { diagnoseFieldBaseNetwork } from '../base/field-base-system.js';
import { friendlySquadCapacityForBase } from '../combat/friendly-force-system.js';
import { fieldBaseBuildRange, majorBaseBuildRange } from '../base/construction-range.js';
import { basePressureProfile, basePressureUiText } from '../base/base-pressure.js';
import { regionControlSummaryText, regionLogisticsSummaryText } from '../base/region-control.js';

const BASE_STATUS_RADIUS_METERS = 300;
const FACILITY_RADIUS_METERS = 120;
function localizedLimit(value, i18n = null) {
  if (Number.isFinite(value)) return String(value);
  return uiText(i18n, '上限なし', { en: 'No limit', zh: '无限' });
}

function tabButton(id, label, active) {
  return `<button type="button" data-ui-tab="${id}" class="${active === id ? 'active' : ''}">${label}</button>`;
}

function tabPanel(id, active, html) {
  return `<section class="uiTabPanel ${active === id ? 'active' : ''}" data-panel="${id}">${html}</section>`;
}

function i18nCopy(i18n, text = '') { return i18n?.copy?.(text) ?? String(text ?? ''); }
function i18nBundle(i18n, bundle = {}) { return i18n?.bundleText?.(bundle) ?? bundleText(bundle); }
function languageCode(i18n) { return i18n?.language ?? 'ja'; }
function uiText(i18n, source = '', translations = {}) {
  const language = languageCode(i18n);
  if (language === 'ja') return String(source ?? '');
  return translations[language] ?? i18nCopy(i18n, source);
}

function baseKindName(kind, i18n = null) {
  const field = kind === 'field' || kind === 'FIELD';
  return uiText(i18n, field ? '簡易拠点' : '主要拠点', {
    en: field ? 'Simple Base' : 'Major Base',
    zh: field ? '简易基地' : '主要基地'
  });
}

function localizedBasePressureText(profile, i18n = null) {
  if (!profile) return uiText(i18n, '敵圧 不明', { en: 'Enemy pressure unknown', zh: '敌压 不明' });
  return i18nCopy(i18n, basePressureUiText(profile));
}

function localizedPlacementReason(i18n, reason = '') {
  const text = String(reason ?? '');
  if (!text) return '';
  return uiText(i18n, text);
}


function localizedDiagnosticGuidance(i18n, text = '') {
  const value = String(text ?? '');
  if (!value) return '';
  return uiText(i18n, value);
}


function defensePoint(state, defense) {
  return defenseWorldPosition(state.world.roadGraph, defense);
}


export function summarizePlayerBase(state, base) {
  const nearbyEnemies = (state.combat.enemies ?? []).filter(enemy => enemy.hp > 0 && distance(base, enemyPosition(state, enemy)) <= BASE_STATUS_RADIUS_METERS).length;
  const facilities = (state.combat.defenses ?? []).filter(defense => defense.hp > 0 && (() => {
    const point = defensePoint(state, defense);
    return point && distance(base, point) <= FACILITY_RADIUS_METERS;
  })()).length;
  const baseSquads = (state.combat.friendlySquads ?? []).filter(squad => squad.originBaseId === base.id && squad.hp > 0);
  const recoveringSquads = baseSquads.filter(squad => squad.status === 'RECOVERING').length;
  const readySquads = baseSquads.filter(squad => squad.status === 'READY').length;
  const activeSquads = baseSquads.length - recoveringSquads - readySquads;
  const squads = baseSquads.length;
  const squadCapacity = friendlySquadCapacityForBase(state, base);
  const recoveryItems = (state.world.recoveryItems ?? []).filter(item => item.status === 'AVAILABLE' && distance(base, state.world.roadGraph?.nodeById?.get(item.nodeId) ?? item) <= BASE_STATUS_RADIUS_METERS).length;
  return {
    nearbyEnemies,
    facilities,
    squads,
    squadCapacity,
    activeSquads,
    recoveringSquads,
    readySquads,
    recoveryItems,
    alert: base.status === 'DESTROYED' || base.hp <= 0
      ? '破壊'
      : nearbyEnemies > 0
        ? '交戦警戒'
        : recoveryItems > 0
          ? '回収物あり'
          : '安定'
  };
}

function baseCard(state, base, { selected, label, field = false, rebuild = null, rebuildKind = null, dismantle = null, dismantleKind = null, i18n = null }) {
  const status = summarizePlayerBase(state, base);
  const destroyed = base.status === 'DESTROYED' || base.hp <= 0;
  const pressure = basePressureProfile(state, base, field ? 'FIELD' : base.primary ? 'PRIMARY' : 'MAJOR');
  const c = text => i18nCopy(i18n, text);
  const t = (source, translations = {}) => uiText(i18n, source, translations);
  const baseName = escapeHtml(c(base.name));
  const baseId = escapeHtml(base.id);
  const baseKind = baseKindName(field ? 'field' : 'major', i18n);
  const targetCap = pressure.kind === 'PRIMARY' ? localizedLimit(Infinity, i18n) : pressure.targetCap;
  const fieldRangeNote = field
    ? `<p class="sectionNote">${t(`建設範囲${fieldBaseBuildRange(state.civilization?.level)}m。突撃／遊撃／回収部隊を派兵できます。`, {
      en: `Construction range ${fieldBaseBuildRange(state.civilization?.level)} m. Can dispatch Assault, Skirmisher, and Recovery squads.`,
      zh: `建设范围 ${fieldBaseBuildRange(state.civilization?.level)}m。可派遣突击、游击和回收部队。`
    })}</p>`
    : '';
  const pressureNotice = t(`${basePressureUiText(pressure)}・同時標的上限 ${targetCap}`, {
    en: `${localizedBasePressureText(pressure, i18n)} · simultaneous target cap ${targetCap}`,
    zh: `${localizedBasePressureText(pressure, i18n)} · 同时目标上限 ${targetCap}`
  });
  const squadNotice = t(`派兵中 ${status.activeSquads}・回復中 ${status.recoveringSquads}・再出撃待機 ${status.readySquads}`, {
    en: `Deployed ${status.activeSquads} · Recovering ${status.recoveringSquads} · Ready to redeploy ${status.readySquads}`,
    zh: `派兵中 ${status.activeSquads} · 恢复中 ${status.recoveringSquads} · 可再出击 ${status.readySquads}`
  });
  const regionNotice = escapeHtml(regionControlSummaryText(state, base, i18n));
  const logisticsNotice = escapeHtml(regionLogisticsSummaryText(state, base, i18n));
  const recoveryNotice = status.recoveryItems
    ? `<p class="baseRecoveryNotice">${t(`周辺に未回収アイテム ${status.recoveryItems}`, {
      en: `Unrecovered nearby items ${status.recoveryItems}`,
      zh: `周边未回收物品 ${status.recoveryItems}`
    })}</p>`
    : '';
  const focusLabel = t('この拠点をMAP表示', { en: 'Show this base on MAP', zh: '在地图显示此基地' });
  const rebuildHtml = destroyed && rebuildKind ? (() => {
    const kind = baseKindName(rebuildKind, i18n);
    const button = t(`現地で${kind}を再建`, {
      en: `Rebuild on site: ${kind}`,
      zh: `现场重建${kind}`
    });
    const reason = rebuild?.ok
      ? t('現在地から再建できます。', { en: 'Can rebuild from your current location.', zh: '可从当前位置重建。' })
      : localizedPlacementReason(i18n, rebuild?.reason ?? '現地へ移動してください。');
    return `<button class="secondary wideButton" data-action="rebuild-${rebuildKind}-base" data-base-id="${baseId}" ${rebuild?.ok ? '' : 'disabled'}>${button}</button><p class="sectionNote">${t('費用', { en: 'Cost', zh: '费用' })} ${i18nBundle(i18n, rebuild?.cost)}・${reason}</p>`;
  })() : '';
  const dismantleHtml = dismantleKind ? (() => {
    const kind = baseKindName(dismantleKind, i18n);
    const button = t(`${kind}を撤去`, {
      en: `Dismantle ${kind}`,
      zh: `拆除${kind}`
    });
    const reason = dismantle?.ok
      ? t('撤去すると拠点枠を空け、対象中の敵と部隊は残存主要拠点へ再割当します。', {
        en: 'Dismantling frees a base slot and reassigns enemies and squads targeting it to a remaining major base.',
        zh: '拆除后会空出基地栏位，并把正在以它为目标的敌军和部队重新分配到剩余主要基地。'
      })
      : localizedPlacementReason(i18n, dismantle?.reason ?? '撤去できません。');
    return `<button class="secondary wideButton danger" data-action="dismantle-${dismantleKind}-base" data-base-id="${baseId}" ${dismantle?.ok ? '' : 'disabled'}>${button}</button><p class="sectionNote">${reason}</p>`;
  })() : '';
  return `<article class="baseCommandCard ${selected ? 'selected' : ''} ${destroyed ? 'destroyed' : ''}">
    <header><div><small>${label}</small><strong>${baseName}</strong></div><span data-alert="${destroyed || status.nearbyEnemies > 0 ? 'danger' : 'clear'}">${c(status.alert)}</span></header>
    <div class="contextMetricGrid"><span><small>HP</small><b>${Math.ceil(base.hp)}/${base.maxHp}</b></span><span><small>ENEMY</small><b>${status.nearbyEnemies}</b></span><span><small>DEF</small><b>${status.facilities}</b></span><span><small>SQUAD</small><b>${status.squads}/${status.squadCapacity}</b></span><span><small>PRESS</small><b>${Math.round(pressure.ratio * 100)}%</b></span></div>
    ${fieldRangeNote}
    <p class="basePressureNotice">${pressureNotice}</p>
    <p class="basePressureNotice">${regionNotice}</p>
    <p class="baseSquadNotice">${logisticsNotice}</p>
    <p class="baseSquadNotice">${squadNotice}</p>
    ${recoveryNotice}
    <button class="primary wideButton" data-action="focus-base" data-base-id="${baseId}" data-base-kind="${field ? 'field' : 'major'}">${focusLabel}</button>
    ${rebuildHtml}
    ${dismantleHtml}
  </article>`;
}


export class BaseCommandUi {
  constructor({ store, playerBaseSystem, fieldBaseSystem = null, renderer, notifications, persist, i18n = null }) {
    this.store = store;
    this.system = playerBaseSystem;
    this.fieldSystem = fieldBaseSystem;
    this.renderer = renderer;
    this.notifications = notifications;
    this.persist = persist;
    this.i18n = i18n;
    this.panel = queryRequired('#baseCommandPanel');
    this.body = queryRequired('#baseCommandBody');
    this.summary = queryRequired('#baseSummary');
    this.focusedBaseId = null;
    this.focusedBaseKind = 'major';
    this.lastRenderAt = 0;
    this.activeTab = 'overview';
    queryRequired('#baseCommandButton').addEventListener('click', () => this.open());
    queryRequired('#closeBaseCommand').addEventListener('click', () => this.close());
    bindDismissibleModal(this.panel, () => this.close());
    this.body.addEventListener('click', event => this.handleAction(event));
  }

  localize(text = '') { return this.i18n?.copy?.(text) ?? text; }

  availableBases(state) {
    return [...(state.world?.playerBases ?? []), ...(state.world?.fieldBases ?? [])];
  }

  open() {
    const state = this.store.snapshot();
    const bases = this.availableBases(state);
    if (!bases.some(base => base.id === this.focusedBaseId)) {
      this.focusedBaseId = bases[0]?.id ?? null;
      this.focusedBaseKind = 'major';
    }
    this.render(state);
    setVisible(this.panel, true);
  }

  close() { setVisible(this.panel, false); }

  selectedBase(state = this.store.snapshot()) {
    const bases = this.availableBases(state);
    return bases.find(base => base.id === this.focusedBaseId) ?? bases[0] ?? null;
  }

  focusCurrentBase(state = this.store.snapshot()) {
    const base = this.selectedBase(state);
    if (!base) return false;
    this.focusedBaseId = base.id;
    this.focusedBaseKind = base.kind === 'FIELD' ? 'field' : 'major';
    this.renderer.centerOn(base, 0.9);
    this.updateSummary(state);
    return true;
  }

  update(state = this.store.snapshot()) {
    this.updateSummary(state);
    if (!this.panel.hidden && Date.now() - this.lastRenderAt >= 1000) this.render(state);
  }

  updateSummary(state = this.store.snapshot()) {
    const major = activePlayerBases(state);
    const majorSlots = playerBaseSlotsUsed(state);
    const field = state.world?.fieldBases ?? [];
    const focused = [...major, ...field].find(base => base.id === this.focusedBaseId);
    const damagedDefenses = (state.combat?.defenses ?? []).filter(defense => defense.hp > 0 && defense.hp < defense.maxHp).length;
    const damagedBuildings = (state.civilization?.buildings ?? []).filter(building => building.hp > 0 && building.hp < building.maxHp).length;
    const repairCount = damagedDefenses + damagedBuildings;
    const majorLimit = localizedLimit(baseLimitForCivilization(state.civilization?.level), this.i18n);
    const fieldLimit = localizedLimit(fieldBaseLimitForCivilization(state.civilization?.level), this.i18n);
    const focusedName = focused ? i18nCopy(this.i18n, focused.name) : '';
    this.summary.textContent = uiText(this.i18n,
      `主要 ${major.length}稼働・${majorSlots}/${majorLimit}・簡易 ${fieldBaseSlotsUsed(state)}/${fieldLimit}${repairCount ? `・要修理 ${repairCount}` : ''}${focused ? `・表示 ${focusedName}` : ''}`,
      {
        en: `Major ${major.length} active · ${majorSlots}/${majorLimit} · Simple ${fieldBaseSlotsUsed(state)}/${fieldLimit}${repairCount ? ` · Repairs needed ${repairCount}` : ''}${focused ? ` · Focused ${focusedName}` : ''}`,
        zh: `主要 ${major.length} 运行 · ${majorSlots}/${majorLimit} · 简易 ${fieldBaseSlotsUsed(state)}/${fieldLimit}${repairCount ? ` · 需修理 ${repairCount}` : ''}${focused ? ` · 显示 ${focusedName}` : ''}`
      }
    );
    this.summary.classList?.toggle('has-repairs', repairCount > 0);
  }

  handleAction(event) {
    const tabButton = event.target.closest('button[data-ui-tab]');
    if (tabButton?.dataset?.uiTab) {
      this.activeTab = tabButton.dataset.uiTab || 'overview';
      this.render();
      return;
    }
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, baseId, baseKind } = button.dataset;
    if (action === 'focus-base') {
      const state = this.store.snapshot();
      const pool = baseKind === 'field' ? (state.world?.fieldBases ?? []) : (state.world?.playerBases ?? []);
      const base = pool.find(value => value.id === baseId);
      if (!base) return;
      this.focusedBaseId = base.id;
      this.focusedBaseKind = baseKind ?? 'major';
      this.focusCurrentBase(state);
      this.close();
      return;
    }
    if (action === 'establish-base') {
      let result;
      this.store.transaction(state => { result = this.system.establishAtCurrentLocation(state); }, 'base:player-established', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? '拠点を設置できません。'));
      else {
        this.focusedBaseId = result.base.id;
        this.focusedBaseKind = 'major';
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize(`${result.base.name}を設置しました。`));
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'establish-field-base') {
      if (!this.fieldSystem) return;
      let result;
      this.store.transaction(state => { result = this.fieldSystem.establishAtCurrentLocation(state); }, 'base:field-established', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? '簡易拠点を設置できません。'));
      else {
        this.focusedBaseId = result.base.id;
        this.focusedBaseKind = 'field';
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize(`${result.base.name}を設置しました。`));
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'rebuild-major-base') {
      let result;
      this.store.transaction(state => { result = this.system.rebuild(state, baseId); }, 'base:player-rebuilt', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? '主要拠点を再建できません。'));
      else {
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize(`${result.base.name}を再建しました。`));
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'rebuild-field-base') {
      if (!this.fieldSystem) return;
      let result;
      this.store.transaction(state => { result = this.fieldSystem.rebuild(state, baseId); }, 'base:field-rebuilt', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? '簡易拠点を再建できません。'));
      else {
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize(`${result.base.name}を再建しました。`));
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'dismantle-major-base') {
      let result;
      this.store.transaction(state => { result = this.system.dismantle(state, baseId); }, 'base:player-dismantled', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? '主要拠点を撤去できません。'));
      else {
        const state = this.store.snapshot();
        this.focusedBaseId = (state.world?.playerBases ?? [])[0]?.id ?? (state.world?.fieldBases ?? [])[0]?.id ?? null;
        this.focusedBaseKind = 'major';
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize(`${result.base.name}を撤去しました。`));
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'dismantle-field-base') {
      if (!this.fieldSystem) return;
      let result;
      this.store.transaction(state => { result = this.fieldSystem.dismantle(state, baseId); }, 'base:field-dismantled', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? '簡易拠点を撤去できません。'));
      else {
        const state = this.store.snapshot();
        this.focusedBaseId = (state.world?.playerBases ?? [])[0]?.id ?? (state.world?.fieldBases ?? [])[0]?.id ?? null;
        this.focusedBaseKind = 'major';
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize(`${result.base.name}を撤去しました。`));
        this.persist?.();
      }
      this.render();
    }
  }

  render(state = this.store.snapshot()) {
    this.lastRenderAt = Date.now();
    const t = (source, translations = {}) => uiText(this.i18n, source, translations);
    const majorBases = state.world?.playerBases ?? [];
    const fieldBases = state.world?.fieldBases ?? [];
    const majorLimit = baseLimitForCivilization(state.civilization?.level);
    const fieldLimit = fieldBaseLimitForCivilization(state.civilization?.level);
    const all = [...majorBases, ...fieldBases];
    if (!all.some(base => base.id === this.focusedBaseId)) this.focusedBaseId = majorBases[0]?.id ?? fieldBases[0]?.id ?? null;

    const majorPlacement = this.system.previewCurrentLocation(state);
    const fieldPlacement = this.fieldSystem?.previewCurrentLocation(state) ?? { ok: false, reason: '簡易拠点システムを利用できません。' };
    const fieldDiagnostic = diagnoseFieldBaseNetwork(state, Math.min(3, fieldLimit));
    const majorCards = majorBases.map((base, index) => baseCard(state, base, {
      selected: base.id === this.focusedBaseId,
      label: index === 0 ? 'PRIMARY' : `MAJOR ${String(index + 1).padStart(2, '0')}`,
      rebuild: base.status === 'DESTROYED' ? this.system.previewRebuild(state, base.id) : null,
      rebuildKind: base.primary ? null : 'major',
      dismantle: this.system.previewDismantle(state, base.id),
      dismantleKind: base.primary ? null : 'major',
      i18n: this.i18n
    })).join('') || `<p class="emptyText">${t('稼働中の主要拠点がありません。', { en: 'No active major bases.', zh: '尚无运行中的主要基地。' })}</p>`;
    const fieldCards = fieldBases.map((base, index) => baseCard(state, base, {
      selected: base.id === this.focusedBaseId,
      label: `FIELD ${String(index + 1).padStart(2, '0')}`,
      field: true,
      rebuild: base.status === 'DESTROYED' ? this.fieldSystem?.previewRebuild(state, base.id) : null,
      rebuildKind: 'field',
      dismantle: this.fieldSystem?.previewDismantle(state, base.id),
      dismantleKind: 'field',
      i18n: this.i18n
    })).join('') || `<p class="emptyText">${t('簡易拠点はまだありません。', { en: 'No simple bases yet.', zh: '尚无简易基地。' })}</p>`;

    const active = ['overview', 'major', 'field', 'build'].includes(this.activeTab) ? this.activeTab : 'overview';
    const majorLimitText = localizedLimit(majorLimit, this.i18n);
    const fieldLimitText = localizedLimit(fieldLimit, this.i18n);
    const majorSlotsPerBase = friendlySquadCapacityForBase(state, { kind: 'MAJOR' });
    const fieldSlotsPerBase = friendlySquadCapacityForBase(state, { kind: 'FIELD' });
    const buildMajorCost = i18nBundle(this.i18n, majorPlacement.cost);
    const buildFieldCost = i18nBundle(this.i18n, fieldPlacement.cost);
    const majorBuildStatus = majorPlacement.ok
      ? t(`設置可能・道路まで約${Math.round(majorPlacement.distanceToRoad)}m`, {
        en: `Can place · about ${Math.round(majorPlacement.distanceToRoad)} m to road`,
        zh: `可设置 · 距道路约 ${Math.round(majorPlacement.distanceToRoad)}m`
      })
      : localizedPlacementReason(this.i18n, majorPlacement.reason);
    const fieldBuildStatus = fieldPlacement.ok
      ? t(`設置可能・道路まで約${Math.round(fieldPlacement.distanceToRoad)}m`, {
        en: `Can place · about ${Math.round(fieldPlacement.distanceToRoad)} m to road`,
        zh: `可设置 · 距道路约 ${Math.round(fieldPlacement.distanceToRoad)}m`
      })
      : localizedPlacementReason(this.i18n, fieldPlacement.reason);
    const fieldDiagnosticTitle = t(`道路網診断：${fieldDiagnostic.active}/${fieldDiagnostic.required}基稼働`, {
      en: `Road network check: ${fieldDiagnostic.active}/${fieldDiagnostic.required} active`,
      zh: `道路网诊断：${fieldDiagnostic.active}/${fieldDiagnostic.required} 座运行`
    });
    const fieldDiagnosticDetail = t(`追加候補 ${fieldDiagnostic.confirmedAdditional}基・破壊済み ${fieldDiagnostic.destroyed}基`, {
      en: `Additional candidates ${fieldDiagnostic.confirmedAdditional} · Destroyed ${fieldDiagnostic.destroyed}`,
      zh: `追加候选 ${fieldDiagnostic.confirmedAdditional} 座 · 已破坏 ${fieldDiagnostic.destroyed} 座`
    });

    this.body.innerHTML = `<div class="uiTabBar" role="tablist" aria-label="${t('拠点画面の表示切替', { en: 'Base tab switcher', zh: '基地画面标签切换' })}">
        ${tabButton('overview', t('概要', { en: 'Overview', zh: '概要' }), active)}
        ${tabButton('major', t('主要', { en: 'Major', zh: '主要' }), active)}
        ${tabButton('field', t('簡易', { en: 'Simple', zh: '简易' }), active)}
        ${tabButton('build', t('建設', { en: 'Build', zh: '建设' }), active)}
      </div>
      <section class="overviewHero baseHero">
        <div><small>${t('主要拠点', { en: 'Major Bases', zh: '主要基地' })}</small><strong>${majorBases.length}/${majorLimitText}</strong><span>${t(`各 ${majorSlotsPerBase}部隊枠`, { en: `${majorSlotsPerBase} squad slots each`, zh: `每个 ${majorSlotsPerBase} 个部队栏位` })}</span></div>
        <div><small>${t('簡易拠点', { en: 'Simple Bases', zh: '简易基地' })}</small><strong>${fieldBaseSlotsUsed(state)}/${fieldLimitText}</strong><span>${t(`各 ${fieldSlotsPerBase}部隊枠`, { en: `${fieldSlotsPerBase} squad slots each`, zh: `每个 ${fieldSlotsPerBase} 个部队栏位` })}</span></div>
        <div><small>${t('文明', { en: 'Civilization', zh: '文明' })}</small><strong>Lv.${state.civilization.level}</strong><span>${t('発展で拠点・部隊枠が増加', { en: 'Growth increases base and squad slots', zh: '发展会增加基地和部队栏位' })}</span></div>
      </section>
      ${tabPanel('overview', active, `<h2>${t('拠点概要', { en: 'Base Overview', zh: '基地概要' })}</h2><div class="baseCommandGrid compactBaseGrid">${majorCards}${fieldCards}</div>`)}
      ${tabPanel('major', active, `<h2>${t('主要拠点', { en: 'Major Bases', zh: '主要基地' })}</h2><p class="sectionNote">${t('すべての部隊を派兵できる中核拠点です。主要拠点は最低1つを残し、それ以外は撤去できます。', { en: 'Core bases that can dispatch all squad types. At least one major base must remain; the rest can be dismantled.', zh: '可派遣所有部队的核心基地。必须留下至少一座主要基地，其余可拆除。' })}</p><div class="baseCommandGrid">${majorCards}</div>`)}
      ${tabPanel('field', active, `<h2>${t('簡易拠点', { en: 'Simple Bases', zh: '简易基地' })}</h2><p class="sectionNote">${t('突撃部隊・遊撃部隊・回収部隊の前線運用に使います。不要な簡易拠点は撤去できます。', { en: 'Used for frontline operation of Assault, Skirmisher, and Recovery squads. Unneeded simple bases can be dismantled.', zh: '用于突击、游击和回收部队的前线运用。不需要的简易基地可以拆除。' })}</p><div class="baseCommandGrid">${fieldCards}</div>`)}
      ${tabPanel('build', active, `<h2>${t('現在地に主要拠点', { en: 'Build Major Base', zh: '在当前位置建设主要基地' })}</h2><div class="baseEstablishSection"><p class="sectionNote">${t(`建設範囲${majorBaseBuildRange(state.civilization?.level)}m。すべての部隊を派兵できます。`, { en: `Construction range ${majorBaseBuildRange(state.civilization?.level)} m. All squad types can be dispatched.`, zh: `建设范围 ${majorBaseBuildRange(state.civilization?.level)}m。可派遣所有部队。` })}</p><button class="primary wideButton" data-action="establish-base" ${majorPlacement.ok ? '' : 'disabled'}>${t('現在地に主要拠点を設置', { en: 'Place Major', zh: '设置主要基地' })}</button><p class="sectionNote">${t('費用', { en: 'Cost', zh: '费用' })} ${buildMajorCost}・${majorBuildStatus}</p></div><h2>${t('現在地に簡易拠点', { en: 'Build Simple Base', zh: '在当前位置建设简易基地' })}</h2><div class="baseEstablishSection"><p class="sectionNote">${t('文明Lv.1で解禁。取得済み道路の交差点から100m以内で設置できます。', { en: 'Unlocked at Civ Lv.1. Can be placed within 100 m of an acquired road intersection.', zh: '文明 Lv.1 解锁。可在已取得道路交叉点 100m 内设置。' })}</p><div class="fieldBaseDiagnostic ${fieldDiagnostic.sufficient ? 'is-sufficient' : 'is-insufficient'}"><strong>${fieldDiagnosticTitle}</strong><span>${fieldDiagnosticDetail}</span><small>${localizedDiagnosticGuidance(this.i18n, fieldDiagnostic.guidance)}</small></div><button class="primary wideButton" data-action="establish-field-base" ${fieldPlacement.ok ? '' : 'disabled'}>${t('現在地に簡易拠点を設置', { en: 'Place Simple', zh: '设置简易基地' })}</button><p class="sectionNote">${t('費用', { en: 'Cost', zh: '费用' })} ${buildFieldCost}・${fieldBuildStatus}</p></div>`)}
    `;
    this.i18n?.localizeElement?.(this.body);
    this.updateSummary(state);
  }

}
