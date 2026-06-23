import { distance } from '../core/utilities.js';
import { activePlayerBases, baseLimitForCivilization } from '../base/player-bases.js';
import { enemyPosition } from '../combat/enemy-system.js';
import { edgeMidpoint } from '../combat/combat-geometry.js';
import { queryRequired, setVisible } from './dom.js';

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
  const squads = (state.combat.friendlySquads ?? []).filter(squad => squad.originBaseId === base.id).length;
  const recoveryItems = (state.world.recoveryItems ?? []).filter(item => item.status === 'AVAILABLE' && distance(base, state.world.roadGraph?.nodeById?.get(item.nodeId) ?? item) <= BASE_STATUS_RADIUS_METERS).length;
  return {
    nearbyEnemies,
    facilities,
    squads,
    recoveryItems,
    alert: nearbyEnemies > 0 ? '交戦警戒' : recoveryItems > 0 ? '回収物あり' : '安定'
  };
}

export class BaseCommandUi {
  constructor({ store, playerBaseSystem, renderer, notifications, persist }) {
    this.store = store;
    this.system = playerBaseSystem;
    this.renderer = renderer;
    this.notifications = notifications;
    this.persist = persist;
    this.panel = queryRequired('#baseCommandPanel');
    this.body = queryRequired('#baseCommandBody');
    this.summary = queryRequired('#baseSummary');
    this.focusedBaseId = null;
    this.lastRenderAt = 0;
    queryRequired('#baseCommandButton').addEventListener('click', () => this.open());
    queryRequired('#closeBaseCommand').addEventListener('click', () => this.close());
    this.body.addEventListener('click', event => this.handleAction(event));
  }

  open() {
    const bases = activePlayerBases(this.store.select(value => value));
    if (!bases.some(base => base.id === this.focusedBaseId)) this.focusedBaseId = bases[0]?.id ?? null;
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
    const bases = activePlayerBases(state);
    const limit = baseLimitForCivilization(state.civilization?.level);
    const focused = bases.find(base => base.id === this.focusedBaseId) ?? bases[0];
    this.summary.textContent = `拠点 ${bases.length}/${limit}${focused ? `・表示 ${focused.name}` : ''}`;
  }

  handleAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, baseId } = button.dataset;
    if (action === 'focus-base') {
      const state = this.store.select(value => value);
      const base = activePlayerBases(state).find(value => value.id === baseId);
      if (!base) return;
      this.focusedBaseId = base.id;
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
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(`${result.base.name}を設置しました。`);
        this.persist?.();
      }
      this.render();
    }
  }

  render() {
    const state = this.store.select(value => value);
    this.lastRenderAt = Date.now();
    const bases = activePlayerBases(state);
    const limit = baseLimitForCivilization(state.civilization?.level);
    if (!bases.some(base => base.id === this.focusedBaseId)) this.focusedBaseId = bases[0]?.id ?? null;
    const placement = this.system.previewCurrentLocation(state);
    const cards = bases.map((base, index) => {
      const status = summarizePlayerBase(state, base);
      return `<article class="baseCommandCard ${base.id === this.focusedBaseId ? 'selected' : ''}">
        <header><div><small>${index === 0 ? 'PRIMARY' : `BASE ${String(index + 1).padStart(2, '0')}`}</small><strong>${base.name}</strong></div><span data-alert="${status.nearbyEnemies > 0 ? 'danger' : 'clear'}">${status.alert}</span></header>
        <div class="contextMetricGrid"><span><small>HP</small><b>${Math.ceil(base.hp)}/${base.maxHp}</b></span><span><small>ENEMY</small><b>${status.nearbyEnemies}</b></span><span><small>DEF</small><b>${status.facilities}</b></span><span><small>SQUAD</small><b>${status.squads}</b></span></div>
        ${status.recoveryItems ? `<p class="baseRecoveryNotice">周辺に未回収アイテム ${status.recoveryItems}</p>` : ''}
        <button class="primary wideButton" data-action="focus-base" data-base-id="${base.id}">この拠点をMAP表示</button>
      </article>`;
    }).join('') || '<p class="emptyText">稼働中の拠点がありません。</p>';
    this.body.innerHTML = `<section class="baseCommandOverview"><div><span>拠点数</span><strong>${bases.length}/${limit}</strong></div><div><span>文明レベル</span><strong>Lv.${state.civilization.level}</strong></div><div><span>次の枠</span><strong>${bases.length < limit ? '使用可能' : '文明発展で解放'}</strong></div></section>
      <section><h2>拠点一覧</h2><div class="baseCommandGrid">${cards}</div></section>
      <section class="baseEstablishSection"><h2>現在地に新拠点</h2><p class="sectionNote">最新の位置情報を使い、取得済み道路の交差点50m以内かつ既存拠点から220m以上離れた場所へ設置します。</p><button class="primary wideButton" data-action="establish-base" ${placement.ok ? '' : 'disabled'}>現在地に拠点を設置</button><p class="sectionNote">${placement.ok ? `設置可能・道路まで約${Math.round(placement.distanceToRoad)}m` : placement.reason}</p></section>`;
    this.updateSummary();
  }
}
