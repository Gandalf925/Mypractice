import { distance } from '../core/utilities.js';
import { activePlayerBases, baseLimitForCivilization, playerBaseSlotsUsed } from '../base/player-bases.js';
import {
  activeFieldBases,
  fieldBaseLimitForCivilization,
  fieldBaseSlotsUsed
} from '../base/field-bases.js';
import { enemyPosition } from '../combat/enemy-system.js';
import { defenseWorldPosition } from '../combat/combat-geometry.js';
import { bindDismissibleModal, queryRequired, setVisible } from './dom.js';
import { bundleText } from '../civilization/inventory-system.js';
import { diagnoseFieldBaseNetwork } from '../base/field-base-system.js';
import { friendlySquadCapacityForBase } from '../combat/friendly-force-system.js';
import { fieldBaseBuildRange, majorBaseBuildRange } from '../base/construction-range.js';
import { basePressureProfile, basePressureUiText } from '../base/base-pressure.js';

const BASE_STATUS_RADIUS_METERS = 300;
const FACILITY_RADIUS_METERS = 120;
function localizedLimit(value, i18n = null) {
  if (Number.isFinite(value)) return String(value);
  return i18n?.language === 'en' ? 'No limit' : '上限なし';
}

function tabButton(id, label, active) {
  return `<button type="button" data-ui-tab="${id}" class="${active === id ? 'active' : ''}">${label}</button>`;
}

function tabPanel(id, active, html) {
  return `<section class="uiTabPanel ${active === id ? 'active' : ''}" data-panel="${id}">${html}</section>`;
}

function i18nCopy(i18n, text = '') { return i18n?.copy?.(text) ?? String(text ?? ''); }
function i18nBundle(i18n, bundle = {}) { return i18n?.bundleText?.(bundle) ?? bundleText(bundle); }
function isEnglish(i18n) { return i18n?.language === 'en'; }

function baseKindName(kind, i18n = null) {
  const field = kind === 'field' || kind === 'FIELD';
  if (isEnglish(i18n)) return field ? 'Simple Base' : 'Major Base';
  return field ? '簡易拠点' : '主要拠点';
}

function localizedBasePressureText(profile, i18n = null) {
  if (!profile) return isEnglish(i18n) ? 'Enemy pressure unknown' : '敵圧 不明';
  if (!isEnglish(i18n)) return basePressureUiText(profile);
  const stage = ({ 未認識: 'Unrecognized', 偵察: 'Scouting', 小規模: 'Minor', 拡大中: 'Escalating', 本格: 'Full' })[profile.stageLabel] ?? i18nCopy(i18n, profile.stageLabel);
  const percent = Math.round(profile.ratio * 100);
  if (profile.kind === 'PRIMARY') return 'Enemy pressure Full';
  if (profile.mature) return `Enemy pressure ${stage} · ${percent}%`;
  const hours = Math.max(1, Math.ceil(profile.remainingMs / 3_600_000));
  return `Enemy pressure ${stage} · ${percent}% · about ${hours} h until full pressure`;
}

function localizedPlacementReason(i18n, reason = '') {
  const text = String(reason ?? '');
  if (!isEnglish(i18n)) return text;
  const exact = new Map([
    ['現在地を取得してください。', 'Acquire your current location.'],
    ['位置情報が古いため簡易拠点を設置できません。現在地を再取得してください。', 'Location data is too old to place a simple base. Refresh your current location.'],
    ['位置情報が古いため拠点を設置できません。現在地を再取得してください。', 'Location data is too old to place a base. Refresh your current location.'],
    ['位置情報が古いため再建できません。', 'Location data is too old to rebuild. Refresh your current location.'],
    ['位置情報の精度が不足しています。', 'Location accuracy is insufficient.'],
    ['文明Lv.1で簡易拠点が解禁されます。', 'Simple bases unlock at Civ Lv.1.'],
    ['簡易拠点の設置資源が不足しています。', 'Resources for placing a simple base are insufficient.'],
    ['主要拠点の設置資源が不足しています。', 'Resources for placing a major base are insufficient.'],
    ['簡易拠点が見つかりません。', 'Simple base not found.'],
    ['主要拠点が見つかりません。', 'Major base not found.'],
    ['この簡易拠点は稼働中です。', 'This simple base is active.'],
    ['この主要拠点は稼働中です。', 'This major base is active.'],
    ['簡易拠点が接続していた道路を利用できません。', 'The road connected to this simple base is unavailable.'],
    ['簡易拠点の再建資源が不足しています。', 'Resources for rebuilding a simple base are insufficient.'],
    ['主要拠点の再建資源が不足しています。', 'Resources for rebuilding a major base are insufficient.'],
    ['撤去する簡易拠点が見つかりません。', 'Simple base to dismantle was not found.'],
    ['撤去する主要拠点が見つかりません。', 'Major base to dismantle was not found.'],
    ['最後に残す主要拠点は撤去できません。', 'The last remaining major base cannot be dismantled.'],
    ['主要拠点は最低1つ必要です。', 'At least one major base is required.'],
    ['簡易拠点システムを利用できません。', 'Simple base system is unavailable.']
  ]);
  if (exact.has(text)) return exact.get(text);
  let match = text.match(/^現在の文明レベルでは簡易拠点を(\d+)個まで設置できます。$/);
  if (match) return `Current civilization level allows up to ${match[1]} simple bases.`;
  match = text.match(/^現在の文明レベルでは拠点を(\d+)個まで設置できます。$/);
  if (match) return `Current civilization level allows up to ${match[1]} major bases.`;
  match = text.match(/^取得済み道路の交差点から(\d+)m以内へ移動してください。$/);
  if (match) return `Move within ${match[1]} m of an acquired road intersection.`;
  match = text.match(/^既存拠点から(\d+)m以上離れてください。$/);
  if (match) return `Move at least ${match[1]} m away from an existing base.`;
  match = text.match(/^簡易拠点から(\d+)m以上離れてください。$/);
  if (match) return `Move at least ${match[1]} m away from a simple base.`;
  match = text.match(/^敵拠点から(\d+)m以上離れてください。$/);
  if (match) return `Move at least ${match[1]} m away from an enemy base.`;
  match = text.match(/^破壊された簡易拠点から(\d+)m以内へ移動してください。$/);
  if (match) return `Move within ${match[1]} m of the destroyed simple base.`;
  match = text.match(/^破壊された主要拠点から(\d+)m以内へ移動してください。$/);
  if (match) return `Move within ${match[1]} m of the destroyed major base.`;
  return i18nCopy(i18n, text);
}

function localizedDiagnosticGuidance(i18n, text = '') {
  const value = String(text ?? '');
  if (!isEnglish(i18n)) return value;
  if (value === '必要数の簡易拠点はすでに稼働しています。') return 'The required number of simple bases is already active.';
  if (value === '設置枠は埋まっています。破壊済み簡易拠点を現地で再建してください。') return 'No base slots are available. Rebuild destroyed simple bases on site.';
  if (value === '現在の取得道路では必要数に届きません。道路をさらに取得するか、敵拠点周辺を制圧してください。') return 'The acquired road network does not contain enough sites. Acquire more roads or secure areas around enemy bases.';
  let match = value.match(/^破壊済み簡易拠点を(\d+)基再建すると条件を満たせます。$/);
  if (match) return `Rebuild ${match[1]} destroyed simple base(s) to meet the requirement.`;
  match = value.match(/^現在の取得道路上に、あと(\d+)基分の設置候補を確認しました。$/);
  if (match) return `The acquired road network has ${match[1]} additional candidate site(s).`;
  return i18nCopy(i18n, value);
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
  const en = isEnglish(i18n);
  const baseName = c(base.name);
  const baseKind = baseKindName(field ? 'field' : 'major', i18n);
  const targetCap = pressure.kind === 'PRIMARY' ? localizedLimit(Infinity, i18n) : pressure.targetCap;
  const fieldRangeNote = field
    ? (en
      ? `<p class="sectionNote">Construction range ${fieldBaseBuildRange(state.civilization?.level)} m. Can dispatch Assault, Skirmisher, and Recovery squads.</p>`
      : `<p class="sectionNote">建設範囲${fieldBaseBuildRange(state.civilization?.level)}m。突撃／遊撃／回収部隊を派兵できます。</p>`)
    : '';
  const pressureNotice = en
    ? `${localizedBasePressureText(pressure, i18n)} · simultaneous target cap ${targetCap}`
    : `${basePressureUiText(pressure)}・同時標的上限 ${targetCap}`;
  const squadNotice = en
    ? `Deployed ${status.activeSquads} · Recovering ${status.recoveringSquads} · Ready to redeploy ${status.readySquads}`
    : `派兵中 ${status.activeSquads}・回復中 ${status.recoveringSquads}・再出撃待機 ${status.readySquads}`;
  const recoveryNotice = status.recoveryItems
    ? (en ? `<p class="baseRecoveryNotice">Unrecovered nearby items ${status.recoveryItems}</p>` : `<p class="baseRecoveryNotice">周辺に未回収アイテム ${status.recoveryItems}</p>`)
    : '';
  const focusLabel = en ? 'Show this base on MAP' : 'この拠点をMAP表示';
  const rebuildHtml = destroyed && rebuildKind ? (() => {
    const kind = baseKindName(rebuildKind, i18n);
    const button = en ? `Rebuild on site: ${kind}` : `現地で${kind}を再建`;
    const reason = rebuild?.ok
      ? (en ? 'Can rebuild from your current location.' : '現在地から再建できます。')
      : localizedPlacementReason(i18n, rebuild?.reason ?? (en ? 'Move to the site.' : '現地へ移動してください。'));
    return `<button class="secondary wideButton" data-action="rebuild-${rebuildKind}-base" data-base-id="${base.id}" ${rebuild?.ok ? '' : 'disabled'}>${button}</button><p class="sectionNote">${en ? 'Cost' : '費用'} ${i18nBundle(i18n, rebuild?.cost)}・${reason}</p>`;
  })() : '';
  const dismantleHtml = dismantleKind ? (() => {
    const kind = baseKindName(dismantleKind, i18n);
    const button = en ? `Dismantle ${kind}` : `${kind}を撤去`;
    const reason = dismantle?.ok
      ? (en ? 'Dismantling frees a base slot and reassigns enemies and squads targeting it to a remaining major base.' : '撤去すると拠点枠を空け、対象中の敵と部隊は残存主要拠点へ再割当します。')
      : localizedPlacementReason(i18n, dismantle?.reason ?? (en ? 'Cannot dismantle.' : '撤去できません。'));
    return `<button class="secondary wideButton danger" data-action="dismantle-${dismantleKind}-base" data-base-id="${base.id}" ${dismantle?.ok ? '' : 'disabled'}>${button}</button><p class="sectionNote">${reason}</p>`;
  })() : '';
  return `<article class="baseCommandCard ${selected ? 'selected' : ''} ${destroyed ? 'destroyed' : ''}">
    <header><div><small>${label}</small><strong>${baseName}</strong></div><span data-alert="${destroyed || status.nearbyEnemies > 0 ? 'danger' : 'clear'}">${c(status.alert)}</span></header>
    <div class="contextMetricGrid"><span><small>HP</small><b>${Math.ceil(base.hp)}/${base.maxHp}</b></span><span><small>ENEMY</small><b>${status.nearbyEnemies}</b></span><span><small>DEF</small><b>${status.facilities}</b></span><span><small>SQUAD</small><b>${status.squads}/${status.squadCapacity}</b></span><span><small>PRESS</small><b>${Math.round(pressure.ratio * 100)}%</b></span></div>
    ${fieldRangeNote}
    <p class="basePressureNotice">${pressureNotice}</p>
    <p class="baseSquadNotice">${squadNotice}</p>
    ${recoveryNotice}
    <button class="primary wideButton" data-action="focus-base" data-base-id="${base.id}" data-base-kind="${field ? 'field' : 'major'}">${focusLabel}</button>
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
    this.summary.textContent = isEnglish(this.i18n)
      ? `Major ${major.length} active · ${majorSlots}/${majorLimit} · Simple ${fieldBaseSlotsUsed(state)}/${fieldLimit}${repairCount ? ` · Repairs needed ${repairCount}` : ''}${focused ? ` · Focused ${focusedName}` : ''}`
      : `主要 ${major.length}稼働・${majorSlots}/${majorLimit}・簡易 ${fieldBaseSlotsUsed(state)}/${fieldLimit}${repairCount ? `・要修理 ${repairCount}` : ''}${focused ? `・表示 ${focusedName}` : ''}`;
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
    const c = text => i18nCopy(this.i18n, text);
    const en = isEnglish(this.i18n);
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
    })).join('') || `<p class="emptyText">${en ? 'No active major bases.' : '稼働中の主要拠点がありません。'}</p>`;
    const fieldCards = fieldBases.map((base, index) => baseCard(state, base, {
      selected: base.id === this.focusedBaseId,
      label: `FIELD ${String(index + 1).padStart(2, '0')}`,
      field: true,
      rebuild: base.status === 'DESTROYED' ? this.fieldSystem?.previewRebuild(state, base.id) : null,
      rebuildKind: 'field',
      dismantle: this.fieldSystem?.previewDismantle(state, base.id),
      dismantleKind: 'field',
      i18n: this.i18n
    })).join('') || `<p class="emptyText">${en ? 'No simple bases yet.' : '簡易拠点はまだありません。'}</p>`;

    const active = ['overview', 'major', 'field', 'build'].includes(this.activeTab) ? this.activeTab : 'overview';
    const majorLimitText = localizedLimit(majorLimit, this.i18n);
    const fieldLimitText = localizedLimit(fieldLimit, this.i18n);
    const majorSlotsPerBase = friendlySquadCapacityForBase(state, { kind: 'MAJOR' });
    const fieldSlotsPerBase = friendlySquadCapacityForBase(state, { kind: 'FIELD' });
    const buildMajorCost = i18nBundle(this.i18n, majorPlacement.cost);
    const buildFieldCost = i18nBundle(this.i18n, fieldPlacement.cost);
    const majorBuildStatus = majorPlacement.ok
      ? (en ? `Can place · about ${Math.round(majorPlacement.distanceToRoad)} m to road` : `設置可能・道路まで約${Math.round(majorPlacement.distanceToRoad)}m`)
      : localizedPlacementReason(this.i18n, majorPlacement.reason);
    const fieldBuildStatus = fieldPlacement.ok
      ? (en ? `Can place · about ${Math.round(fieldPlacement.distanceToRoad)} m to road` : `設置可能・道路まで約${Math.round(fieldPlacement.distanceToRoad)}m`)
      : localizedPlacementReason(this.i18n, fieldPlacement.reason);
    const fieldDiagnosticTitle = en
      ? `Road network check: ${fieldDiagnostic.active}/${fieldDiagnostic.required} active`
      : `道路網診断：${fieldDiagnostic.active}/${fieldDiagnostic.required}基稼働`;
    const fieldDiagnosticDetail = en
      ? `Additional candidates ${fieldDiagnostic.confirmedAdditional} · Destroyed ${fieldDiagnostic.destroyed}`
      : `追加候補 ${fieldDiagnostic.confirmedAdditional}基・破壊済み ${fieldDiagnostic.destroyed}基`;

    this.body.innerHTML = `<div class="uiTabBar" role="tablist" aria-label="${en ? 'Base tab switcher' : '拠点画面の表示切替'}">
        ${tabButton('overview', en ? 'Overview' : '概要', active)}
        ${tabButton('major', en ? 'Major' : '主要', active)}
        ${tabButton('field', en ? 'Simple' : '簡易', active)}
        ${tabButton('build', en ? 'Build' : '建設', active)}
      </div>
      <section class="overviewHero baseHero">
        <div><small>${en ? 'Major Bases' : '主要拠点'}</small><strong>${majorBases.length}/${majorLimitText}</strong><span>${en ? `${majorSlotsPerBase} squad slots each` : `各 ${majorSlotsPerBase}部隊枠`}</span></div>
        <div><small>${en ? 'Simple Bases' : '簡易拠点'}</small><strong>${fieldBaseSlotsUsed(state)}/${fieldLimitText}</strong><span>${en ? `${fieldSlotsPerBase} squad slots each` : `各 ${fieldSlotsPerBase}部隊枠`}</span></div>
        <div><small>${en ? 'Civilization' : '文明'}</small><strong>Lv.${state.civilization.level}</strong><span>${en ? 'Growth increases base and squad slots' : '発展で拠点・部隊枠が増加'}</span></div>
      </section>
      ${tabPanel('overview', active, `<h2>${en ? 'Base Overview' : '拠点概要'}</h2><div class="baseCommandGrid compactBaseGrid">${majorCards}${fieldCards}</div>`)}
      ${tabPanel('major', active, `<h2>${en ? 'Major Bases' : '主要拠点'}</h2><p class="sectionNote">${en ? 'Core bases that can dispatch all squad types. At least one major base must remain; the rest can be dismantled.' : 'すべての部隊を派兵できる中核拠点です。主要拠点は最低1つを残し、それ以外は撤去できます。'}</p><div class="baseCommandGrid">${majorCards}</div>`)}
      ${tabPanel('field', active, `<h2>${en ? 'Simple Bases' : '簡易拠点'}</h2><p class="sectionNote">${en ? 'Used for frontline operation of Assault, Skirmisher, and Recovery squads. Unneeded simple bases can be dismantled.' : '突撃部隊・遊撃部隊・回収部隊の前線運用に使います。不要な簡易拠点は撤去できます。'}</p><div class="baseCommandGrid">${fieldCards}</div>`)}
      ${tabPanel('build', active, `<h2>${en ? 'Build a major base here' : '現在地に主要拠点'}</h2><div class="baseEstablishSection"><p class="sectionNote">${en ? `Construction range ${majorBaseBuildRange(state.civilization?.level)} m. All squad types can be dispatched.` : `建設範囲${majorBaseBuildRange(state.civilization?.level)}m。すべての部隊を派兵できます。`}</p><button class="primary wideButton" data-action="establish-base" ${majorPlacement.ok ? '' : 'disabled'}>${en ? 'Place major base here' : '現在地に主要拠点を設置'}</button><p class="sectionNote">${en ? 'Cost' : '費用'} ${buildMajorCost}・${majorBuildStatus}</p></div><h2>${en ? 'Build a simple base here' : '現在地に簡易拠点'}</h2><div class="baseEstablishSection"><p class="sectionNote">${en ? 'Unlocked at Civ Lv.1. Can be placed within 100 m of an acquired road intersection.' : '文明Lv.1で解禁。取得済み道路の交差点から100m以内で設置できます。'}</p><div class="fieldBaseDiagnostic ${fieldDiagnostic.sufficient ? 'is-sufficient' : 'is-insufficient'}"><strong>${fieldDiagnosticTitle}</strong><span>${fieldDiagnosticDetail}</span><small>${localizedDiagnosticGuidance(this.i18n, fieldDiagnostic.guidance)}</small></div><button class="primary wideButton" data-action="establish-field-base" ${fieldPlacement.ok ? '' : 'disabled'}>${en ? 'Place simple base here' : '現在地に簡易拠点を設置'}</button><p class="sectionNote">${en ? 'Cost' : '費用'} ${buildFieldCost}・${fieldBuildStatus}</p></div>`)}
    `;
    this.updateSummary(state);
  }

}
