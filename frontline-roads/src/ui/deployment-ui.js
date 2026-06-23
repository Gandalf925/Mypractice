import { deploymentBases, ownedBaseById } from '../base/field-bases.js';
import { ENEMY_BASE_DEFINITIONS } from '../combat/definitions.js';
import { FRIENDLY_SQUAD_DEFINITIONS, FRIENDLY_SQUAD_TYPES } from '../combat/friendly-force-system.js';
import { bundleText } from '../civilization/inventory-system.js';
import { RECOVERY_ITEM_STATUS, recoveryItemPresentation } from '../exploration/recovery-system.js';
import { queryRequired, setVisible } from './dom.js';

const MISSION_KIND = Object.freeze({ ATTACK: 'ATTACK', RECOVERY: 'RECOVERY' });

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

function isRecoveryType(type) {
  return FRIENDLY_SQUAD_DEFINITIONS[type]?.missionKind === MISSION_KIND.RECOVERY;
}

export class DeploymentUi {
  constructor({ store, friendlyForceSystem, notifications, persist }) {
    this.store = store;
    this.system = friendlyForceSystem;
    this.notifications = notifications;
    this.persist = persist;
    this.panel = queryRequired('#deploymentPanel');
    this.title = queryRequired('#deploymentTitle');
    this.body = queryRequired('#deploymentBody');
    this.missionKind = MISSION_KIND.ATTACK;
    this.squadType = 'assault';
    this.originBaseId = null;
    this.targetId = null;
    this.lastRenderAt = 0;
    queryRequired('#closeDeployment').addEventListener('click', () => this.close());
    this.body.addEventListener('click', event => this.handleAction(event));
  }

  openForEnemyBase(targetId) {
    this.missionKind = MISSION_KIND.ATTACK;
    if (isRecoveryType(this.squadType)) this.squadType = 'assault';
    return this.openTarget(targetId);
  }

  openForRecoveryItem(targetId) {
    this.missionKind = MISSION_KIND.RECOVERY;
    this.squadType = 'retrieval';
    return this.openTarget(targetId);
  }

  openTarget(targetId) {
    this.targetId = targetId;
    this.originBaseId = null;
    this.normalizeSelection();
    if (!this.currentTarget()) {
      this.notifications.show(this.missionKind === MISSION_KIND.RECOVERY ? 'この回収物は現在派遣対象にできません。' : 'この敵拠点は現在攻撃対象にできません。');
      return false;
    }
    this.render();
    setVisible(this.panel, true);
    return true;
  }

  close() {
    setVisible(this.panel, false);
  }

  update() {
    if (!this.panel.hidden && Date.now() - this.lastRenderAt >= 1000) {
      if (!this.currentTarget()) {
        this.close();
        return;
      }
      this.render();
    }
  }

  availableTypes() {
    return FRIENDLY_SQUAD_TYPES.filter(type => this.missionKind === MISSION_KIND.RECOVERY ? isRecoveryType(type) : !isRecoveryType(type));
  }

  currentTarget(state = this.store.select(value => value)) {
    if (this.missionKind === MISSION_KIND.RECOVERY) {
      return (state.world.recoveryItems ?? []).find(item => item.id === this.targetId && item.status === RECOVERY_ITEM_STATUS.AVAILABLE) ?? null;
    }
    return state.world.enemyBases.find(base => base.id === this.targetId && base.alive && base.hp > 0) ?? null;
  }

  normalizeSelection() {
    const state = this.store.select(value => value);
    const availableTypes = this.availableTypes();
    const selectedDefinition = FRIENDLY_SQUAD_DEFINITIONS[this.squadType];
    if (!availableTypes.includes(this.squadType) || !selectedDefinition || (state.civilization?.level ?? 0) < selectedDefinition.unlockLevel) {
      this.squadType = availableTypes.find(type => (state.civilization?.level ?? 0) >= FRIENDLY_SQUAD_DEFINITIONS[type].unlockLevel) ?? availableTypes[0] ?? 'assault';
    }
    const bases = deploymentBases(state, this.squadType);
    if (!bases.some(base => base.id === this.originBaseId)) this.originBaseId = bases[0]?.id ?? null;
  }

  handleAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, baseId, squadType } = button.dataset;
    if (action === 'select-unit' && squadType) {
      const state = this.store.select(value => value);
      const definition = FRIENDLY_SQUAD_DEFINITIONS[squadType];
      if (!definition || !this.availableTypes().includes(squadType) || (state.civilization?.level ?? 0) < definition.unlockLevel) return;
      this.squadType = squadType;
      this.originBaseId = null;
    }
    if (action === 'select-origin') this.originBaseId = baseId;
    if (action === 'dispatch') {
      let result;
      this.store.mutate(state => { result = this.system.dispatch(state, this.originBaseId, this.targetId, this.squadType); }, 'friendly:dispatch', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(result?.reason ?? '派兵できません。');
      else {
        this.notifications.show(`${FRIENDLY_SQUAD_DEFINITIONS[this.squadType].name}を派兵しました。`);
        this.persist?.();
        this.close();
        return;
      }
    }
    this.normalizeSelection();
    this.render();
  }

  targetMarkup(target) {
    if (this.missionKind === MISSION_KIND.RECOVERY) {
      const presentation = recoveryItemPresentation(target);
      return `<div class="deploymentTargetSummary recoveryTarget"><span>RECOVERY TARGET</span><strong>${presentation.name}</strong><small>${presentation.sourceName}跡地・確保後は拠点への帰還が必要</small></div>`;
    }
    const definition = ENEMY_BASE_DEFINITIONS[target.type];
    return `<div class="deploymentTargetSummary hostile"><span>ATTACK TARGET</span><strong>${definition?.name ?? '敵拠点'}</strong><small>HP ${Math.ceil(target.hp)}/${target.maxHp}・Lv.${target.level ?? 1}</small></div>`;
  }

  render() {
    const state = this.store.select(value => value);
    this.lastRenderAt = Date.now();
    this.normalizeSelection();
    const target = this.currentTarget(state);
    if (!target) return;
    const civilizationLevel = state.civilization?.level ?? 0;
    const definition = FRIENDLY_SQUAD_DEFINITIONS[this.squadType] ?? FRIENDLY_SQUAD_DEFINITIONS.assault;
    const bases = deploymentBases(state, this.squadType);
    const recoveryMission = this.missionKind === MISSION_KIND.RECOVERY;
    const preview = this.originBaseId
      ? this.system.previewDeployment(state, this.originBaseId, this.targetId, this.squadType)
      : { ok: false, reason: '出撃元を選択してください。' };

    this.title.textContent = recoveryMission ? '選択回収物への派遣' : '選択敵拠点への派兵';

    const unitCards = this.availableTypes().map(type => {
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

    const origin = ownedBaseById(state, this.originBaseId, { includeDestroyed: true });
    this.body.innerHTML = `
      <section class="deploymentTargetSection"><h2>選択中の目標</h2>${this.targetMarkup(target)}</section>
      <section><h2>部隊種類</h2><div class="deploymentGrid deploymentUnitGrid">${unitCards}</div></section>
      <section><h2>出撃元</h2><div class="deploymentGrid">${originCards}</div></section>
      <section class="deploymentOrder"><h2>派兵確認</h2>
        <div class="contextMetricGrid"><span><small>FROM</small><strong>${origin?.name ?? '未選択'}</strong></span><span><small>UNIT</small><strong>${definition.name}</strong></span><span><small>ROUTE</small><strong>${routeText(preview.routeDistance)}</strong></span><span><small>COST</small><strong>${preview.reuseReadySquad ? '不要' : bundleText(definition.cost)}</strong></span></div>
        <p class="sectionNote">${preview.ok ? preview.reuseReadySquad ? '回復・再編成済みの同じ部隊を、追加費用なしで再出撃させます。' : preview.replaceReadySquad ? '待機中の別部隊を解散し、新しい部隊を編成します。' : definition.description : preview.reason}</p>
        <button class="primary wideButton" data-action="dispatch" ${preview.ok ? '' : 'disabled'}>${preview.reuseReadySquad ? `${definition.name}を再出撃` : preview.replaceReadySquad ? `${definition.name}へ再編成` : recoveryMission ? `${definition.name}を派遣` : `この敵拠点へ${definition.name}を派兵`}</button>
      </section>`;
  }
}
