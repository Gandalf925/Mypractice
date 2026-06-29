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
  if (!Number.isFinite(distance)) return 'No route';
  if (distance < 1000) return `${Math.round(distance)}m`;
  return `${(distance / 1000).toFixed(1)}km`;
}

function durationText(seconds) {
  if (!Number.isFinite(seconds)) return 'Unknown';
  const value = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return minutes ? `about${minutes} min${remainder ? `${remainder} sec` : ''}` : `about${remainder} sec`;
}

function baseKindLabel(base) {
  return base.kind === 'FIELD' ? 'Simple Base' : 'Major Base';
}

function isRecoveryType(type) {
  return FRIENDLY_SQUAD_DEFINITIONS[type]?.missionKind === MISSION_KIND.RECOVERY;
}

function squadLevelText(squad) {
  if (!squad) return 'Lv.1';
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
  if (!baseId) return 'Select a dispatch origin to show Lv / XP.';
  const squads = (state.combat?.friendlySquads ?? [])
    .filter(squad => squad.originBaseId === baseId && squad.type === type && squad.hp > 0)
    .sort((a, b) => (b.status === 'READY') - (a.status === 'READY') || (b.unitLevel ?? 1) - (a.unitLevel ?? 1) || (b.unitXp ?? 0) - (a.unitXp ?? 0));
  if (!squads.length) return 'New unit Lv.1 XP 0/80';
  const ready = squads.find(squad => squad.status === 'READY');
  const recovering = squads.find(squad => squad.status === 'RECOVERING');
  const active = squads.find(squad => !['READY', 'RECOVERING'].includes(squad.status));
  if (ready) return `waiting ${squadLevelText(ready)}`;
  if (recovering) return `Recovering ${squadLevelText(recovering)} · remaining ${durationText(recovering.reorganizationRemaining)}`;
  return `in progress ${squadLevelText(active ?? squads[0])}`;
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
        ? 'this of RecoveryItem currentdispatchtarget at cannot.'
        : this.missionKind === MISSION_KIND.INTERCEPT
          ? 'this of enemy squad currentinterceptiontarget at cannot.'
          : 'this of Enemy base currentAttacktarget at cannot.';
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
      this.notifications.show(this.localize(result?.reason ?? 'Cannot dispatch.'));
      return result ?? { ok: false };
    }
    this.notifications.show(this.localize(`${FRIENDLY_SQUAD_DEFINITIONS[this.squadType].name} dispatched.`));
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
        : { ok: false, reason: 'Select a dispatch origin.' };
      const blockedByPreview = !preview.ok && !String(preview.reason ?? '').includes('selectedDispatchRoute');
      if (blockedByPreview) {
        this.notifications.show(preview.reason ?? 'Dispatch requirements are not met, so a route cannot be specified.');
      } else if (!origin || !target?.nodeId || typeof this.beginRoutePlanning !== 'function') {
        this.notifications.show('Dispatch route cannot be specified. Check dispatch origin and target.');
      } else {
        const targetLabel = this.missionKind === MISSION_KIND.RECOVERY
          ? recoveryItemPresentation(target).name
          : this.missionKind === MISSION_KIND.INTERCEPT
            ? ENEMY_DEFINITIONS[target.type]?.name ?? 'enemy squad'
            : ENEMY_BASE_DEFINITIONS[target.type]?.name ?? 'Enemy base';
        const opened = this.beginRoutePlanning({
          originNodeId: origin.nodeId,
          squadType: this.squadType,
          destinationNodeId: target.nodeId,
          targetLabel,
          confirmLabel: this.missionKind === MISSION_KIND.RECOVERY ? 'Dispatch Recovery Squad on this route' : 'Dispatch on this route',
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
        this.notifications.show('Select at least two squads for coordinated dispatch.');
      } else if (!origin || !target?.nodeId || typeof this.beginRoutePlanning !== 'function') {
        this.notifications.show(fallbackPreview.reason ?? 'Shared route for coordinated dispatch cannot be specified.');
      } else {
        const targetLabel = ENEMY_BASE_DEFINITIONS[target.type]?.name ?? 'Enemy base';
        const opened = this.beginRoutePlanning({
          originNodeId: origin.nodeId,
          squadType: squadTypes[0] ?? 'assault',
          destinationNodeId: target.nodeId,
          targetLabel,
          confirmLabel: 'this of route coordinateddispatch at',
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
      if (!result?.ok) this.notifications.show(result?.reason ?? 'Coordinated dispatch cannot be executed.');
      else {
        this.notifications.show(`${result.squads.length} squads dispatched on the same route.`);
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
      return `<div class="deploymentTargetSummary recoveryTarget"><span>RECOVERY TARGET</span><strong>${presentation.name}</strong><small>${presentation.sourceName} site; must return to a base after securing it</small></div>`;
    }
    if (this.missionKind === MISSION_KIND.INTERCEPT) {
      const definition = ENEMY_DEFINITIONS[target.type];
      return `<div class="deploymentTargetSummary hostile"><span>INTERCEPT TARGET</span><strong>${definition?.name ?? 'enemy squad'}</strong><small>HP ${Math.ceil(target.hp)}/${target.maxHp} · Lv.${target.level ?? 1} · Tracks moving target</small></div>`;
    }
    const definition = ENEMY_BASE_DEFINITIONS[target.type];
    return `<div class="deploymentTargetSummary hostile"><span>ATTACK TARGET</span><strong>${definition?.name ?? 'Enemy base'}</strong><small>HP ${Math.ceil(target.hp)}/${target.maxHp} · Lv.${target.level ?? 1}</small></div>`;
  }

  modeMarkup() {
    if (this.missionKind !== MISSION_KIND.ATTACK) return '';
    return `<div class="deploymentModeSwitch" role="group" aria-label=""><button data-action="deployment-mode" data-mode="${DEPLOYMENT_MODE.SINGLE}" class="${this.mode === DEPLOYMENT_MODE.SINGLE ? 'selected': ''}">dispatch</button><button data-action="deployment-mode" data-mode="${DEPLOYMENT_MODE.COORDINATED}" class="${this.mode === DEPLOYMENT_MODE.COORDINATED ? 'selected': ''}">coordinateddispatch</button></div>`;
  }

  unitCardsMarkup(state) {
    const civilizationLevel = state.civilization?.level ?? 0;
    return this.availableTypes().map(type => {
      const item = FRIENDLY_SQUAD_DEFINITIONS[type];
      const unlocked = civilizationLevel >= item.unlockLevel;
      const selected = type === this.squadType;
      const baseText = item.allowedBaseKinds.includes('FIELD') ? 'Major · Simple' : 'Major of only';
      const levelSummary = unlocked ? baseSquadLevelSummary(state, this.originBaseId, type) : `Civ Lv.${item.unlockLevel} with Unlocks`;
      return `<button class="deploymentCard unitCard ${selected ? 'selected': ''}" data-action="select-unit" data-squad-type="${type}" ${unlocked ? '': 'disabled'}><strong>${item.name}</strong><span>${item.role} · ${baseText}</span><small>${unlocked ? item.description:`Civ Lv.${item.unlockLevel} with Unlocks`}</small><small>${levelSummary}</small></button>`;
    }).join('');
  }

  groupCardsMarkup(state) {
    const total = this.groupSquadTypes().length;
    const maximum = friendlyCoordinatedDeploymentLimit(state);
    return this.availableTypes().map(type => {
      const item = FRIENDLY_SQUAD_DEFINITIONS[type];
      const unlocked = (state.civilization?.level ?? 0) >= item.unlockLevel;
      const count = this.groupCounts[type] ?? 0;
      const baseText = item.allowedBaseKinds.includes('FIELD') ? 'Major · Simple' : 'Major of only';
      return `<article class="deploymentCard coordinatedUnitCard ${count ? 'selected': ''} ${unlocked ? '': 'locked'}"><div><strong>${item.name}</strong><span>${item.role} · ${baseText}</span><small>${unlocked ? item.description:`Civ Lv.${item.unlockLevel} with Unlocks`}</small></div><div class="squadCountControl"><button data-action="group-remove" data-squad-type="${type}" ${!unlocked || count <= 0 ? 'disabled' : ''}>−</button><b>${count}</b><button data-action="group-add" data-squad-type="${type}" ${!unlocked || total >= maximum ? 'disabled' : ''}>＋</button></div></article>`;
    }).join('');
  }

  singleDeploymentMarkup(state) {
    const definition = FRIENDLY_SQUAD_DEFINITIONS[this.squadType] ?? FRIENDLY_SQUAD_DEFINITIONS.assault;
    const bases = deploymentBases(state, this.squadType);
    const recoveryMission = this.missionKind === MISSION_KIND.RECOVERY;
    const preview = this.originBaseId
      ? this.system.previewDeployment(state, this.originBaseId, this.targetId, this.squadType, this.targetKind, this.selectedRoutePlan?.route?.path ?? null)
      : { ok: false, reason: 'Select a dispatch origin.' };
    const originCards = bases.map(base => {
      const capacity = friendlySquadCapacityStatus(state, base);
      const baseSquads = (state.combat?.friendlySquads ?? []).filter(squad => squad.originBaseId === base.id && squad.hp > 0);
      const highestLevel = baseSquads.reduce((best, squad) => Math.max(best, Math.floor(Number(squad.unitLevel) || 1)), 1);
      const recoveryRemaining = shortestRecoveryRemainingForBase(state, base.id);
      const statusParts = [
        `squad slots ${capacity.assigned}/${capacity.capacity}`,
        `Deployed ${capacity.active}`,
        capacity.recovering ? `healing ${capacity.recovering}${recoveryRemaining ? ` Shortest${durationText(recoveryRemaining)}` : ''}` : null,
        capacity.ready ? `waiting ${capacity.ready}` : null,
        baseSquads.length ? `highestLv.${highestLevel}` : 'Lv.1'
      ].filter(Boolean).join(' · ');
      return `<button class="deploymentCard ${base.id === this.originBaseId ? 'selected' : ''}" data-action="select-origin" data-base-id="${base.id}"><strong>${base.name}</strong><span>${baseKindLabel(base)} · HP ${Math.ceil(base.hp)}/${base.maxHp}</span><small>${statusParts}</small></button>`;
    }).join('') || `<p class="emptyText">No base can dispatch ${definition.name}.</p>`;
    const origin = ownedBaseById(state, this.originBaseId, { includeDestroyed: true });
    const globalCommand = friendlyGlobalCommandStatus(state);
    const selectedRoute = this.selectedRoutePlan?.route ?? null;
    const fixedTarget = this.missionKind !== MISSION_KIND.INTERCEPT;
    const routePlannerBlockedByPreview = !preview.ok && !String(preview.reason ?? '').includes('selectedDispatchRoute');
    const routePlannerAvailable = Boolean(origin && preview.path && fixedTarget && typeof this.beginRoutePlanning === 'function' && !routePlannerBlockedByPreview);
    const routeSummary = selectedRoute
      ? `${selectedRoute.label} · ${routeText(selectedRoute.physicalDistance)} · risk ${selectedRoute.risk} · via ${this.selectedRoutePlan.waypointNodeIds.length}/2`
      : 'Auto shortest route. Specify a route on the map if needed.';
    return `<section><h2>squadtypes <small>global command ${globalCommand.assigned}/${globalCommand.capacity}</small></h2><div class="deploymentGrid deploymentUnitGrid">${this.unitCardsMarkup(state)}</div></section>
      <section><h2>Dispatch origin</h2><div class="deploymentGrid">${originCards}</div></section>
      <section class="deploymentOrder"><h2>Dispatch check</h2>
        <div class="contextMetricGrid"><span><small>FROM</small><strong>${origin?.name ?? 'None'}</strong></span><span><small>UNIT</small><strong>${definition.name}</strong></span><span><small>ROUTE</small><strong>${selectedRoute?.label ?? 'AUTO'} ${routeText(preview.routeDistance)}</strong></span><span><small>SLOT</small><strong>${preview.capacity ? `${preview.assignedSquads ?? 0}/${preview.capacity}` : '—'}</strong></span><span><small>COST</small><strong>${preview.reuseReadySquad ? 'Not needed' : bundleText(definition.cost)}</strong></span></div>
        <p class="sectionNote">${routeSummary}</p>
        <button class="wideButton" data-action="plan-route" ${routePlannerAvailable ? '' : 'disabled'}>${selectedRoute ? 'Change dispatch route' : 'Specify dispatch route on MAP'}</button>
        <p class="sectionNote">${preview.ok ? preview.reuseReadySquad ? 'Redispatch the same reorganized squad at current HP with no additional cost.' : preview.replaceReadySquad ? 'Disband another idle squad and organize a new squad.' : definition.description : preview.reason}</p>
        <button class="primary wideButton" data-action="dispatch" ${preview.ok ? '' : 'disabled'}>${preview.reuseReadySquad ? `${definition.name} redispatch` : preview.replaceReadySquad ? `${definition.name} reorganize into ` : recoveryMission ? `${definition.name} dispatch` : this.missionKind === MISSION_KIND.INTERCEPT ? `Dispatch ${definition.name}` : `Dispatch ${definition.name}`}</button>
      </section>`;
  }

  timingControlsMarkup() {
    const options = [
      [COORDINATED_DEPLOYMENT_TIMING.LEAD, 'Vanguard', 'skirmisher ahead at issue, siege rear at.'],
      [COORDINATED_DEPLOYMENT_TIMING.SYNCHRONIZED, 'synchronized arrival', 'squad ahead at issue,.'],
      [COORDINATED_DEPLOYMENT_TIMING.MANUAL, 'manual', 'Specify by squad.']
    ];
    return `<div class="deploymentModeSwitch deploymentTimingSwitch" role="group" aria-label="coordinateddispatch">${options.map(([mode, label, title]) =>`<button data-action="coord-timing" data-mode="${mode}" class="${this.coordinatedTimingMode === mode ? 'selected' : ''}" title="${title}">${label}</button>`).join('')}</div>`;
  }

  manualDelayControlsMarkup(state) {
    if (this.coordinatedTimingMode !== COORDINATED_DEPLOYMENT_TIMING.MANUAL) return '';
    return `<div class="formationAssignments manualDelayList">${this.availableTypes().filter(type => (this.groupCounts[type] ?? 0) > 0).map(type => {
      const definition = FRIENDLY_SQUAD_DEFINITIONS[type];
      return `<div><strong>${definition.name}</strong><span class="squadCountControl"><button data-action="delay-minus" data-squad-type="${type}">−5</button><b>${this.manualDelayFor(type)} sec</b><button data-action="delay-plus" data-squad-type="${type}">＋5</button></span></div>`;
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
      ? `${selectedRoute.label} · ${routeText(selectedRoute.physicalDistance)} · risk ${selectedRoute.risk} · via ${this.selectedRoutePlan.waypointNodeIds.length}/2`
      : preview.commonRouteDistance ? `auto shared · ${routeText(preview.commonRouteDistance)}` : 'undecided';
    const assignments = (preview.assignments ?? []).map(assignment => `<li><strong>${assignment.definition.name}</strong><span>${assignment.formationRole ?? 'main body'} · ${assignment.origin.name} · shared ${routeText(assignment.routeDistance)} · waiting ${durationText(assignment.departDelay)}</span></li>`).join('');
    return `<section><h2>Coordinated formation <small>${squadTypes.length}/${maximum} squads · global command  ${globalCommand.assigned}/${globalCommand.capacity}</small></h2><p class="sectionNote">Coordinated dispatch advances from the same base along the same route. You can specify a shared route on the map before dispatch.</p><div class="deploymentGrid coordinatedUnitGrid">${this.groupCardsMarkup(state)}</div></section>
      <section class="deploymentOrder coordinatedOrder"><h2>Advance order</h2>
        <div class="contextMetricGrid"><span><small>ROUTE</small><strong>${routeLabel}</strong></span><span><small>ORIGIN</small><strong>${preview.origin?.name ?? '—'}</strong></span><span><small>TIMING</small><strong>${preview.timingLabel ?? 'Vanguard'}</strong></span><span><small>ARRIVAL</small><strong>${durationText(preview.estimatedArrivalSeconds)}</strong></span></div>
        <button class="wideButton" data-action="plan-coordinated-route" ${routePlannerAvailable ? '' : 'disabled'}>${selectedRoute ? 'Change coordinated route' : 'Specify coordinated route on MAP'}</button>
        ${this.timingControlsMarkup()}
        ${this.manualDelayControlsMarkup(state)}
        ${assignments ? `<ol class="formationAssignments">${assignments}</ol>` : ''}
        <p class="sectionNote">${preview.ok ? selectedRoute ? 'All coordinated squads will advance along the selected shared route. The route can still be changed.' : 'Dispatch uses an automatic shared route. Specify MAP waypoints before coordinated dispatch if needed.' : preview.reason}</p>
        <div class="contextMetricGrid"><span><small>SQUADS</small><strong>${squadTypes.length}</strong></span><span><small>COST</small><strong>${bundleText(preview.cost ?? {})}</strong></span></div>
        <button class="primary wideButton" data-action="dispatch-group" ${preview.ok ? '' : 'disabled'}>Coordinated dispatch: ${squadTypes.length} squads</button>
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
    this.title.textContent = this.localize(recoveryMission ? 'Dispatch to selected recovery item' : interceptMission ? 'Intercept selected enemy squad' : 'Dispatch to selected enemy base');
    const content = this.mode === DEPLOYMENT_MODE.COORDINATED && !recoveryMission && !interceptMission
      ? this.coordinatedDeploymentMarkup(state)
      : this.singleDeploymentMarkup(state);
    this.body.innerHTML = this.localize(`<section class="deploymentTargetSection"><h2>Selected target</h2>${this.targetMarkup(target)}</section>${this.modeMarkup()}${content}`);
  }
}
