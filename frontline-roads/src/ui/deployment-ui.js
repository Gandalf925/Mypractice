import { activePlayerBases } from '../base/player-bases.js';
import { ENEMY_BASE_DEFINITIONS } from '../combat/definitions.js';
import { FRIENDLY_SQUAD_DEFINITIONS } from '../combat/friendly-force-system.js';
import { bundleText } from '../civilization/inventory-system.js';
import { queryRequired, setVisible } from './dom.js';

function routeText(distance) {
  if (!Number.isFinite(distance)) return '経路なし';
  if (distance < 1000) return `${Math.round(distance)}m`;
  return `${(distance / 1000).toFixed(1)}km`;
}

function squadStatusLabel(status) {
  return ({ OUTBOUND: '進軍中', ENGAGED: '交戦中', ATTACKING_BASE: '基地攻撃中', HALTED: '停止中', RETREATING: '後退中', WITHDRAWING: '撤退中', RETURNING: '帰還中', STRANDED: '経路再計算中' })[status] ?? status;
}

export class DeploymentUi {
  constructor({ store, friendlyForceSystem, notifications, persist }) {
    this.store = store;
    this.system = friendlyForceSystem;
    this.notifications = notifications;
    this.persist = persist;
    this.panel = queryRequired('#deploymentPanel');
    this.body = queryRequired('#deploymentBody');
    this.originBaseId = null;
    this.targetBaseId = null;
    this.lastRenderAt = 0;
    queryRequired('#deploymentButton').addEventListener('click', () => this.open());
    queryRequired('#closeDeployment').addEventListener('click', () => this.close());
    this.body.addEventListener('click', event => this.handleAction(event));
  }

  open() {
    const state = this.store.select(value => value);
    const bases = activePlayerBases(state);
    const targets = state.world.enemyBases.filter(base => base.alive && base.hp > 0);
    if (!bases.some(base => base.id === this.originBaseId)) this.originBaseId = bases[0]?.id ?? null;
    if (!targets.some(base => base.id === this.targetBaseId)) this.targetBaseId = targets[0]?.id ?? null;
    this.render();
    setVisible(this.panel, true);
  }

  close() {
    setVisible(this.panel, false);
  }

  update() {
    if (!this.panel.hidden && Date.now() - this.lastRenderAt >= 1000) this.render();
  }

  handleAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, baseId, targetId } = button.dataset;
    if (action === 'select-origin') this.originBaseId = baseId;
    if (action === 'select-target') this.targetBaseId = targetId;
    if (action === 'dispatch') {
      let result;
      this.store.mutate(state => { result = this.system.dispatch(state, this.originBaseId, this.targetBaseId); }, 'friendly:dispatch', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(result?.reason ?? '派兵できません。');
      else {
        this.notifications.show('攻撃部隊を派兵しました。');
        this.persist?.();
      }
    }
    this.render();
  }

  render() {
    const state = this.store.select(value => value);
    this.lastRenderAt = Date.now();
    const bases = activePlayerBases(state);
    const targets = state.world.enemyBases.filter(base => base.alive && base.hp > 0);
    if (!bases.some(base => base.id === this.originBaseId)) this.originBaseId = bases[0]?.id ?? null;
    if (!targets.some(base => base.id === this.targetBaseId)) this.targetBaseId = targets[0]?.id ?? null;
    const preview = this.originBaseId && this.targetBaseId
      ? this.system.previewDeployment(state, this.originBaseId, this.targetBaseId)
      : { ok: false, reason: targets.length ? '出撃元を選択してください。' : '発見済みの敵拠点がありません。' };
    const definition = FRIENDLY_SQUAD_DEFINITIONS.assault;
    const originCards = bases.map(base => {
      const active = state.combat.friendlySquads.filter(squad => squad.originBaseId === base.id).length;
      return `<button class="deploymentCard ${base.id === this.originBaseId ? 'selected' : ''}" data-action="select-origin" data-base-id="${base.id}"><strong>${base.name}</strong><span>HP ${Math.ceil(base.hp)}/${base.maxHp}</span><small>派兵中 ${active}</small></button>`;
    }).join('') || '<p class="emptyText">出撃可能な拠点がありません。</p>';
    const targetCards = targets.map(base => {
      const definitionValue = ENEMY_BASE_DEFINITIONS[base.type];
      return `<button class="deploymentCard hostile ${base.id === this.targetBaseId ? 'selected' : ''}" data-action="select-target" data-target-id="${base.id}"><strong>${definitionValue?.name ?? '敵拠点'}</strong><span>HP ${Math.ceil(base.hp)}/${base.maxHp}</span><small>Lv.${base.level ?? 1}</small></button>`;
    }).join('') || '<p class="emptyText">攻撃可能な敵拠点がありません。</p>';
    const squads = state.combat.friendlySquads.map(squad => {
      const origin = bases.find(base => base.id === squad.originBaseId) ?? state.world.playerBases?.find(base => base.id === squad.originBaseId);
      const target = state.world.enemyBases.find(base => base.id === squad.targetBaseId);
      return `<div class="activeSquadRow"><strong>${definition.name}</strong><span>${squadStatusLabel(squad.status)}</span><small>${origin?.name ?? '不明な拠点'} → ${target ? ENEMY_BASE_DEFINITIONS[target.type]?.name ?? '敵拠点' : '帰還'} / HP ${Math.ceil(squad.hp)}/${squad.maxHp}</small></div>`;
    }).join('') || '<p class="emptyText">派兵中の部隊はありません。</p>';
    this.body.innerHTML = `
      <section><h2>出撃元</h2><div class="deploymentGrid">${originCards}</div></section>
      <section><h2>攻撃目標</h2><div class="deploymentGrid">${targetCards}</div></section>
      <section class="deploymentOrder"><h2>派兵確認</h2>
        <div class="contextMetricGrid"><span><small>UNIT</small><strong>${definition.name}</strong></span><span><small>ROUTE</small><strong>${routeText(preview.routeDistance)}</strong></span><span><small>COST</small><strong>${bundleText(definition.cost)}</strong></span><span><small>STATUS</small><strong>${preview.ok ? 'READY' : 'BLOCKED'}</strong></span></div>
        <p class="sectionNote">${preview.ok ? '部隊は道路を進み、道中の敵と交戦してから敵基地を攻撃します。生存部隊は出撃元へ帰還します。' : preview.reason}</p>
        <button class="primary wideButton" data-action="dispatch" ${preview.ok ? '' : 'disabled'}>突撃部隊を派兵</button>
      </section>
      <section><h2>活動中の部隊</h2><div class="activeSquadList">${squads}</div></section>`;
  }
}
