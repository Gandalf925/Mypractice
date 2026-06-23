import { distance } from '../core/utilities.js';
import { activePlayerBases, baseLimitForCivilization, ensurePlayerBaseState, playerBaseSlotsUsed } from '../base/player-bases.js';
import {
  activeFieldBases,
  ensureFieldBaseState,
  fieldBaseLimitForCivilization,
  fieldBaseSlotsUsed
} from '../base/field-bases.js';
import { enemyPosition } from '../combat/enemy-system.js';
import { edgeMidpoint } from '../combat/combat-geometry.js';
import { queryRequired, setVisible } from './dom.js';
import { bundleText } from '../civilization/inventory-system.js';
import { diagnoseFieldBaseNetwork } from '../base/field-base-system.js';

const BASE_STATUS_RADIUS_METERS = 300;
const FACILITY_RADIUS_METERS = 120;

function defensePoint(state, defense) {
  if (defense.kind === 'barrier') return edgeMidpoint(state.world.roadGraph, defense.edgeId);
  return state.world.roadGraph?.nodeById?.get(defense.nodeId) ?? null;
}

export function summarizePlayerBase(state, base) {
  const nearbyEnemies = (state.combat.enemies ?? []).filter(enemy => enemy.hp > 0 && distance(base, enemyPosition(state, enemy)) <= BASE_STATUS_RADIUS_METERS).length;
  const facilities = (state.combat.defenses ?? []).filter(defense => defense.hp > 0 && !defense.ruined && (() => {
    const point = defensePoint(state, defense);
    return point && distance(base, point) <= FACILITY_RADIUS_METERS;
  })()).length;
  const baseSquads = (state.combat.friendlySquads ?? []).filter(squad => squad.originBaseId === base.id && squad.hp > 0);
  const recoveringSquads = baseSquads.filter(squad => squad.status === 'RECOVERING').length;
  const readySquads = baseSquads.filter(squad => squad.status === 'READY').length;
  const activeSquads = baseSquads.length - recoveringSquads - readySquads;
  const squads = baseSquads.length;
  const recoveryItems = (state.world.recoveryItems ?? []).filter(item => item.status === 'AVAILABLE' && distance(base, state.world.roadGraph?.nodeById?.get(item.nodeId) ?? item) <= BASE_STATUS_RADIUS_METERS).length;
  return {
    nearbyEnemies,
    facilities,
    squads,
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

function baseCard(state, base, { selected, label, field = false, rebuild = null, rebuildKind = null }) {
  const status = summarizePlayerBase(state, base);
  const destroyed = base.status === 'DESTROYED' || base.hp <= 0;
  return `<article class="baseCommandCard ${selected ? 'selected' : ''} ${destroyed ? 'destroyed' : ''}">
    <header><div><small>${label}</small><strong>${base.name}</strong></div><span data-alert="${destroyed || status.nearbyEnemies > 0 ? 'danger' : 'clear'}">${status.alert}</span></header>
    <div class="contextMetricGrid"><span><small>HP</small><b>${Math.ceil(base.hp)}/${base.maxHp}</b></span><span><small>ENEMY</small><b>${status.nearbyEnemies}</b></span><span><small>DEF</small><b>${status.facilities}</b></span><span><small>SQUAD</small><b>${status.activeSquads}/${status.squads}</b></span></div>
    ${field ? '<p class="sectionNote">建設範囲50m・突撃／遊撃／回収部隊を派兵可能</p>' : ''}
    ${status.recoveringSquads || status.readySquads ? `<p class="baseSquadNotice">回復中 ${status.recoveringSquads}・再出撃待機 ${status.readySquads}</p>` : ''}
    ${status.recoveryItems ? `<p class="baseRecoveryNotice">周辺に未回収アイテム ${status.recoveryItems}</p>` : ''}
    <button class="primary wideButton" data-action="focus-base" data-base-id="${base.id}" data-base-kind="${field ? 'field' : 'major'}">この拠点をMAP表示</button>
    ${destroyed && rebuildKind ? `<button class="secondary wideButton" data-action="rebuild-${rebuildKind}-base" data-base-id="${base.id}" ${rebuild?.ok ? '' : 'disabled'}>現地で${rebuildKind === 'field' ? '簡易拠点' : '主要拠点'}を再建</button><p class="sectionNote">費用 ${bundleText(rebuild?.cost)}・${rebuild?.ok ? '現在地から再建できます。' : rebuild?.reason ?? '現地へ移動してください。'}</p>` : ''}
  </article>`;
}

export class BaseCommandUi {
  constructor({ store, playerBaseSystem, fieldBaseSystem = null, renderer, notifications, persist }) {
    this.store = store;
    this.system = playerBaseSystem;
    this.fieldSystem = fieldBaseSystem;
    this.renderer = renderer;
    this.notifications = notifications;
    this.persist = persist;
    this.panel = queryRequired('#baseCommandPanel');
    this.body = queryRequired('#baseCommandBody');
    this.summary = queryRequired('#baseSummary');
    this.focusedBaseId = null;
    this.focusedBaseKind = 'major';
    this.lastRenderAt = 0;
    queryRequired('#baseCommandButton').addEventListener('click', () => this.open());
    queryRequired('#closeBaseCommand').addEventListener('click', () => this.close());
    this.body.addEventListener('click', event => this.handleAction(event));
  }

  availableBases(state) {
    return [...ensurePlayerBaseState(state), ...ensureFieldBaseState(state)];
  }

  open() {
    const state = this.store.select(value => value);
    const bases = this.availableBases(state);
    if (!bases.some(base => base.id === this.focusedBaseId)) {
      this.focusedBaseId = bases[0]?.id ?? null;
      this.focusedBaseKind = 'major';
    }
    this.render();
    setVisible(this.panel, true);
  }

  close() { setVisible(this.panel, false); }

  update() {
    this.updateSummary();
    if (!this.panel.hidden && Date.now() - this.lastRenderAt >= 1000) this.render();
  }

  updateSummary() {
    const state = this.store.select(value => value);
    const major = activePlayerBases(state);
    const majorSlots = playerBaseSlotsUsed(state);
    const field = ensureFieldBaseState(state);
    const focused = [...major, ...field].find(base => base.id === this.focusedBaseId);
    this.summary.textContent = `主要 ${major.length}稼働・${majorSlots}/${baseLimitForCivilization(state.civilization?.level)}・簡易 ${fieldBaseSlotsUsed(state)}/${fieldBaseLimitForCivilization(state.civilization?.level)}${focused ? `・表示 ${focused.name}` : ''}`;
  }

  handleAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, baseId, baseKind } = button.dataset;
    if (action === 'focus-base') {
      const state = this.store.select(value => value);
      const pool = baseKind === 'field' ? ensureFieldBaseState(state) : ensurePlayerBaseState(state);
      const base = pool.find(value => value.id === baseId);
      if (!base) return;
      this.focusedBaseId = base.id;
      this.focusedBaseKind = baseKind ?? 'major';
      this.renderer.centerOn(base, 0.9);
      this.updateSummary();
      this.close();
      return;
    }
    if (action === 'establish-base') {
      let result;
      this.store.mutate(state => { result = this.system.establishAtCurrentLocation(state); }, 'base:player-established', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(result?.reason ?? '拠点を設置できません。');
      else {
        this.focusedBaseId = result.base.id;
        this.focusedBaseKind = 'major';
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(`${result.base.name}を設置しました。`);
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'establish-field-base') {
      if (!this.fieldSystem) return;
      let result;
      this.store.mutate(state => { result = this.fieldSystem.establishAtCurrentLocation(state); }, 'base:field-established', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(result?.reason ?? '簡易拠点を設置できません。');
      else {
        this.focusedBaseId = result.base.id;
        this.focusedBaseKind = 'field';
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(`${result.base.name}を設置しました。`);
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'rebuild-major-base') {
      let result;
      this.store.mutate(state => { result = this.system.rebuild(state, baseId); }, 'base:player-rebuilt', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(result?.reason ?? '主要拠点を再建できません。');
      else {
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(`${result.base.name}を再建しました。`);
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'rebuild-field-base') {
      if (!this.fieldSystem) return;
      let result;
      this.store.mutate(state => { result = this.fieldSystem.rebuild(state, baseId); }, 'base:field-rebuilt', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(result?.reason ?? '簡易拠点を再建できません。');
      else {
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(`${result.base.name}を再建しました。`);
        this.persist?.();
      }
      this.render();
    }
  }

  render() {
    const state = this.store.select(value => value);
    this.lastRenderAt = Date.now();
    const majorBases = ensurePlayerBaseState(state);
    const fieldBases = ensureFieldBaseState(state);
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
      rebuildKind: base.primary ? null : 'major'
    })).join('') || '<p class="emptyText">稼働中の主要拠点がありません。</p>';
    const fieldCards = fieldBases.map((base, index) => baseCard(state, base, {
      selected: base.id === this.focusedBaseId,
      label: `FIELD ${String(index + 1).padStart(2, '0')}`,
      field: true,
      rebuild: base.status === 'DESTROYED' ? this.fieldSystem?.previewRebuild(state, base.id) : null,
      rebuildKind: 'field'
    })).join('') || '<p class="emptyText">簡易拠点はまだありません。</p>';

    this.body.innerHTML = `<section class="baseCommandOverview"><div><span>主要拠点</span><strong>${majorBases.length}/${majorLimit}</strong></div><div><span>簡易拠点</span><strong>${fieldBaseSlotsUsed(state)}/${fieldLimit}</strong></div><div><span>文明レベル</span><strong>Lv.${state.civilization.level}</strong></div></section>
      <section><h2>主要拠点</h2><div class="baseCommandGrid">${majorCards}</div></section>
      <section><h2>簡易拠点</h2><div class="baseCommandGrid">${fieldCards}</div></section>
      <section class="baseEstablishSection"><h2>現在地に主要拠点</h2><p class="sectionNote">主要拠点は建設範囲85mで、すべての部隊を派兵できます。</p><button class="primary wideButton" data-action="establish-base" ${majorPlacement.ok ? '' : 'disabled'}>現在地に主要拠点を設置</button><p class="sectionNote">費用 ${bundleText(majorPlacement.cost)}・${majorPlacement.ok ? `設置可能・道路まで約${Math.round(majorPlacement.distanceToRoad)}m` : majorPlacement.reason}</p></section>
      <section class="baseEstablishSection"><h2>現在地に簡易拠点</h2><p class="sectionNote">文明Lv.1で解禁。取得済み道路の交差点から100m以内で設置できます。HP40、建設範囲50m、突撃／遊撃／回収部隊を派兵できます。破壊後は現地で再建が必要です。</p><div class="fieldBaseDiagnostic ${fieldDiagnostic.sufficient ? 'is-sufficient' : 'is-insufficient'}"><strong>道路網診断：${fieldDiagnostic.active}/${fieldDiagnostic.required}基稼働</strong><span>追加候補 ${fieldDiagnostic.confirmedAdditional}基・破壊済み ${fieldDiagnostic.destroyed}基</span><small>${fieldDiagnostic.guidance}</small></div><button class="primary wideButton" data-action="establish-field-base" ${fieldPlacement.ok ? '' : 'disabled'}>現在地に簡易拠点を設置</button><p class="sectionNote">費用 ${bundleText(fieldPlacement.cost)}・${fieldPlacement.ok ? `設置可能・道路まで約${Math.round(fieldPlacement.distanceToRoad)}m` : fieldPlacement.reason}</p></section>`;
    this.updateSummary();
  }
}
