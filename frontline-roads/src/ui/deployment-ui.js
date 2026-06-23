import { deploymentBases, ownedBaseById } from '../base/field-bases.js';
import { ENEMY_BASE_DEFINITIONS } from '../combat/definitions.js';
import { FRIENDLY_SQUAD_DEFINITIONS, FRIENDLY_SQUAD_TYPES } from '../combat/friendly-force-system.js';
import { bundleText } from '../civilization/inventory-system.js';
import { RECOVERY_ITEM_STATUS, recoveryItemPresentation } from '../exploration/recovery-system.js';
import { queryRequired, setVisible } from './dom.js';

function routeText(distance) {
  if (!Number.isFinite(distance)) return '経路なし';
  if (distance < 1000) return `${Math.round(distance)}m`;
  return `${(distance / 1000).toFixed(1)}km`;
}

function squadStatusLabel(status) {
  return ({ OUTBOUND: '進軍中', ENGAGED: '交戦中', ATTACKING_BASE: '基地攻撃中', COLLECTING_ITEM: '現地回収中', HALTED: '停止中', RETREATING: '後退中', WITHDRAWING: '撤退中', RETURNING: '帰還中', STRANDED: '経路再計算中', RECOVERING: '回復・再編成中', READY: '再出撃可能' })[status] ?? status;
}

function baseKindLabel(base) {
  return base.kind === 'FIELD' ? '簡易拠点' : '主要拠点';
}

export class DeploymentUi {
  constructor({ store, friendlyForceSystem, notifications, persist }) {
    this.store = store;
    this.system = friendlyForceSystem;
    this.notifications = notifications;
    this.persist = persist;
    this.panel = queryRequired('#deploymentPanel');
    this.body = queryRequired('#deploymentBody');
    this.squadType = 'assault';
    this.originBaseId = null;
    this.targetBaseId = null;
    this.lastRenderAt = 0;
    queryRequired('#deploymentButton').addEventListener('click', () => this.open());
    queryRequired('#closeDeployment').addEventListener('click', () => this.close());
    this.body.addEventListener('click', event => this.handleAction(event));
  }

  open() {
    this.normalizeSelection();
    this.render();
    setVisible(this.panel, true);
  }

  close() {
    setVisible(this.panel, false);
  }

  update() {
    if (!this.panel.hidden && Date.now() - this.lastRenderAt >= 1000) this.render();
  }

  normalizeSelection() {
    const state = this.store.select(value => value);
    const definition = FRIENDLY_SQUAD_DEFINITIONS[this.squadType] ?? FRIENDLY_SQUAD_DEFINITIONS.assault;
    if ((state.civilization?.level ?? 0) < definition.unlockLevel) this.squadType = 'assault';
    const bases = deploymentBases(state, this.squadType);
    const targets = definition.missionKind === 'RECOVERY'
      ? (state.world.recoveryItems ?? []).filter(item => item.status === RECOVERY_ITEM_STATUS.AVAILABLE)
      : state.world.enemyBases.filter(base => base.alive && base.hp > 0);
    if (!bases.some(base => base.id === this.originBaseId)) this.originBaseId = bases[0]?.id ?? null;
    if (!targets.some(target => target.id === this.targetBaseId)) this.targetBaseId = targets[0]?.id ?? null;
  }

  handleAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, baseId, targetId, squadType } = button.dataset;
    if (action === 'select-unit' && squadType) {
      const state = this.store.select(value => value);
      const definition = FRIENDLY_SQUAD_DEFINITIONS[squadType];
      if (!definition || (state.civilization?.level ?? 0) < definition.unlockLevel) return;
      this.squadType = squadType;
      this.originBaseId = null;
    }
    if (action === 'select-origin') this.originBaseId = baseId;
    if (action === 'select-target') this.targetBaseId = targetId;
    if (action === 'dispatch') {
      let result;
      this.store.mutate(state => { result = this.system.dispatch(state, this.originBaseId, this.targetBaseId, this.squadType); }, 'friendly:dispatch', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(result?.reason ?? '派兵できません。');
      else {
        this.notifications.show(`${FRIENDLY_SQUAD_DEFINITIONS[this.squadType].name}を派兵しました。`);
        this.persist?.();
      }
    }
    this.normalizeSelection();
    this.render();
  }

  render() {
    const state = this.store.select(value => value);
    this.lastRenderAt = Date.now();
    this.normalizeSelection();
    const civilizationLevel = state.civilization?.level ?? 0;
    const definition = FRIENDLY_SQUAD_DEFINITIONS[this.squadType] ?? FRIENDLY_SQUAD_DEFINITIONS.assault;
    const bases = deploymentBases(state, this.squadType);
    const recoveryMission = definition.missionKind === 'RECOVERY';
    const targets = recoveryMission
      ? (state.world.recoveryItems ?? []).filter(item => item.status === RECOVERY_ITEM_STATUS.AVAILABLE)
      : state.world.enemyBases.filter(base => base.alive && base.hp > 0);
    const preview = this.originBaseId && this.targetBaseId
      ? this.system.previewDeployment(state, this.originBaseId, this.targetBaseId, this.squadType)
      : { ok: false, reason: targets.length ? '出撃元を選択してください。' : recoveryMission ? '回収可能な特殊アイテムがありません。' : '発見済みの敵拠点がありません。' };

    const unitCards = FRIENDLY_SQUAD_TYPES.map(type => {
      const item = FRIENDLY_SQUAD_DEFINITIONS[type];
      const unlocked = civilizationLevel >= item.unlockLevel;
      const selected = type === this.squadType;
      const baseText = item.allowedBaseKinds.includes('FIELD') ? '主要・簡易' : '主要のみ';
      return `<button class="deploymentCard unitCard ${selected ? 'selected' : ''}" data-action="select-unit" data-squad-type="${type}" ${unlocked ? '' : 'disabled'}><strong>${item.name}</strong><span>${item.role}・${baseText}</span><small>${unlocked ? item.description : `文明Lv.${item.unlockLevel}で解禁`}</small></button>`;
    }).join('');

    const originCards = bases.map(base => {
      const squadsAtBase = state.combat.friendlySquads.filter(squad => squad.originBaseId === base.id && squad.hp > 0);
      const stationed = squadsAtBase.find(squad => ['RECOVERING', 'READY'].includes(squad.status));
      const active = squadsAtBase.filter(squad => !['RECOVERING', 'READY'].includes(squad.status)).length;
      const stationedText = stationed ? `${squadStatusLabel(stationed.status)}：${FRIENDLY_SQUAD_DEFINITIONS[stationed.type]?.name ?? '部隊'} HP ${Math.ceil(stationed.hp)}/${stationed.maxHp}` : `派兵中 ${active}`;
      return `<button class="deploymentCard ${base.id === this.originBaseId ? 'selected' : ''}" data-action="select-origin" data-base-id="${base.id}"><strong>${base.name}</strong><span>${baseKindLabel(base)}・HP ${Math.ceil(base.hp)}/${base.maxHp}</span><small>${stationedText}</small></button>`;
    }).join('') || `<p class="emptyText">${definition.name}を出撃できる拠点がありません。</p>`;

    const targetCards = targets.map(target => {
      if (recoveryMission) {
        const presentation = recoveryItemPresentation(target);
        return `<button class="deploymentCard recoveryTarget ${target.id === this.targetBaseId ? 'selected' : ''}" data-action="select-target" data-target-id="${target.id}"><strong>${presentation.name}</strong><span>${presentation.sourceName}跡地</span><small>現地回収後、拠点への帰還が必要</small></button>`;
      }
      const definitionValue = ENEMY_BASE_DEFINITIONS[target.type];
      return `<button class="deploymentCard hostile ${target.id === this.targetBaseId ? 'selected' : ''}" data-action="select-target" data-target-id="${target.id}"><strong>${definitionValue?.name ?? '敵拠点'}</strong><span>HP ${Math.ceil(target.hp)}/${target.maxHp}</span><small>Lv.${target.level ?? 1}</small></button>`;
    }).join('') || `<p class="emptyText">${recoveryMission ? '回収可能な特殊アイテムがありません。' : '攻撃可能な敵拠点がありません。'}</p>`;

    const squads = state.combat.friendlySquads.filter(squad => squad.hp > 0).map(squad => {
      const squadDefinition = FRIENDLY_SQUAD_DEFINITIONS[squad.type] ?? FRIENDLY_SQUAD_DEFINITIONS.assault;
      const origin = ownedBaseById(state, squad.originBaseId, { includeDestroyed: true });
      const target = state.world.enemyBases.find(base => base.id === squad.targetBaseId);
      const recoveryItem = (state.world.recoveryItems ?? []).find(item => item.id === squad.targetRecoveryItemId);
      const destination = squad.status === 'RECOVERING' ? '回復中'
        : squad.status === 'READY' ? '待機'
          : recoveryItem?.status === RECOVERY_ITEM_STATUS.CARRIED ? '回収物を輸送中'
            : recoveryItem ? recoveryItemPresentation(recoveryItem).name
              : target ? ENEMY_BASE_DEFINITIONS[target.type]?.name ?? '敵拠点' : '帰還';
      return `<div class="activeSquadRow"><strong>${squadDefinition.name}</strong><span>${squadStatusLabel(squad.status)}</span><small>${origin?.name ?? '不明な拠点'} → ${destination} / HP ${Math.ceil(squad.hp)}/${squad.maxHp}</small></div>`;
    }).join('') || '<p class="emptyText">派兵中の部隊はありません。</p>';

    this.body.innerHTML = `
      <section><h2>部隊種類</h2><div class="deploymentGrid deploymentUnitGrid">${unitCards}</div></section>
      <section><h2>出撃元</h2><div class="deploymentGrid">${originCards}</div></section>
      <section><h2>${recoveryMission ? '回収目標' : '攻撃目標'}</h2><div class="deploymentGrid">${targetCards}</div></section>
      <section class="deploymentOrder"><h2>派兵確認</h2>
        <div class="contextMetricGrid"><span><small>UNIT</small><strong>${definition.name}</strong></span><span><small>ROUTE</small><strong>${routeText(preview.routeDistance)}</strong></span><span><small>COST</small><strong>${preview.reuseReadySquad ? '不要' : bundleText(definition.cost)}</strong></span><span><small>STATUS</small><strong>${preview.reuseReadySquad ? 'REDEPLOY' : preview.replaceReadySquad ? 'REFORM' : preview.ok ? 'READY' : 'BLOCKED'}</strong></span></div>
        <p class="sectionNote">${preview.ok ? preview.reuseReadySquad ? '回復・再編成済みの同じ部隊を、追加費用なしで再出撃させます。' : preview.replaceReadySquad ? '待機中の別部隊を解散し、新しい部隊を編成します。' : definition.description : preview.reason}</p>
        <button class="primary wideButton" data-action="dispatch" ${preview.ok ? '' : 'disabled'}>${preview.reuseReadySquad ? `${definition.name}を再出撃` : preview.replaceReadySquad ? `${definition.name}へ再編成` : recoveryMission ? `${definition.name}を派遣` : `${definition.name}を派兵`}</button>
      </section>
      <section><h2>活動中の部隊</h2><div class="activeSquadList">${squads}</div></section>`;
  }
}
