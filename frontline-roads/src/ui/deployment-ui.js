import { deploymentBases, ownedBaseById } from '../base/field-bases.js';
import { ENEMY_BASE_DEFINITIONS, ENEMY_DEFINITIONS } from '../combat/definitions.js';
import {
  FRIENDLY_SQUAD_DEFINITIONS, FRIENDLY_SQUAD_TYPES, friendlySquadCapacityStatus,
  friendlyGlobalCommandStatus, friendlyCoordinatedDeploymentLimit, COORDINATED_DEPLOYMENT_TIMING
} from '../combat/friendly-force-system.js';
import { bundleText } from '../civilization/inventory-system.js';
import { RECOVERY_ITEM_STATUS, recoveryItemPresentation } from '../exploration/recovery-system.js';
import { friendlySquadXpForNextLevel } from '../combat/friendly-force-definitions.js';
import { bindDismissibleModal, queryRequired, setVisible } from './dom.js';

const MISSION_KIND = Object.freeze({ ATTACK: 'ATTACK', INTERCEPT: 'INTERCEPT', RECOVERY: 'RECOVERY' });
const DEPLOYMENT_MODE = Object.freeze({ SINGLE: 'SINGLE', COORDINATED: 'COORDINATED' });

function routeText(distance) {
  if (!Number.isFinite(distance)) return '経路なし';
  if (distance < 1000) return `${Math.round(distance)}m`;
  return `${(distance / 1000).toFixed(1)}km`;
}

function durationText(seconds) {
  if (!Number.isFinite(seconds)) return '算出不能';
  const value = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return minutes ? `約${minutes}分${remainder ? `${remainder}秒` : ''}` : `約${remainder}秒`;
}

function baseKindLabel(base) {
  return base.kind === 'FIELD' ? '簡易拠点' : '主要拠点';
}

function isRecoveryType(type) {
  return FRIENDLY_SQUAD_DEFINITIONS[type]?.missionKind === MISSION_KIND.RECOVERY;
}

function squadLevelText(squad) {
  if (!squad) return '新規 Lv.1';
  const level = Math.max(1, Math.floor(Number(squad.unitLevel) || 1));
  if (level >= 5) return `Lv.${level} MAX`;
  const next = friendlySquadXpForNextLevel(level);
  return `Lv.${level} XP ${Math.floor(Number(squad.unitXp) || 0)}/${Number.isFinite(next) ? next : 'MAX'}`;
}

function shortestRecoveryRemainingForBase(state, baseId) {
  const values = (state.combat?.friendlySquads ?? [])
    .filter(squad => squad.originBaseId === baseId && squad.status === 'RECOVERING' && squad.hp > 0)
    .map(squad => Math.max(0, Number(squad.reorganizationRemaining) || 0))
    .filter(value => value > 0)
    .sort((a, b) => a - b);
  return values[0] ?? 0;
}

function baseSquadLevelSummary(state, baseId, type) {
  if (!baseId) return '出撃元選択後にLv/XPを表示';
  const squads = (state.combat?.friendlySquads ?? [])
    .filter(squad => squad.originBaseId === baseId && squad.type === type && squad.hp > 0)
    .sort((a, b) => (b.status === 'READY') - (a.status === 'READY') || (b.unitLevel ?? 1) - (a.unitLevel ?? 1) || (b.unitXp ?? 0) - (a.unitXp ?? 0));
  if (!squads.length) return '新規編成 Lv.1 XP 0/80';
  const ready = squads.find(squad => squad.status === 'READY');
  const recovering = squads.find(squad => squad.status === 'RECOVERING');
  const active = squads.find(squad => !['READY', 'RECOVERING'].includes(squad.status));
  if (ready) return `待機 ${squadLevelText(ready)}`;
  if (recovering) return `回復中 ${squadLevelText(recovering)}・残り ${durationText(recovering.reorganizationRemaining)}`;
  return `運用中 ${squadLevelText(active ?? squads[0])}`;
}

export class DeploymentUi {
  constructor({ store, friendlyForceSystem, notifications, persist, beginRoutePlanning = null, i18n = null }) {
    this.store = store;
    this.system = friendlyForceSystem;
    this.notifications = notifications;
    this.persist = persist;
    this.beginRoutePlanning = beginRoutePlanning;
    this.i18n = i18n;
    this.panel = queryRequired('#deploymentPanel');
    this.title = queryRequired('#deploymentTitle');
    this.body = queryRequired('#deploymentBody');
    this.missionKind = MISSION_KIND.ATTACK;
    this.mode = DEPLOYMENT_MODE.SINGLE;
    this.squadType = 'assault';
    this.groupCounts = Object.create(null);
    this.coordinatedTimingMode = COORDINATED_DEPLOYMENT_TIMING.LEAD;
    this.coordinatedManualDelays = Object.create(null);
    this.originBaseId = null;
    this.targetId = null;
    this.targetKind = 'enemyBase';
    this.selectedRoutePlan = null;
    this.lastRenderAt = 0;
    queryRequired('#closeDeployment').addEventListener('click', () => this.close());
    bindDismissibleModal(this.panel, () => this.close());
    this.body.addEventListener('click', event => this.handleAction(event));
  }

  localize(text = '') { return this.i18n?.copy?.(text) ?? text; }

  openForEnemyBase(targetId) {
    this.missionKind = MISSION_KIND.ATTACK;
    this.targetKind = 'enemyBase';
    this.selectedRoutePlan = null;
    this.mode = DEPLOYMENT_MODE.SINGLE;
    if (isRecoveryType(this.squadType)) this.squadType = 'assault';
    this.resetGroupSelection();
    return this.openTarget(targetId);
  }

  openForEnemy(targetId) {
    this.missionKind = MISSION_KIND.INTERCEPT;
    this.targetKind = 'enemy';
    this.mode = DEPLOYMENT_MODE.SINGLE;
    if (isRecoveryType(this.squadType)) this.squadType = 'assault';
    this.groupCounts = Object.create(null);
    return this.openTarget(targetId);
  }

  openForRecoveryItem(targetId) {
    this.missionKind = MISSION_KIND.RECOVERY;
    this.targetKind = 'recoveryItem';
    this.mode = DEPLOYMENT_MODE.SINGLE;
    this.squadType = 'retrieval';
    this.groupCounts = Object.create(null);
    return this.openTarget(targetId);
  }

  openTarget(targetId) {
    this.targetId = targetId;
    this.selectedRoutePlan = null;
    this.originBaseId = null;
    const state = this.store.snapshot();
    this.normalizeSelection(state);
    if (!this.currentTarget(state)) {
      const message = this.missionKind === MISSION_KIND.RECOVERY
        ? 'この回収物は現在派遣対象にできません。'
        : this.missionKind === MISSION_KIND.INTERCEPT
          ? 'この敵部隊は現在迎撃対象にできません。'
          : 'この敵拠点は現在攻撃対象にできません。';
      this.notifications.show(this.localize(message));
      return false;
    }
    this.render(state);
    setVisible(this.panel, true);
    return true;
  }

  close() {
    setVisible(this.panel, false);
  }

  update(state = this.store.snapshot()) {
    if (!this.panel.hidden && Date.now() - this.lastRenderAt >= 1000) {
      if (!this.currentTarget(state)) {
        this.close();
        return;
      }
      this.render(state);
    }
  }

  availableTypes() {
    return FRIENDLY_SQUAD_TYPES.filter(type => this.missionKind === MISSION_KIND.RECOVERY ? isRecoveryType(type) : !isRecoveryType(type));
  }

  unlockedAttackTypes(state = this.store.snapshot()) {
    return this.availableTypes().filter(type => (state.civilization?.level ?? 0) >= FRIENDLY_SQUAD_DEFINITIONS[type].unlockLevel);
  }

  currentTarget(state = this.store.snapshot()) {
    if (this.missionKind === MISSION_KIND.RECOVERY) {
      return (state.world.recoveryItems ?? []).find(item => item.id === this.targetId && item.status === RECOVERY_ITEM_STATUS.AVAILABLE) ?? null;
    }
    if (this.missionKind === MISSION_KIND.INTERCEPT) {
      return state.combat.enemies.find(enemy => enemy.id === this.targetId && enemy.hp > 0 && enemy.departDelay <= 0) ?? null;
    }
    return state.world.enemyBases.find(base => base.id === this.targetId && base.alive && base.hp > 0) ?? null;
  }

  resetGroupSelection() {
    const state = this.store.snapshot();
    const types = this.unlockedAttackTypes(state);
    this.groupCounts = Object.create(null);
    const first = types.includes('assault') ? 'assault' : types[0];
    if (first) this.groupCounts[first] = 2;
  }

  groupSquadTypes() {
    return this.availableTypes().flatMap(type => Array.from({ length: Math.max(0, Math.floor(this.groupCounts[type] ?? 0)) }, () => type));
  }

  coordinatedOptions() {
    return { timingMode: this.coordinatedTimingMode, manualDelays: this.coordinatedManualDelays, routeOverride: this.selectedRoutePlan?.route?.path ?? null };
  }

  manualDelayFor(type) {
    return Math.max(0, Math.min(180, Math.floor(Number(this.coordinatedManualDelays[type]) || 0)));
  }

  normalizeSelection(state = this.store.snapshot()) {
    const previousType = this.squadType;
    const previousOriginBaseId = this.originBaseId;
    const availableTypes = this.availableTypes();
    const selectedDefinition = FRIENDLY_SQUAD_DEFINITIONS[this.squadType];
    if (!availableTypes.includes(this.squadType) || !selectedDefinition || (state.civilization?.level ?? 0) < selectedDefinition.unlockLevel) {
      this.squadType = availableTypes.find(type => (state.civilization?.level ?? 0) >= FRIENDLY_SQUAD_DEFINITIONS[type].unlockLevel) ?? availableTypes[0] ?? 'assault';
    }
    const bases = deploymentBases(state, this.squadType);
    if (!bases.some(base => base.id === this.originBaseId)) this.originBaseId = bases[0]?.id ?? null;
    if (previousType !== this.squadType || previousOriginBaseId !== this.originBaseId) this.selectedRoutePlan = null;
    for (const type of Object.keys(this.groupCounts)) {
      if (!availableTypes.includes(type) || (state.civilization?.level ?? 0) < FRIENDLY_SQUAD_DEFINITIONS[type].unlockLevel) delete this.groupCounts[type];
    }
  }

  dispatchCurrent(routeOverride = this.selectedRoutePlan?.route?.path ?? null) {
    let result;
    this.store.transaction(state => {
      result = this.system.dispatch(state, this.originBaseId, this.targetId, this.squadType, this.targetKind, routeOverride);
    }, 'friendly:dispatch', { emit: true, validate: true });
    if (!result?.ok) {
      this.notifications.show(this.localize(result?.reason ?? '派兵できません。'));
      return result ?? { ok: false };
    }
    this.notifications.show(this.localize(`${FRIENDLY_SQUAD_DEFINITIONS[this.squadType].name}を派兵しました。`));
    this.persist?.();
    this.close();
    return result;
  }

  handleAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, baseId, squadType } = button.dataset;
    if (action === 'deployment-mode') {
      this.mode = button.dataset.mode === DEPLOYMENT_MODE.COORDINATED ? DEPLOYMENT_MODE.COORDINATED : DEPLOYMENT_MODE.SINGLE;
      this.selectedRoutePlan = null;
      if (this.mode === DEPLOYMENT_MODE.COORDINATED && this.groupSquadTypes().length === 0) this.resetGroupSelection();
    }
    if (action === 'select-unit' && squadType) {
      const state = this.store.snapshot();
      const definition = FRIENDLY_SQUAD_DEFINITIONS[squadType];
      if (!definition || !this.availableTypes().includes(squadType) || (state.civilization?.level ?? 0) < definition.unlockLevel) return;
      this.squadType = squadType;
      this.originBaseId = null;
      this.selectedRoutePlan = null;
    }
    if (action === 'group-add' && squadType) {
      const total = this.groupSquadTypes().length;
      const maximum = friendlyCoordinatedDeploymentLimit(this.store.snapshot());
      if (total < maximum) this.groupCounts[squadType] = (this.groupCounts[squadType] ?? 0) + 1;
    }
    if (action === 'group-remove' && squadType) {
      this.groupCounts[squadType] = Math.max(0, (this.groupCounts[squadType] ?? 0) - 1);
    }
    if (action === 'select-origin') { this.originBaseId = baseId; this.selectedRoutePlan = null; }
    if (action === 'plan-route') {
      const state = this.store.snapshot();
      const origin = ownedBaseById(state, this.originBaseId);
      const target = this.currentTarget(state);
      const preview = this.originBaseId
        ? this.system.previewDeployment(state, this.originBaseId, this.targetId, this.squadType, this.targetKind, this.selectedRoutePlan?.route?.path ?? null)
        : { ok: false, reason: '出撃元を選択してください。' };
      const blockedByPreview = !preview.ok && !String(preview.reason ?? '').includes('選択した派兵経路');
      if (blockedByPreview) {
        this.notifications.show(preview.reason ?? '派兵条件を満たしていないため、経路指定できません。');
      } else if (!origin || !target?.nodeId || typeof this.beginRoutePlanning !== 'function') {
        this.notifications.show('派兵経路を指定できません。出撃元と目標を確認してください。');
      } else {
        const targetLabel = this.missionKind === MISSION_KIND.RECOVERY
          ? recoveryItemPresentation(target).name
          : this.missionKind === MISSION_KIND.INTERCEPT
            ? ENEMY_DEFINITIONS[target.type]?.name ?? '敵部隊'
            : ENEMY_BASE_DEFINITIONS[target.type]?.name ?? '敵拠点';
        const opened = this.beginRoutePlanning({
          originNodeId: origin.nodeId,
          squadType: this.squadType,
          destinationNodeId: target.nodeId,
          targetLabel,
          confirmLabel: this.missionKind === MISSION_KIND.RECOVERY ? 'この経路で回収部隊を派遣' : 'この経路で派兵',
          onConfirm: plan => {
            const result = this.dispatchCurrent(plan?.route?.path ?? null);
            if (!result?.ok) {
              this.selectedRoutePlan = plan;
              this.render();
              setVisible(this.panel, true);
            }
          },
          onCancel: () => {
            this.render();
            setVisible(this.panel, true);
          }
        });
        if (opened) { this.close(); return; }
      }
    }
    if (action === 'dispatch') {
      const result = this.dispatchCurrent(this.selectedRoutePlan?.route?.path ?? null);
      if (result?.ok) return;
    }
    if (action === 'coord-timing') {
      const mode = button.dataset.mode;
      this.coordinatedTimingMode = Object.values(COORDINATED_DEPLOYMENT_TIMING).includes(mode) ? mode : COORDINATED_DEPLOYMENT_TIMING.LEAD;
    }
    if (action === 'delay-minus' && squadType) {
      this.coordinatedTimingMode = COORDINATED_DEPLOYMENT_TIMING.MANUAL;
      this.coordinatedManualDelays[squadType] = Math.max(0, this.manualDelayFor(squadType) - 5);
    }
    if (action === 'delay-plus' && squadType) {
      this.coordinatedTimingMode = COORDINATED_DEPLOYMENT_TIMING.MANUAL;
      this.coordinatedManualDelays[squadType] = Math.min(180, this.manualDelayFor(squadType) + 5);
    }
    if (action === 'plan-coordinated-route') {
      const state = this.store.snapshot();
      const squadTypes = this.groupSquadTypes();
      const target = this.currentTarget(state);
      const preview = this.system.previewCoordinatedDeployment(state, this.targetId, squadTypes, this.coordinatedOptions());
      const fallbackPreview = preview.origin ? preview : this.system.previewCoordinatedDeployment(state, this.targetId, squadTypes, { ...this.coordinatedOptions(), routeOverride: null });
      const origin = fallbackPreview.origin;
      if (squadTypes.length < 2) {
        this.notifications.show('連携出撃には2部隊以上を選択してください。');
      } else if (!origin || !target?.nodeId || typeof this.beginRoutePlanning !== 'function') {
        this.notifications.show(fallbackPreview.reason ?? '連携出撃の共通経路を指定できません。');
      } else {
        const targetLabel = ENEMY_BASE_DEFINITIONS[target.type]?.name ?? '敵拠点';
        const opened = this.beginRoutePlanning({
          originNodeId: origin.nodeId,
          squadType: squadTypes[0] ?? 'assault',
          destinationNodeId: target.nodeId,
          targetLabel,
          confirmLabel: 'この経路を連携出撃に採用',
          onConfirm: plan => {
            this.selectedRoutePlan = plan;
            this.render();
            setVisible(this.panel, true);
          },
          onCancel: () => {
            this.render();
            setVisible(this.panel, true);
          }
        });
        if (opened) { this.close(); return; }
      }
    }
    if (action === 'dispatch-group') {
      let result;
      const squadTypes = this.groupSquadTypes();
      this.store.transaction(state => { result = this.system.dispatchCoordinated(state, this.targetId, squadTypes, this.coordinatedOptions()); }, 'friendly:coordinated-dispatch', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(result?.reason ?? '連携出撃できません。');
      else {
        this.notifications.show(`${result.squads.length}部隊が同じルートで連携出撃しました。`);
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
    if (this.missionKind === MISSION_KIND.INTERCEPT) {
      const definition = ENEMY_DEFINITIONS[target.type];
      return `<div class="deploymentTargetSummary hostile"><span>INTERCEPT TARGET</span><strong>${definition?.name ?? '敵部隊'}</strong><small>HP ${Math.ceil(target.hp)}/${target.maxHp}・Lv.${target.level ?? 1}・移動目標を追跡</small></div>`;
    }
    const definition = ENEMY_BASE_DEFINITIONS[target.type];
    return `<div class="deploymentTargetSummary hostile"><span>ATTACK TARGET</span><strong>${definition?.name ?? '敵拠点'}</strong><small>HP ${Math.ceil(target.hp)}/${target.maxHp}・Lv.${target.level ?? 1}</small></div>`;
  }

  modeMarkup() {
    if (this.missionKind !== MISSION_KIND.ATTACK) return '';
    return `<div class="deploymentModeSwitch" role="group" aria-label="派兵方式"><button data-action="deployment-mode" data-mode="${DEPLOYMENT_MODE.SINGLE}" class="${this.mode === DEPLOYMENT_MODE.SINGLE ? 'selected' : ''}">単独出撃</button><button data-action="deployment-mode" data-mode="${DEPLOYMENT_MODE.COORDINATED}" class="${this.mode === DEPLOYMENT_MODE.COORDINATED ? 'selected' : ''}">連携出撃</button></div>`;
  }

  unitCardsMarkup(state) {
    const civilizationLevel = state.civilization?.level ?? 0;
    return this.availableTypes().map(type => {
      const item = FRIENDLY_SQUAD_DEFINITIONS[type];
      const unlocked = civilizationLevel >= item.unlockLevel;
      const selected = type === this.squadType;
      const baseText = item.allowedBaseKinds.includes('FIELD') ? '主要・簡易' : '主要のみ';
      const levelSummary = unlocked ? baseSquadLevelSummary(state, this.originBaseId, type) : `文明Lv.${item.unlockLevel}で解禁`;
      return `<button class="deploymentCard unitCard ${selected ? 'selected' : ''}" data-action="select-unit" data-squad-type="${type}" ${unlocked ? '' : 'disabled'}><strong>${item.name}</strong><span>${item.role}・${baseText}</span><small>${unlocked ? item.description : `文明Lv.${item.unlockLevel}で解禁`}</small><small>${levelSummary}</small></button>`;
    }).join('');
  }

  groupCardsMarkup(state) {
    const total = this.groupSquadTypes().length;
    const maximum = friendlyCoordinatedDeploymentLimit(state);
    return this.availableTypes().map(type => {
      const item = FRIENDLY_SQUAD_DEFINITIONS[type];
      const unlocked = (state.civilization?.level ?? 0) >= item.unlockLevel;
      const count = this.groupCounts[type] ?? 0;
      const baseText = item.allowedBaseKinds.includes('FIELD') ? '主要・簡易' : '主要のみ';
      return `<article class="deploymentCard coordinatedUnitCard ${count ? 'selected' : ''} ${unlocked ? '' : 'locked'}"><div><strong>${item.name}</strong><span>${item.role}・${baseText}</span><small>${unlocked ? item.description : `文明Lv.${item.unlockLevel}で解禁`}</small></div><div class="squadCountControl"><button data-action="group-remove" data-squad-type="${type}" ${!unlocked || count <= 0 ? 'disabled' : ''}>−</button><b>${count}</b><button data-action="group-add" data-squad-type="${type}" ${!unlocked || total >= maximum ? 'disabled' : ''}>＋</button></div></article>`;
    }).join('');
  }

  singleDeploymentMarkup(state) {
    const definition = FRIENDLY_SQUAD_DEFINITIONS[this.squadType] ?? FRIENDLY_SQUAD_DEFINITIONS.assault;
    const bases = deploymentBases(state, this.squadType);
    const recoveryMission = this.missionKind === MISSION_KIND.RECOVERY;
    const preview = this.originBaseId
      ? this.system.previewDeployment(state, this.originBaseId, this.targetId, this.squadType, this.targetKind, this.selectedRoutePlan?.route?.path ?? null)
      : { ok: false, reason: '出撃元を選択してください。' };
    const originCards = bases.map(base => {
      const capacity = friendlySquadCapacityStatus(state, base);
      const baseSquads = (state.combat?.friendlySquads ?? []).filter(squad => squad.originBaseId === base.id && squad.hp > 0);
      const highestLevel = baseSquads.reduce((best, squad) => Math.max(best, Math.floor(Number(squad.unitLevel) || 1)), 1);
      const recoveryRemaining = shortestRecoveryRemainingForBase(state, base.id);
      const statusParts = [
        `部隊枠 ${capacity.assigned}/${capacity.capacity}`,
        `派兵中 ${capacity.active}`,
        capacity.recovering ? `回復 ${capacity.recovering}${recoveryRemaining ? ` 最短${durationText(recoveryRemaining)}` : ''}` : null,
        capacity.ready ? `待機 ${capacity.ready}` : null,
        baseSquads.length ? `最高Lv.${highestLevel}` : '新規Lv.1'
      ].filter(Boolean).join('・');
      return `<button class="deploymentCard ${base.id === this.originBaseId ? 'selected' : ''}" data-action="select-origin" data-base-id="${base.id}"><strong>${base.name}</strong><span>${baseKindLabel(base)}・HP ${Math.ceil(base.hp)}/${base.maxHp}</span><small>${statusParts}</small></button>`;
    }).join('') || `<p class="emptyText">${definition.name}を出撃できる拠点がありません。</p>`;
    const origin = ownedBaseById(state, this.originBaseId, { includeDestroyed: true });
    const globalCommand = friendlyGlobalCommandStatus(state);
    const selectedRoute = this.selectedRoutePlan?.route ?? null;
    const fixedTarget = this.missionKind !== MISSION_KIND.INTERCEPT;
    const routePlannerBlockedByPreview = !preview.ok && !String(preview.reason ?? '').includes('選択した派兵経路');
    const routePlannerAvailable = Boolean(origin && preview.path && fixedTarget && typeof this.beginRoutePlanning === 'function' && !routePlannerBlockedByPreview);
    const routeSummary = selectedRoute
      ? `${selectedRoute.label}・${routeText(selectedRoute.physicalDistance)}・危険度 ${selectedRoute.risk}・経由 ${this.selectedRoutePlan.waypointNodeIds.length}/2`
      : '自動最短経路。必要なら出撃前に地図上で経路を指定できます。';
    return `<section><h2>部隊種類 <small>全体指揮 ${globalCommand.assigned}/${globalCommand.capacity}</small></h2><div class="deploymentGrid deploymentUnitGrid">${this.unitCardsMarkup(state)}</div></section>
      <section><h2>出撃元</h2><div class="deploymentGrid">${originCards}</div></section>
      <section class="deploymentOrder"><h2>派兵確認</h2>
        <div class="contextMetricGrid"><span><small>FROM</small><strong>${origin?.name ?? '未選択'}</strong></span><span><small>UNIT</small><strong>${definition.name}</strong></span><span><small>ROUTE</small><strong>${selectedRoute?.label ?? 'AUTO'} ${routeText(preview.routeDistance)}</strong></span><span><small>SLOT</small><strong>${preview.capacity ? `${preview.assignedSquads ?? 0}/${preview.capacity}` : '—'}</strong></span><span><small>COST</small><strong>${preview.reuseReadySquad ? '不要' : bundleText(definition.cost)}</strong></span></div>
        <p class="sectionNote">${routeSummary}</p>
        <button class="wideButton" data-action="plan-route" ${routePlannerAvailable ? '' : 'disabled'}>${selectedRoute ? '派兵経路を変更' : '地図で派兵経路を指定'}</button>
        <p class="sectionNote">${preview.ok ? preview.reuseReadySquad ? '再編成済みの同じ部隊を、現在HPのまま追加費用なしで再出撃させます。' : preview.replaceReadySquad ? '待機中の別部隊を解散し、新しい部隊を編成します。' : definition.description : preview.reason}</p>
        <button class="primary wideButton" data-action="dispatch" ${preview.ok ? '' : 'disabled'}>${preview.reuseReadySquad ? `${definition.name}を再出撃` : preview.replaceReadySquad ? `${definition.name}へ再編成` : recoveryMission ? `${definition.name}を派遣` : this.missionKind === MISSION_KIND.INTERCEPT ? `この敵部隊へ${definition.name}を派兵` : `この敵拠点へ${definition.name}を派兵`}</button>
      </section>`;
  }

  timingControlsMarkup() {
    const options = [
      [COORDINATED_DEPLOYMENT_TIMING.LEAD, '先導', '遊撃を先に出し、攻城を後方に置きます。'],
      [COORDINATED_DEPLOYMENT_TIMING.SYNCHRONIZED, '同時到着', '遅い部隊を先に出し、到着時刻を寄せます。'],
      [COORDINATED_DEPLOYMENT_TIMING.MANUAL, '手動', '部隊種類ごとの遅延を指定します。']
    ];
    return `<div class="deploymentModeSwitch deploymentTimingSwitch" role="group" aria-label="連携出撃タイミング">${options.map(([mode, label, title]) => `<button data-action="coord-timing" data-mode="${mode}" class="${this.coordinatedTimingMode === mode ? 'selected' : ''}" title="${title}">${label}</button>`).join('')}</div>`;
  }

  manualDelayControlsMarkup(state) {
    if (this.coordinatedTimingMode !== COORDINATED_DEPLOYMENT_TIMING.MANUAL) return '';
    return `<div class="formationAssignments manualDelayList">${this.availableTypes().filter(type => (this.groupCounts[type] ?? 0) > 0).map(type => {
      const definition = FRIENDLY_SQUAD_DEFINITIONS[type];
      return `<div><strong>${definition.name}</strong><span class="squadCountControl"><button data-action="delay-minus" data-squad-type="${type}">−5</button><b>${this.manualDelayFor(type)}秒</b><button data-action="delay-plus" data-squad-type="${type}">＋5</button></span></div>`;
    }).join('')}</div>`;
  }

  coordinatedDeploymentMarkup(state) {
    const squadTypes = this.groupSquadTypes();
    const maximum = friendlyCoordinatedDeploymentLimit(state);
    const globalCommand = friendlyGlobalCommandStatus(state);
    const preview = this.system.previewCoordinatedDeployment(state, this.targetId, squadTypes, this.coordinatedOptions());
    const selectedRoute = this.selectedRoutePlan?.route ?? null;
    const routePlannerAvailable = Boolean(squadTypes.length >= 2 && preview.origin && this.currentTarget(state)?.nodeId && typeof this.beginRoutePlanning === 'function');
    const routeLabel = selectedRoute
      ? `${selectedRoute.label}・${routeText(selectedRoute.physicalDistance)}・危険度 ${selectedRoute.risk}・経由 ${this.selectedRoutePlan.waypointNodeIds.length}/2`
      : preview.commonRouteDistance ? `自動共通・${routeText(preview.commonRouteDistance)}` : '未決定';
    const assignments = (preview.assignments ?? []).map(assignment => `<li><strong>${assignment.definition.name}</strong><span>${assignment.formationRole ?? '本隊'}・${assignment.origin.name}・共通${routeText(assignment.routeDistance)}・待機 ${durationText(assignment.departDelay)}</span></li>`).join('');
    return `<section><h2>連携編成 <small>${squadTypes.length}/${maximum}部隊・全体指揮 ${globalCommand.assigned}/${globalCommand.capacity}</small></h2><p class="sectionNote">連携出撃は、同じ拠点から同じルートで進軍します。出撃前にMAP上で共通経路を指定できます。</p><div class="deploymentGrid coordinatedUnitGrid">${this.groupCardsMarkup(state)}</div></section>
      <section class="deploymentOrder coordinatedOrder"><h2>進軍方式</h2>
        <div class="contextMetricGrid"><span><small>ROUTE</small><strong>${routeLabel}</strong></span><span><small>ORIGIN</small><strong>${preview.origin?.name ?? '—'}</strong></span><span><small>TIMING</small><strong>${preview.timingLabel ?? '先導'}</strong></span><span><small>ARRIVAL</small><strong>${durationText(preview.estimatedArrivalSeconds)}</strong></span></div>
        <button class="wideButton" data-action="plan-coordinated-route" ${routePlannerAvailable ? '' : 'disabled'}>${selectedRoute ? '連携経路を変更' : 'MAPで連携経路を指定'}</button>
        ${this.timingControlsMarkup()}
        ${this.manualDelayControlsMarkup(state)}
        ${assignments ? `<ol class="formationAssignments">${assignments}</ol>` : ''}
        <p class="sectionNote">${preview.ok ? selectedRoute ? '選択した共通経路で全連携部隊が進軍します。タイミングだけを変更しても経路は維持されます。' : '自動共通経路で出撃できます。必要ならMAPで経由地点を指定してから連携出撃してください。' : preview.reason}</p>
        <div class="contextMetricGrid"><span><small>SQUADS</small><strong>${squadTypes.length}</strong></span><span><small>COST</small><strong>${bundleText(preview.cost ?? {})}</strong></span></div>
        <button class="primary wideButton" data-action="dispatch-group" ${preview.ok ? '' : 'disabled'}>${squadTypes.length}部隊で連携出撃</button>
      </section>`;
  }

  render(state = this.store.snapshot()) {
    this.lastRenderAt = Date.now();
    this.normalizeSelection(state);
    const target = this.currentTarget(state);
    if (!target) return;
    const recoveryMission = this.missionKind === MISSION_KIND.RECOVERY;
    const interceptMission = this.missionKind === MISSION_KIND.INTERCEPT;
    if (recoveryMission || interceptMission) this.mode = DEPLOYMENT_MODE.SINGLE;
    this.title.textContent = this.localize(recoveryMission ? '選択回収物への派遣' : interceptMission ? '選択敵部隊への迎撃派兵' : '選択敵拠点への派兵');
    const content = this.mode === DEPLOYMENT_MODE.COORDINATED && !recoveryMission && !interceptMission
      ? this.coordinatedDeploymentMarkup(state)
      : this.singleDeploymentMarkup(state);
    this.body.innerHTML = this.localize(`<section class="deploymentTargetSection"><h2>選択中の目標</h2>${this.targetMarkup(target)}</section>${this.modeMarkup()}${content}`);
  }
}
