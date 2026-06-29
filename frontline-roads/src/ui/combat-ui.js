import { enemyTotalPopulation } from '../combat/enemy-grouping.js';
import { distance } from '../core/utilities.js';
import { DEFENSE_DEFINITIONS, ENEMY_BASE_DEFINITIONS, ENEMY_DEFINITIONS, defenseRuntimeDefinition } from '../combat/definitions.js';
import { deploymentBases, ownedBaseById } from '../base/field-bases.js';
import { constructionRangeSummary } from '../base/construction-range.js';
import { defensePresentation, uniqueDefenseDescriptionParagraphs } from '../combat/defense-presentation.js';
import { surveyFacilityPresentation } from '../exploration/survey-system.js';
import { scaleEnemyDefinition } from '../combat/enemy-scaling.js';
import { enemyBehaviorForDefinition, waveDoctrineDefinition } from '../combat/enemy-personalities.js';
import { defenseWorldPosition } from '../combat/combat-geometry.js';
import { enemyPosition } from '../combat/enemy-system.js';
import { FRIENDLY_SQUAD_DEFINITIONS, FRIENDLY_SQUAD_ORDER, FRIENDLY_SQUAD_STATUS, friendlySquadPosition } from '../combat/friendly-force-system.js';
import { friendlySquadRuntimeDefinition, friendlySquadLevel, friendlySquadXpForNextLevel } from '../combat/friendly-force-definitions.js';
import { recoveryPresentation } from '../combat/friendly-recovery-system.js';
import { medicalCoverageForSquad } from '../combat/friendly-healing-system.js';
import {
  FRIENDLY_ORDER_MODE,
  buildDeploymentRouteOptions,
  buildFriendlyRouteOptions,
  commandStartNodeId,
  deploymentRouteSubject,
  friendlyRouteIndexAtPoint,
  nearestRoadNode,
  orderDestinationNodeId,
  validateRetreatDestination
} from '../combat/friendly-route-planner.js';
import { remainingRouteDistance } from '../rendering/threat-analysis.js';
import { bundleText } from '../civilization/inventory-system.js';
import { frontierPresentation } from '../exploration/frontier-system.js';
import { RECOVERY_COLLECTION_DURATION_SECONDS, RECOVERY_ITEM_STATUS, RECOVERY_RANGE_METERS, isRecoveryItemVisible, recoveryEligibility, recoveryItemPoint, recoveryItemPresentation, recoveryItemStatusPresentation } from '../exploration/recovery-system.js';
import { RESOURCE_LABELS } from '../civilization/data.js';
import { defenseUpgradeStatus } from '../civilization/defense-upgrade.js';
import { queryRequired, setVisible } from './dom.js';
import { ensureRoadsideSupplyState, ROADSIDE_USE_DEFINITIONS } from '../exploration/roadside-supplies.js';


function unitProgressText(squad) {
  const level = friendlySquadLevel(squad);
  if (level >= 5) return { level, xpText: 'MAX', nextText: 'Max' };
  const next = friendlySquadXpForNextLevel(level);
  const current = Math.floor(Number(squad?.unitXp) || 0);
  return { level, xpText: `${current}/${Number.isFinite(next) ? next : 'MAX'}`, nextText: Number.isFinite(next) ? String(Math.max(0, next - current)) : 'Max' };
}

function squadRecoveryRemainingSeconds(recovery, squad) {
  const reorganization = Math.max(0, Number(recovery?.reorganizationRemaining) || 0);
  const profile = recovery?.profile;
  const healingRate = Math.max(0, Number(profile?.healRatioPerSecond) || 0);
  const targetHp = Math.max(Number(squad?.hp) || 0, Number(recovery?.targetHp) || 0);
  const healRemaining = healingRate > 0
    ? Math.max(0, targetHp - (Number(squad?.hp) || 0)) / Math.max(0.0001, (Number(squad?.maxHp) || 1) * healingRate)
    : 0;
  return Math.max(reorganization, healRemaining);
}

export class CombatUi {
  constructor({ store, buildSystem, civilizationSystem, explorationSystem, recoverySystem, friendlyForceSystem, roadsideSupplySystem = null, camera, renderer, notifications, persist = null, openDeployment = null, requestSurvey = null, i18n = null }) {
    this.store = store;
    this.buildSystem = buildSystem;
    this.civilizationSystem = civilizationSystem;
    this.recoverySystem = recoverySystem;
    this.friendlyForceSystem = friendlyForceSystem;
    this.roadsideSupplySystem = roadsideSupplySystem;
    this.persist = persist;
    this.openDeployment = openDeployment;
    this.requestSurvey = requestSurvey;
    this.camera = camera;
    this.renderer = renderer;
    this.notifications = notifications;
    this.i18n = i18n;
    this.selectedTool = 'select';
    this.selectedObject = null;
    this.buildCandidate = null;
    this.buildSites = [];
    this.buildPlacementSignature = '';
    this.toolAffordabilitySignature = '';
    this.orderPlanning = null;
    this.contextDisclosureKey = '';
    this.contextDisclosureOpen = false;
    this.pendingDefenseRemovalId = null;
    this.defensePanelMode = 'summary';
    this.defensePanelDefenseId = null;
    this.tools = queryRequired('#combatTools');
    this.cityHp = queryRequired('#cityHp');
    this.enemyCount = queryRequired('#enemyCount');
    this.civilizationLevel = queryRequired('#civilizationLevel');
    this.context = queryRequired('#contextPanel');
    this.contextTitle = queryRequired('#contextTitle');
    this.contextText = queryRequired('#contextText');
    this.contextActions = queryRequired('#contextActions');
    this.renderTools();
  }

  localize(text = '') { return this.i18n?.copy?.(text) ?? text; }

  clearObjectSelection({ hideContext = true } = {}) {
    if (this.orderPlanning) {
      const cancelled = this.orderPlanning;
      this.orderPlanning = null;
      this.renderer.setFriendlyOrderPlanning(null);
      cancelled.onCancel?.();
    }
    this.selectedObject = null;
    this.pendingDefenseRemovalId = null;
    this.defensePanelMode = 'summary';
    this.defensePanelDefenseId = null;
    this.renderer.setFocus(null);
    if (hideContext) setVisible(this.context, false);
  }

  contextDisclosureIdentity() {
    if (this.selectedTool !== 'select') return `build:${this.selectedTool}`;
    if (this.orderPlanning) return `order:${this.selectedObject?.id ?? 'none'}:${this.orderPlanning.mode ?? 'unknown'}`;
    if (this.selectedObject) return `${this.selectedObject.kind}:${this.selectedObject.id}`;
    return 'none';
  }

  affordabilitySignature(state) {
    return [`lang:${this.i18n?.language ?? 'ja'}`, ...Object.keys(DEFENSE_DEFINITIONS)
      .map(type => `${type}:${this.buildSystem.canAfford(state, type) ? 1 : 0}`)]
      .join('|');
  }

  renderTools(state = this.store.snapshot()) {
    this.toolAffordabilitySignature = this.affordabilitySignature(state);
    this.tools.textContent = '';
    const entries = [['select', { name: 'select', icon: '☝', cost: null }], ...Object.entries(DEFENSE_DEFINITIONS)];
    for (const [type, definition] of entries) {
      const affordable = type === 'select' || this.buildSystem.canAfford(state, type);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `toolButton${type === this.selectedTool ? ' is-selected' : ''}${affordable ? '' : ' is-unaffordable'}`;
      button.dataset.tool = type;
      button.setAttribute?.('aria-pressed', String(type === this.selectedTool));
      const cost = definition.cost ? bundleText(definition.cost) : '';
      button.innerHTML = this.localize(`<strong>${definition.icon}</strong><span>${definition.name}</span>${cost ? `<small>${cost}</small>` : ''}`);
      button.addEventListener('click', () => this.selectTool(type));
      this.tools.appendChild(button);
    }
  }

  selectTool(type) {
    this.selectedTool = type === 'select' || DEFENSE_DEFINITIONS[type] ? type : 'select';
    this.buildCandidate = null;
    this.buildPlacementSignature = '';
    this.clearObjectSelection({ hideContext: this.selectedTool === 'select' });
    this.renderTools();

    if (this.selectedTool === 'select') {
      this.buildSites = [];
      this.renderer.setBuildPlacement(null);
      this.context.classList?.remove('is-build-mode', 'has-candidate', 'is-order-mode', 'is-defense-mode', 'is-defense-summary', 'is-defense-details', 'is-defense-upgrade', 'is-target-mode');
      this.notifications.show('Select a facility, enemy base, or squad.');
      return;
    }

    this.refreshBuildPlacement(true);
    this.renderContext();
    const presentation = defensePresentation(this.selectedTool);
    this.notifications.show(`${presentation?.role ?? 'Build'}: select a valid focused point.`);
  }

  placementSignature(state) {
    if (this.selectedTool === 'select') return 'select';
    const definition = DEFENSE_DEFINITIONS[this.selectedTool];
    const affordabilityState = this.buildSystem.canAfford(state, this.selectedTool) ? 'affordable' : 'unaffordable';
    const occupiedState = state.combat.defenses
      .filter(defense => defense.kind === definition.kind)
      .map(defense => `${defense.id}:${defense.hp > 0 ? 1 : 0}`)
      .join(',');
    const graph = state.world.roadGraph;
    const anchorState = this.buildSystem.getBuildAnchors(state)
      .map(anchor => `${anchor.id}:${anchor.point.x.toFixed(1)},${anchor.point.y.toFixed(1)}:${Number(anchor.range).toFixed(0)}`)
      .join(';');
    return [
      this.selectedTool,
      affordabilityState,
      occupiedState,
      graph?.nodes?.length ?? 0,
      graph?.edges?.length ?? 0,
      anchorState
    ].join('|');
  }

  refreshBuildPlacement(force = false, state = this.store.snapshot()) {
    if (this.selectedTool === 'select') {
      this.renderer.setBuildPlacement(null);
      return;
    }
    const signature = this.placementSignature(state);
    if (!force && signature === this.buildPlacementSignature) return;

    if (this.buildCandidate) {
      const validation = this.buildSystem.validateCandidate(state, this.buildCandidate, { checkResources: false });
      this.buildCandidate = validation.ok ? validation.candidate : null;
    }
    this.buildSites = this.buildSystem.listBuildSites(state, this.selectedTool);
    const buildStatus = this.buildSystem.getBuildStatus(state, this.selectedTool);
    const affordable = buildStatus.ok;
    this.renderer.setBuildPlacement({
      type: this.selectedTool,
      anchors: this.buildSystem.getBuildAnchors(state),
      sites: this.buildSites,
      candidate: this.buildCandidate,
      affordable
    });
    this.buildPlacementSignature = signature;
  }

  nearestObject(state, point, tolerance, afterObject = null) {
    const graph = state.world.roadGraph;
    const candidates = [];
    for (const item of state.world.recoveryItems ?? []) {
      if (!isRecoveryItemVisible(item) || item.status === RECOVERY_ITEM_STATUS.CARRIED) continue;
      const itemPosition = recoveryItemPoint(state, item);
      candidates.push({ kind: 'recoveryItem', id: item.id, point: itemPosition, distance: distance(point, itemPosition), priority: item.status === RECOVERY_ITEM_STATUS.RESERVED ? 1 : 0 });
    }
    for (const mine of state.world.roadsideSupplies?.placedMines ?? []) {
      if (Number.isFinite(Number(mine.x)) && Number.isFinite(Number(mine.y))) {
        candidates.push({ kind: 'roadsideMine', id: mine.id, point: { x: Number(mine.x), y: Number(mine.y) }, distance: distance(point, mine), priority: -1 });
      }
    }
    for (const source of state.world.frontierSources ?? []) {
      if (source.status === 'CLEARED') continue;
      const node = graph.nodeById.get(source.entryNodeId);
      if (node) candidates.push({ kind: 'frontier', id: source.id, point: node, distance: distance(point, node) });
    }
    for (const base of state.world.enemyBases) {
      if (!base.alive) continue;
      const node = graph.nodeById.get(base.nodeId);
      if (node) candidates.push({ kind: 'enemyBase', id: base.id, point: node, distance: distance(point, node) });
    }
    for (const defense of state.combat.defenses) {
      const position = defenseWorldPosition(graph, defense);
      if (position) candidates.push({
        kind: 'defense',
        id: defense.id,
        point: position,
        distance: distance(point, position),
        priority: 0
      });
    }
    for (const enemy of state.combat.enemies) {
      if (enemy.hp <= 0 || enemy.departDelay > 0) continue;
      const position = enemyPosition(state, enemy);
      candidates.push({ kind: 'enemy', id: enemy.id, point: position, distance: distance(point, position) });
    }
    for (const squad of state.combat.friendlySquads ?? []) {
      if (squad.hp <= 0) continue;
      const position = friendlySquadPosition(state, squad);
      candidates.push({ kind: 'friendlySquad', id: squad.id, point: position, distance: distance(point, position) });
    }
    const city = graph.nodeById.get(state.world.city.nodeId);
    if (city) candidates.push({ kind: 'city', id: 'city', point: city, distance: distance(point, city) });
    candidates.sort((a, b) => a.distance - b.distance || (a.priority ?? 0) - (b.priority ?? 0));
    const nearby = candidates.filter(candidate => candidate.distance <= tolerance);
    if (afterObject && nearby.length > 1) {
      const selectedIndex = nearby.findIndex(candidate => candidate.kind === afterObject.kind && candidate.id === afterObject.id);
      if (selectedIndex >= 0) return nearby[(selectedIndex + 1) % nearby.length];
    }
    return nearby[0] ?? null;
  }

  selectedFriendlySquad(state = this.store.snapshot()) {
    if (this.selectedObject?.kind !== 'friendlySquad') return null;
    return (state.combat.friendlySquads ?? []).find(squad => squad.id === this.selectedObject.id && squad.hp > 0) ?? null;
  }

  updateOrderPlanningOverlay() {
    this.renderer.setFriendlyOrderPlanning(this.orderPlanning ? {
      squadId: this.orderPlanning.squadId ?? null,
      originNodeId: this.orderPlanning.originNodeId ?? null,
      squadType: this.orderPlanning.squadType ?? null,
      mode: this.orderPlanning.mode,
      destinationNodeId: this.orderPlanning.destinationNodeId,
      waypointNodeIds: [...this.orderPlanning.waypointNodeIds],
      routes: this.orderPlanning.routes,
      selectedRouteIndex: this.orderPlanning.selectedRouteIndex,
    } : null);
  }

  planningSubject(state = this.store.snapshot()) {
    if (!this.orderPlanning) return null;
    if (this.orderPlanning.mode === FRIENDLY_ORDER_MODE.DEPLOYMENT) {
      const originNodeId = this.orderPlanning.originNodeId;
      return state.world.roadGraph.nodeById.has(originNodeId)
        ? deploymentRouteSubject(this.orderPlanning.squadType, originNodeId)
        : null;
    }
    return (state.combat.friendlySquads ?? []).find(item => item.id === this.orderPlanning.squadId && item.hp > 0) ?? null;
  }

  rebuildOrderRoutes(state = this.store.snapshot()) {
    if (!this.orderPlanning) return;
    const subject = this.planningSubject(state);
    if (!subject) { this.cancelOrderPlanning(); return; }
    const deployment = this.orderPlanning.mode === FRIENDLY_ORDER_MODE.DEPLOYMENT;
    this.orderPlanning.startNodeId = deployment
      ? this.orderPlanning.originNodeId
      : commandStartNodeId(state, subject);
    this.orderPlanning.routes = this.orderPlanning.destinationNodeId
      ? deployment
        ? buildDeploymentRouteOptions(state, this.orderPlanning.squadType, this.orderPlanning.originNodeId, this.orderPlanning.destinationNodeId, this.orderPlanning.waypointNodeIds)
        : buildFriendlyRouteOptions(state, subject, this.orderPlanning.destinationNodeId, this.orderPlanning.waypointNodeIds)
      : [];
    this.orderPlanning.selectedRouteIndex = Math.min(
      this.orderPlanning.selectedRouteIndex,
      Math.max(0, this.orderPlanning.routes.length - 1)
    );
    this.updateOrderPlanningOverlay();
  }

  beginDeploymentRoutePlanning({ originNodeId, squadType, destinationNodeId, targetLabel = 'Enemy base', confirmLabel = null, onConfirm = null, onCancel = null }) {
    const state = this.store.snapshot();
    if (!state.world.roadGraph.nodeById.has(originNodeId) || !state.world.roadGraph.nodeById.has(destinationNodeId)) {
      this.notifications.show('The dispatch route start or destination is not on a road.');
      return false;
    }
    this.selectedTool = 'select';
    this.buildCandidate = null;
    this.buildSites = [];
    this.selectedObject = null;
    this.renderer.setBuildPlacement(null);
    this.renderer.setFocus(null);
    this.renderTools();
    this.orderPlanning = {
      mode: FRIENDLY_ORDER_MODE.DEPLOYMENT,
      squadId: null,
      originNodeId,
      squadType,
      destinationNodeId,
      targetLabel,
      waypointNodeIds: [],
      routes: [],
      selectedRouteIndex: 0,
      confirmLabel,
      onConfirm,
      onCancel
    };
    this.rebuildOrderRoutes(state);
    this.renderContext(state);
    this.notifications.show('Select a dispatch route on the MAP. Up to two waypoints can be added.');
    return true;
  }

  beginOrderPlanning(mode) {
    const state = this.store.snapshot();
    const squad = this.selectedFriendlySquad(state);
    if (!squad) return;
    const destinationNodeId = orderDestinationNodeId(state, squad, mode);
    if (mode !== FRIENDLY_ORDER_MODE.RETREAT && !destinationNodeId) {
      this.notifications.show(mode === FRIENDLY_ORDER_MODE.RESUME ? 'Original attack target was lost.' : 'Cannot build a return route to the dispatch origin.');
      return;
    }
    this.selectedTool = 'select';
    this.buildCandidate = null;
    this.buildSites = [];
    this.renderer.setBuildPlacement(null);
    this.renderTools();
    this.orderPlanning = {
      mode,
      squadId: squad.id,
      destinationNodeId,
      waypointNodeIds: [],
      routes: [],
      selectedRouteIndex: 0
    };
    this.rebuildOrderRoutes();
    this.renderContext();
    this.notifications.show(mode === FRIENDLY_ORDER_MODE.RETREAT
      ? 'Select a retreat point on the map. Up to two waypoints can be added.'
      : 'Focus a route, then add up to two waypoints on the map.');
  }

  handleOrderPlanningTap(worldPoint) {
    const state = this.store.snapshot();
    const squad = this.planningSubject(state);
    if (!this.orderPlanning || !squad) return;
    if (this.orderPlanning.destinationNodeId && this.orderPlanning.routes.length) {
      const routeIndex = friendlyRouteIndexAtPoint(state, squad, this.orderPlanning.routes, worldPoint, 12 / this.camera.scale);
      if (routeIndex >= 0) {
        this.selectOrderRoute(routeIndex);
        this.notifications.show(`${this.orderPlanning.routes[routeIndex].label} route selected.`);
        return;
      }
    }
    const nearest = nearestRoadNode(state, worldPoint, 28 / this.camera.scale);
    if (!nearest) { this.notifications.show('Select an intersection or route line on a road.'); return; }
    const nodeId = nearest.node.id;
    if (this.orderPlanning.mode === FRIENDLY_ORDER_MODE.RETREAT && !this.orderPlanning.destinationNodeId) {
      const validation = validateRetreatDestination(state, squad, nodeId);
      if (!validation.ok) { this.notifications.show(validation.reason); return; }
      this.orderPlanning.destinationNodeId = nodeId;
      this.orderPlanning.waypointNodeIds = [];
      this.orderPlanning.selectedRouteIndex = 0;
      this.rebuildOrderRoutes();
      this.renderContext();
      return;
    }
    const startNodeId = this.orderPlanning.mode === FRIENDLY_ORDER_MODE.DEPLOYMENT
      ? this.orderPlanning.originNodeId
      : commandStartNodeId(state, squad);
    if (nodeId === this.orderPlanning.destinationNodeId || nodeId === startNodeId) {
      this.notifications.show('Select an intersection other than the destination or current next point.');
      return;
    }
    if (this.orderPlanning.waypointNodeIds.includes(nodeId)) {
      this.notifications.show('This waypoint is already selected.');
      return;
    }
    if (this.orderPlanning.waypointNodeIds.length >= 2) {
      this.notifications.show('Up to two waypoints can be added.');
      return;
    }
    this.orderPlanning.waypointNodeIds.push(nodeId);
    this.orderPlanning.selectedRouteIndex = 0;
    this.rebuildOrderRoutes();
    this.renderContext();
  }

  cancelOrderPlanning() {
    const cancelled = this.orderPlanning;
    this.orderPlanning = null;
    this.updateOrderPlanningOverlay();
    cancelled?.onCancel?.();
    this.renderContext();
  }

  removeLastWaypoint() {
    if (!this.orderPlanning?.waypointNodeIds.length) return;
    this.orderPlanning.waypointNodeIds.pop();
    this.orderPlanning.selectedRouteIndex = 0;
    this.rebuildOrderRoutes();
    this.renderContext();
  }

  resetRetreatDestination() {
    if (!this.orderPlanning || this.orderPlanning.mode !== FRIENDLY_ORDER_MODE.RETREAT) return;
    this.orderPlanning.destinationNodeId = null;
    this.orderPlanning.waypointNodeIds = [];
    this.orderPlanning.routes = [];
    this.orderPlanning.selectedRouteIndex = 0;
    this.updateOrderPlanningOverlay();
    this.renderContext();
  }

  selectOrderRoute(index) {
    if (!this.orderPlanning || !this.orderPlanning.routes[index]) return;
    this.orderPlanning.selectedRouteIndex = index;
    this.updateOrderPlanningOverlay();
    this.renderContext();
  }

  confirmOrderPlanning() {
    if (!this.orderPlanning) return;
    const priorIndex = this.orderPlanning.selectedRouteIndex;
    this.rebuildOrderRoutes();
    this.orderPlanning.selectedRouteIndex = Math.min(priorIndex, Math.max(0, this.orderPlanning.routes.length - 1));
    const route = this.orderPlanning.routes[this.orderPlanning.selectedRouteIndex];
    if (!route) { this.notifications.show('No executable road route is available.'); return; }
    if (this.orderPlanning.mode === FRIENDLY_ORDER_MODE.DEPLOYMENT) {
      const completed = this.orderPlanning;
      this.orderPlanning = null;
      this.updateOrderPlanningOverlay();
      completed.onConfirm?.({
        route: { ...route, path: { ...route.path, nodeIds: [...route.path.nodeIds], edgeIds: [...route.path.edgeIds] } },
        waypointNodeIds: [...completed.waypointNodeIds]
      });
      this.notifications.show(`Dispatch route confirmed: ${route.label}.`);
      this.renderContext();
      return;
    }
    const currentState = this.store.snapshot();
    const currentSquad = (currentState.combat.friendlySquads ?? []).find(item => item.id === this.orderPlanning.squadId);
    const order = this.orderPlanning.mode === FRIENDLY_ORDER_MODE.RETREAT
      ? FRIENDLY_SQUAD_ORDER.RETREAT
      : this.orderPlanning.mode === FRIENDLY_ORDER_MODE.WITHDRAW
        ? FRIENDLY_SQUAD_ORDER.WITHDRAW
        : currentSquad?.heldOrder === FRIENDLY_SQUAD_ORDER.RETREAT
          ? FRIENDLY_SQUAD_ORDER.RETREAT
          : FRIENDLY_SQUAD_ORDER.ADVANCE;
    let result;
    this.store.transaction(state => {
      result = this.friendlyForceSystem.issueRouteOrder(state, this.orderPlanning.squadId, {
        order,
        path: route.path,
        destinationNodeId: this.orderPlanning.destinationNodeId
      });
    }, 'friendly:order', { emit: true, validate: true });
    if (!result?.ok) { this.notifications.show(result?.reason ?? 'Order cannot be executed.'); return; }
    this.orderPlanning = null;
    this.updateOrderPlanningOverlay();
    this.persist?.();
    this.notifications.show(order === FRIENDLY_SQUAD_ORDER.RETREAT ? 'Retreat started.' : order === FRIENDLY_SQUAD_ORDER.WITHDRAW ? 'Withdrawal started.' : 'Advance resumed on the selected route.');
    this.renderContext();
  }

  holdSelectedSquad() {
    const squad = this.selectedFriendlySquad();
    if (!squad) return;
    let result;
    this.store.transaction(state => { result = this.friendlyForceSystem.hold(state, squad.id); }, 'friendly:hold', { emit: true, validate: true });
    this.notifications.show(result?.ok ? 'Squad stopped.' : result?.reason ?? 'Cannot stop this squad.');
    if (result?.ok) this.persist?.();
    this.renderContext();
  }

  useRoadsideItemOnSelectedSquad(itemKey) {
    const squad = this.selectedFriendlySquad();
    if (!squad) { this.notifications.show('Select a friendly squad.'); return; }
    if (!this.roadsideSupplySystem?.useOnSquad) { this.notifications.show('This item cannot be used on the squad.'); return; }
    let result;
    this.store.transaction(state => {
      result = this.roadsideSupplySystem.useOnSquad(state, itemKey, squad.id);
    }, `roadside:squad-${itemKey}`, { emit: true, validate: true });
    this.notifications.show(result?.ok ? 'Item used on squad.' : result?.reason ?? 'Item cannot be used.');
    if (result?.ok) this.persist?.();
    this.renderContext();
    this.renderer.render?.();
  }


  useLureSignalOnTarget(target) {
    if (!this.roadsideSupplySystem?.useLureTarget) { this.notifications.show('Guidance signal cannot be used.'); return; }
    let result;
    this.store.transaction(state => {
      result = this.roadsideSupplySystem.useLureTarget(state, target);
    }, 'roadside:lure-target', { emit: true, validate: true });
    this.notifications.show(result?.ok ? 'Guidance signal used.' : result?.reason ?? 'Guidance signal cannot be used.');
    if (result?.ok) this.persist?.();
    this.renderContext();
    this.renderer.render?.();
  }

  useStrategicItemOnTarget(itemKey, target) {
    if (!this.roadsideSupplySystem?.useOnTarget) { this.notifications.show('Remote support cannot be used.'); return; }
    let result;
    this.store.transaction(state => {
      result = this.roadsideSupplySystem.useOnTarget(state, itemKey, target);
    }, `roadside:strategic-${itemKey}`, { emit: true, validate: true });
    this.notifications.show(result?.ok ? `${ROADSIDE_USE_DEFINITIONS[itemKey]?.name ?? 'Remote support'} executed.` : result?.reason ?? 'Remote support cannot be used.');
    if (result?.ok) this.persist?.();
    this.renderContext();
    this.renderer.render?.();
  }

  removeSelectedMine(mineId) {
    let result;
    this.store.transaction(state => { result = this.roadsideSupplySystem.removeMine?.(state, mineId); }, 'roadside:remove-mine', { emit: true, validate: true });
    this.notifications.show(result?.ok ? 'Mine dismantled.' : result?.reason ?? 'Cannot dismantle.');
    if (result?.ok) { this.persist?.(); this.clearObjectSelection(); }
    else this.renderContext();
    this.renderer.render?.();
  }

  appendSelectedSquadItemActions(state, squad) {
    if (!this.roadsideSupplySystem?.useOnSquad || !squad || squad.hp <= 0) return;
    if ([FRIENDLY_SQUAD_STATUS.RECOVERING, FRIENDLY_SQUAD_STATUS.READY].includes(squad.status)) return;
    const inventory = ensureRoadsideSupplyState(state).inventory ?? {};
    const marchCount = Math.max(0, Math.floor(Number(inventory.marchBanner) || 0));
    const smokeCount = Math.max(0, Math.floor(Number(inventory.smokeScreen) || 0));
    if (marchCount > 0) {
      const march = this.action(`March Banner ×${marchCount}`, () => this.useRoadsideItemOnSelectedSquad('marchBanner'), 'primary');
      march.title = 'Only the selected squad is available. Current position cannot be referenced.';
    }
    if (smokeCount > 0) {
      const smoke = this.action(`Emergency Smoke Screen ×${smokeCount}`, () => this.useRoadsideItemOnSelectedSquad('smokeScreen'), 'danger');
      smoke.title = 'Emergency-withdraw the selected normal squad to its dispatch origin. current position is not used.';
      smoke.disabled = Boolean(squad.temporaryDeployment) || [FRIENDLY_SQUAD_ORDER.RETURN, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(squad.order);
    }
  }


  appendStrategicItemActions(state, target) {
    if (!this.roadsideSupplySystem?.useOnTarget) return;
    const inventory = ensureRoadsideSupplyState(state).inventory ?? {};
    for (const key of ['remoteBarrage', 'areaSuppression', 'airSupport']) {
      const count = Math.max(0, Math.floor(Number(inventory[key]) || 0));
      if (count <= 0) continue;
      const definition = ROADSIDE_USE_DEFINITIONS[key];
      const action = this.action(`${definition.name} ×${count}`, () => this.useStrategicItemOnTarget(key, target), key === 'airSupport' ? 'danger' : 'primary');
      action.title = 'Remote support can only target the selected target area. Current position cannot be referenced.';
    }
  }

  appendDefenseLureAction(state, defense) {
    if (!this.roadsideSupplySystem?.useLureTarget) return;
    const inventory = ensureRoadsideSupplyState(state).inventory ?? {};
    const lureCount = Math.max(0, Math.floor(Number(inventory.lureSignal) || 0));
    if (lureCount <= 0) return;
    const targets = this.roadsideSupplySystem.lureTargets?.(state) ?? [];
    const cluster = targets.find(target => target.kind === 'defenseCluster' && (target.defenseIds ?? []).includes(defense.id));
    if (!cluster) return;
    const lure = this.action(`Guidance signal ×${lureCount}`, () => this.useLureSignalOnTarget({ kind: 'defenseCluster', id: cluster.id }), 'primary');
    lure.title = 'Guide nearby enemies toward this dense defense point.';
  }

  renderOrderPlanningContext(state, squad) {
    this.context.classList?.add('is-order-mode');
    const plan = this.orderPlanning;
    const selectedRoute = plan.routes[plan.selectedRouteIndex] ?? null;
    const modeLabel = plan.mode === FRIENDLY_ORDER_MODE.DEPLOYMENT ? 'Dispatch' : plan.mode === FRIENDLY_ORDER_MODE.RETREAT ? 'Retreat' : plan.mode === FRIENDLY_ORDER_MODE.WITHDRAW ? 'Withdrawal' : 'Advance resume';
    const instruction = !plan.destinationNodeId
      ? 'Select a retreat intersection on the map. Points that approach enemy territory cannot be retreat destinations.'
      : selectedRoute
        ? `Check the ${modeLabel} route. Tap the MAP to add up to two waypoints.`
        : 'No road route can reach the selected point. Change the destination or waypoint.';
    this.contextTitle.textContent = plan.mode === FRIENDLY_ORDER_MODE.DEPLOYMENT ? `DEPLOY ROUTE // ${plan.targetLabel ?? 'Target'}` : `ALLY ORDER // ${modeLabel}`;
    this.setContextContent(instruction, [
      ['ROUTES', String(plan.routes.length)],
      ['SELECT', selectedRoute?.label ?? 'NONE'],
      ['DIST', selectedRoute ? `${Math.round(selectedRoute.physicalDistance)}m` : '--'],
      ['ETA', selectedRoute ? `${Math.max(1, Math.ceil(selectedRoute.etaSeconds / 60))} min` : '--'],
      ['RISK', selectedRoute?.risk ?? '--'],
      ['CONTACT', selectedRoute ? String(selectedRoute.enemyContacts) : '--'],
      ['VIA', `${plan.waypointNodeIds.length}/2`]
    ], [
      plan.mode === FRIENDLY_ORDER_MODE.WITHDRAW ? 'Confirm withdrawal. The current attack mission cannot be resumed.' : 'Enemy pressure is present near the selected route.',
      plan.mode === FRIENDLY_ORDER_MODE.DEPLOYMENT
        ? 'After dispatch is confirmed, the squad follows the selected route from the first highlighted road segment.'
        : squad.edgeId && squad.edgeProgress > 0 ? 'Even mid-road, the squad reverses immediately on the current segment when the retreat or return destination is behind it. It advances to the next intersection only when the forward route is shorter.' : 'After confirming the order, the squad immediately switches to the selected route.'
    ]);
    plan.routes.forEach((route, index) => this.action(
      `${index + 1}. ${route.label}${index === plan.selectedRouteIndex ? ' ✓' : ''}`,
      () => this.selectOrderRoute(index),
      index === plan.selectedRouteIndex ? 'primary' : ''
    ));
    if (plan.waypointNodeIds.length) this.action('Cancel last waypoint', () => this.removeLastWaypoint());
    if (plan.mode === FRIENDLY_ORDER_MODE.RETREAT && plan.destinationNodeId) this.action('Choose retreat point', () => this.resetRetreatDestination());
    const confirmText = plan.mode === FRIENDLY_ORDER_MODE.DEPLOYMENT ? (plan.confirmLabel ?? 'Dispatch on this route') : `${modeLabel} Confirm`;
    const confirm = this.action(confirmText, () => this.confirmOrderPlanning(), 'primary');
    confirm.disabled = !selectedRoute;
    this.action('Cancel order', () => this.cancelOrderPlanning());
    setVisible(this.context, true);
  }

  handleMapTap(worldPoint) {
    if (this.orderPlanning) {
      this.handleOrderPlanningTap(worldPoint);
      return;
    }
    if (this.selectedTool === 'select') {
      const state = this.store.snapshot();
      const nextObject = this.nearestObject(state, worldPoint, 24 / this.camera.scale, this.selectedObject);
      const sameObject = nextObject
        && this.selectedObject
        && nextObject.kind === this.selectedObject.kind
        && nextObject.id === this.selectedObject.id;
      if (sameObject || !nextObject) {
        this.clearObjectSelection();
        return;
      }
      this.pendingDefenseRemovalId = null;
      this.defensePanelMode = 'summary';
      this.defensePanelDefenseId = null;
      this.selectedObject = nextObject;
      this.renderer.setFocus({ kind: nextObject.kind, id: nextObject.id });
      this.renderContext();
      return;
    }

    const state = this.store.snapshot();
    const result = this.buildSystem.previewAt(state, this.selectedTool, worldPoint, 24 / this.camera.scale);
    if (!result.ok) {
      this.buildCandidate = null;
      this.refreshBuildPlacement(true);
      this.renderContext();
      this.notifications.show(result.reason ?? 'Cannot place at this position.');
      return;
    }
    this.buildCandidate = result.candidate;
    this.refreshBuildPlacement(true);
    this.renderContext();
    this.notifications.show('Placement candidate selected. Check range and effect, then confirm build.');
  }

  confirmBuildCandidate() {
    if (!this.buildCandidate || this.selectedTool === 'select') return;
    const state = this.store.snapshot();
    const validation = this.buildSystem.validateCandidate(state, this.buildCandidate, { checkResources: true });
    if (!validation.ok) {
      this.notifications.show(validation.reason ?? 'Cannot build.');
      this.refreshBuildPlacement(true);
      this.renderContext();
      return;
    }

    let result = null;
    this.store.transaction(draft => {
      result = this.buildSystem.buildCandidate(draft, validation.candidate);
    }, 'combat:build', { emit: true, validate: true });
    if (!result?.ok) {
      this.notifications.show(result?.reason ?? 'Cannot build.');
      this.refreshBuildPlacement(true);
      this.renderContext();
      return;
    }

    this.persist?.();
    this.notifications.show(`${DEFENSE_DEFINITIONS[this.selectedTool].name} placed.`);
    this.buildCandidate = null;
    this.buildPlacementSignature = '';
    this.renderTools();
    this.refreshBuildPlacement(true);
    this.renderContext();
  }

  cancelBuildCandidate() {
    this.buildCandidate = null;
    this.refreshBuildPlacement(true);
    this.renderContext();
  }

  appendContextMetrics(metrics = []) {
    if (!metrics.length) return null;
    const grid = document.createElement('div');
    grid.className = 'contextMetricGrid';
    for (const [label, value] of metrics) {
      const item = document.createElement('span');
      const key = document.createElement('small');
      const data = document.createElement('b');
      key.textContent = this.localize(label);
      data.textContent = this.localize(value);
      item.append(key, data);
      grid.appendChild(item);
    }
    this.contextText.appendChild(grid);
    return grid;
  }

  setContextMetrics(metrics = []) {
    this.contextText.textContent = '';
    this.appendContextMetrics(metrics);
  }

  setDefensePanelMode(mode, defenseId) {
    this.defensePanelMode = mode;
    this.defensePanelDefenseId = defenseId;
    this.pendingDefenseRemovalId = null;
    this.renderContext();
  }

  setDefenseDetails(presentation, notes = []) {
    this.contextText.textContent = '';
    const copy = document.createElement('div');
    copy.className = 'defenseDetailCopy';
    uniqueDefenseDescriptionParagraphs(presentation, notes)
      .forEach((text, index) => {
        const paragraph = document.createElement('p');
        paragraph.className = index === 0 ? 'contextSummary' : 'contextDetail';
        paragraph.textContent = this.localize(text);
        copy.appendChild(paragraph);
      });
    this.contextText.appendChild(copy);
  }

  setContextContent(summary, metrics = [], details = []) {
    this.contextText.textContent = '';
    this.appendContextMetrics(metrics);

    const explanation = [summary, ...details]
      .filter(detailText => typeof detailText === 'string' && detailText.trim().length);
    if (!explanation.length) return;
    const disclosureKey = this.contextDisclosureIdentity();
    if (this.contextDisclosureKey !== disclosureKey) {
      this.contextDisclosureKey = disclosureKey;
      this.contextDisclosureOpen = false;
    }
    const disclosure = document.createElement('details');
    disclosure.className = 'contextDisclosure';
    disclosure.open = this.contextDisclosureOpen;
    disclosure.addEventListener('toggle', () => {
      if (this.contextDisclosureKey === disclosureKey) this.contextDisclosureOpen = Boolean(disclosure.open);
    });
    const toggle = document.createElement('summary');
    toggle.textContent = this.localize('Focused description');
    disclosure.appendChild(toggle);
    explanation.forEach((detailText, index) => {
      const detail = document.createElement('p');
      detail.className = index === 0 ? 'contextSummary' : 'contextDetail';
      detail.textContent = this.localize(detailText);
      disclosure.appendChild(detail);
    });
    this.contextText.appendChild(disclosure);
  }

  appendDefenseUpgradePreview(state, defense, status) {
    const block = document.createElement('div');
    block.className = `defenseUpgradePreview ${status.ok ? 'is-ready' : status.atMax ? 'is-max' : 'is-locked'}`;
    const heading = document.createElement('div');
    heading.className = 'defenseUpgradeHeading';
    const label = document.createElement('small');
    label.textContent = this.localize(status.atMax ? 'UPGRADE COMPLETE' : `NEXT // TIER ${status.nextTier}`);
    const name = document.createElement('strong');
    name.textContent = this.localize(status.atMax ? 'Reached highest tier' : status.nextDefinition?.name ?? 'Upgrade target unknown');
    heading.append(label, name);
    block.appendChild(heading);

    if (status.atMax) {
      const note = document.createElement('p');
      note.textContent = this.localize('This facility is currently unavailable.');
      block.appendChild(note);
      this.contextText.appendChild(block);
      return;
    }

    const current = defenseRuntimeDefinition(defense);
    const next = defenseRuntimeDefinition({ ...defense, tier: status.nextTier, maxHp: status.nextMaxHp, line: status.line });
    const rows = [];
    const add = (labelText, before, after) => {
      if (String(before) !== String(after)) rows.push([labelText, `${before} → ${after}`]);
    };
    add('HP', defense.maxHp, status.nextMaxHp);
    if (defense.kind !== 'barrier') add('range', `${current.range}m`, `${next.range}m`);
    if (defense.type === 'gun') {
      add('power', current.damage, next.damage);
      add('reload', `${current.cooldown} sec`, `${next.cooldown} sec`);
    } else if (defense.type === 'mortar') {
      add('power', current.damage, next.damage);
      add('reload', `${current.cooldown} sec`, `${next.cooldown} sec`);
      add('blast radius', `${current.blastRadius}m`, `${next.blastRadius}m`);
      add('max targets', current.maxTargets, next.maxTargets);
      add('splash power', `${Math.round(current.splashMultiplier * 100)}%`, `${Math.round(next.splashMultiplier * 100)}%`);
    } else if (defense.type === 'slow') {
      add('slow effect', `${Math.round(current.slow * 100)}%`, `${Math.round(next.slow * 100)}%`);
      add('effect time', `${current.slowSeconds} sec`, `${next.slowSeconds} sec`);
      add('max targets', current.maxTargets, next.maxTargets);
      add('reload', `${current.cooldown} sec`, `${next.cooldown} sec`);
    } else if (defense.type === 'relay') {
      add('tower repair', current.repairTower, next.repairTower);
      add('wall repair', current.repairBarrier, next.repairBarrier);
      add('reload', `${current.cooldown} sec`, `${next.cooldown} sec`);
    } else if (defense.type === 'medical') {
      add('healing range', `${current.range}m`, `${next.range}m`);
      add('healing', `${(current.recoveryRate * 100).toFixed(1)}%/ sec`, `${(next.recoveryRate * 100).toFixed(1)}%/ sec`);
    } else if (defense.type === 'survey') {
      add('map radius', `${current.surveyRadius}m`, `${next.surveyRadius}m`);
      add('area acquisition', `${current.scanInterval} sec`, `${next.scanInterval} sec`);
    }

    const grid = document.createElement('div');
    grid.className = 'defenseUpgradeDeltaGrid';
    for (const [keyText, valueText] of rows) {
      const item = document.createElement('span');
      const key = document.createElement('small');
      const value = document.createElement('b');
      key.textContent = this.localize(keyText);
      value.textContent = this.localize(valueText);
      item.append(key, value);
      grid.appendChild(item);
    }
    if (rows.length) block.appendChild(grid);

    const cost = document.createElement('p');
    cost.className = 'defenseUpgradeCost';
    cost.textContent = this.localize(`Upgrade cost: ${bundleText(status.cost)}`);
    block.appendChild(cost);
    if (!status.ok) {
      const reason = document.createElement('p');
      reason.className = 'defenseUpgradeReason';
      reason.textContent = this.localize(status.reason);
      block.appendChild(reason);
    }
    this.contextText.appendChild(block);
  }

  action(label, handler, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = this.localize(label);
    button.className = className;
    button.addEventListener('click', handler);
    this.contextActions.appendChild(button);
    return button;
  }

  mutateAction(action, reason) {
    let result;
    this.store.transaction(state => { result = action(state); }, reason, { emit: true, validate: true });
    if (result?.ok) this.persist?.();
    this.notifications.show(this.localize(result?.ok ? result?.message ?? 'Execute' : result?.reason ?? 'Action unavailable.'));
    this.renderContext();
    this.renderer.render();
  }

  requestDefenseRemoval(defenseId) {
    if (this.pendingDefenseRemovalId !== defenseId) {
      this.pendingDefenseRemovalId = defenseId;
      this.notifications.show('Confirm removal. The facility will be removed and resources will not be refunded.');
      this.renderContext();
      return;
    }

    let result;
    this.store.transaction(state => { result = this.buildSystem.removeDefense(state, defenseId); }, 'defense:remove', { emit: true, validate: true });
    this.pendingDefenseRemovalId = null;
    if (!result?.ok) {
      this.notifications.show(result?.reason ?? 'Facility cannot be dismantled.');
      this.renderContext();
      return;
    }

    this.clearObjectSelection();
    this.renderTools();
    this.renderer.render();
    this.persist?.();
    this.notifications.show(result.message ?? 'facility dismantled.');
  }

  cancelDefenseRemoval() {
    this.pendingDefenseRemovalId = null;
    this.renderContext();
  }

  renderBuildContext(state = this.store.snapshot()) {
    const definition = DEFENSE_DEFINITIONS[this.selectedTool];
    const presentation = defensePresentation(this.selectedTool, definition);
    if (!definition || !presentation) {
      this.selectTool('select');
      return;
    }
    const buildStatus = this.buildSystem.getBuildStatus(state, this.selectedTool);
    const affordable = buildStatus.ok;
    this.context.classList?.add('is-build-mode');
    this.context.classList?.toggle('has-candidate', Boolean(this.buildCandidate));
    this.contextActions.textContent = '';
    this.contextTitle.textContent = this.localize(`BUILD // ${definition.name} // ${presentation.role}`);
    const instruction = !buildStatus.ok && buildStatus.requiredCivilizationLevel
      ? buildStatus.reason
      : this.buildCandidate
      ? 'Confirm the current placement candidate after checking effect range and cost.'
      : this.buildSites.length
        ? 'Select a build position from the valid points highlighted in green.'
        : 'No build point is available in the current build range.';
    const anchors = this.buildSystem.getBuildAnchors(state);
    const ranges = constructionRangeSummary(state.civilization?.level);
    const metrics = [
      ...presentation.metrics,
      ['STATUS', affordable ? 'READY' : buildStatus.reason ?? 'useunavailable'],
      ['SITES', String(this.buildSites.length)],
      ...(this.buildCandidate ? [['SOURCE', this.buildCandidate.anchorLabel ?? 'Unknown']] : [])
    ];
    this.setContextContent(instruction, metrics, [
      presentation.summary,
      presentation.effect,
      presentation.placement,
      `New facilities start at Tier ${definition.initialTier ?? 0}. After civilization level rises, select an existing facility and pay resources to upgrade it individually.`,
      this.selectedTool === 'survey'
        ? `Survey facilities are limited to 1 per Major Base and Simple Base. Placement range: Major Base ${ranges.major} m, Simple Base ${ranges.field} m. Remote acquisition adds road geometry only. Exact positions of enemy territory, Roadside Supplies, and field events are shown after moving there in person.`
        : `Civ Lv.${ranges.level} construction range: Major Base ${ranges.major} m, Simple Base ${ranges.field}m, current position ${ranges.player}m, deployed squad ${ranges.expedition} m. Existing facilities do not become new build anchors. Roads at the destination can be used for building after nearby area acquisition completes.`
    ]);
    if (this.buildCandidate) {
      const confirm = this.action(affordable ? 'Confirm build' : buildStatus.requiredCivilizationLevel ? 'Civilization locked' : 'Resources short', () => this.confirmBuildCandidate(), 'primary');
      confirm.disabled = !affordable;
      this.action('Cancel placement', () => this.cancelBuildCandidate());
    }
    this.action('Return', () => this.selectTool('select'));
    setVisible(this.context, true);
  }

  renderContext(state = this.store.snapshot()) {
    if (this.selectedTool !== 'select') {
      this.renderBuildContext(state);
      return;
    }
    this.context.classList?.remove('is-build-mode', 'has-candidate', 'is-order-mode', 'is-defense-mode', 'is-defense-summary', 'is-defense-details', 'is-defense-upgrade', 'is-target-mode');
    this.contextActions.textContent = '';
    if (this.orderPlanning) {
      const squad = this.planningSubject(state);
      if (!squad) { this.cancelOrderPlanning(); return; }
      this.renderOrderPlanningContext(state, squad);
      return;
    }
    if (!this.selectedObject) {
      setVisible(this.context, false);
      return;
    }
    const selected = this.selectedObject;
    if (selected.kind === 'recoveryItem') {
      const item = (state.world.recoveryItems ?? []).find(value => value.id === selected.id && isRecoveryItemVisible(value));
      if (!item) { this.clearObjectSelection(); return; }
      const presentation = recoveryItemPresentation(item);
      const statusPresentation = recoveryItemStatusPresentation(item);
      const itemPosition = recoveryItemPoint(state, item);
      const gap = state.player.worldPosition ? distance(state.player.worldPosition, itemPosition) : Infinity;
      const collection = state.world.recoveryCollection?.itemId === item.id ? state.world.recoveryCollection : null;
      const available = item.status === RECOVERY_ITEM_STATUS.AVAILABLE;
      const eligibility = available ? recoveryEligibility(state, item) : { ok: false, reason: statusPresentation.detail };
      const progress = Math.min(RECOVERY_COLLECTION_DURATION_SECONDS, collection?.progressSec ?? 0);
      this.contextTitle.textContent = this.localize(`RECOVERY // ${presentation.name}`);
      const statusLabel = collection ? 'Field recovery in progress' : statusPresentation.label;
      this.setContextContent(
        available
          ? `${presentation.sourceName} left a special recovery item at the destroyed point. Recover it in the field or dispatch a Recovery Squad.`
          : `${presentation.sourceName} left a special recovery item at the destroyed point. ${statusPresentation.detail}`,
        [['DIST', Number.isFinite(gap) ? `${Math.round(gap)}m` : 'NO GPS'], ['ENTRY', `${RECOVERY_RANGE_METERS}m`], ['STATUS', statusLabel], ['TIME', collection ? `${progress.toFixed(1)}/${RECOVERY_COLLECTION_DURATION_SECONDS}s` : available ? `${RECOVERY_COLLECTION_DURATION_SECONDS}s` : '--'], ['SOURCE', presentation.sourceName], ['LOOT', presentation.lootText]],
        [presentation.description, collection ? 'Move within range to complete recovery.' : available ? (eligibility.ok ? 'After recovery, achievements can contribute to civilization growth.' : eligibility.reason) : statusPresentation.detail]
      );
      this.context.classList?.add('is-target-mode');
      const collect = this.action(collection ? `Recovery in progress ${Math.floor(progress)}/${RECOVERY_COLLECTION_DURATION_SECONDS} sec` : 'Recover on site', () => this.mutateAction(draft => this.recoverySystem.beginCollection(draft, item.id), 'recovery:begin'), 'primary');
      collect.disabled = Boolean(collection) || !available || !eligibility.ok;
      const retrievalPreview = available && this.friendlyForceSystem
        ? deploymentBases(state, 'retrieval')
          .map(base => this.friendlyForceSystem.previewDeployment(state, base.id, item.id, 'retrieval', 'recoveryItem'))
          .find(result => result.ok)
        : null;
      const retrievalReason = available && !retrievalPreview && this.friendlyForceSystem
        ? deploymentBases(state, 'retrieval')
          .map(base => this.friendlyForceSystem.previewDeployment(state, base.id, item.id, 'retrieval', 'recoveryItem'))
          .find(result => result.reason)?.reason ?? 'No base can dispatch a Recovery Squad.'
        : statusPresentation.shortLabel;
      const dispatch = this.action(available ? 'Dispatch Recovery Squad' : statusPresentation.shortLabel, () => this.openDeployment?.({ kind: 'recoveryItem', id: item.id }));
      dispatch.disabled = !available || Boolean(collection) || typeof this.openDeployment !== 'function' || !retrievalPreview;
      dispatch.title = dispatch.disabled ? retrievalReason : 'Dispatch Recovery Squad.';
      if (available && !retrievalPreview) this.contextText?.insertAdjacentHTML?.('beforeend', `<p class="sectionNote">${retrievalReason}</p>`);
    } else if (selected.kind === 'roadsideMine') {
      const mine = (state.world.roadsideSupplies?.placedMines ?? []).find(item => item.id === selected.id);
      if (!mine) { this.clearObjectSelection(); return; }
      const definition = ROADSIDE_USE_DEFINITIONS[mine.itemKey ?? 'roadMine'] ?? ROADSIDE_USE_DEFINITIONS.roadMine;
      const inventory = ensureRoadsideSupplyState(state).inventory ?? {};
      const lureCount = Math.max(0, Math.floor(Number(inventory.lureSignal) || 0));
      this.contextTitle.textContent = this.localize(`MINE // ${mine.name ?? definition.name}`);
      this.setContextContent('Placed mine. It remains until triggered by an enemy. Use a Guidance Flare to guide enemies to this point.', [
        ['TYPE', definition.name],
        ['RADIUS', `${definition.radiusMeters}m`],
        ['TRIGGER', `${definition.triggerRadiusMeters}m`],
        ['NODE', mine.nodeId ?? '--']
      ], ['Guiding enemies to the blast area.']);
      const lure = this.action(`Guidance signal ×${lureCount}`, () => this.useLureSignalOnTarget({ kind: 'mine', id: mine.id }), 'primary');
      lure.disabled = lureCount <= 0;
      this.action('Dismantle mine', () => this.removeSelectedMine(mine.id), 'danger');
    } else if (selected.kind === 'friendlySquad') {
      const squad = (state.combat.friendlySquads ?? []).find(item => item.id === selected.id);
      if (!squad || squad.hp <= 0) { this.clearObjectSelection(); return; }
      const definition = friendlySquadRuntimeDefinition(state, squad.type, squad);
      const remaining = remainingRouteDistance(state, squad);
      const origin = ownedBaseById(state, squad.originBaseId, { includeDestroyed: true });
      const target = state.world.enemyBases.find(base => base.id === squad.targetBaseId);
      const interceptTarget = state.combat.enemies.find(enemy => enemy.id === squad.targetEnemyId && enemy.hp > 0);
      const recoveryItem = (state.world.recoveryItems ?? []).find(item => item.id === squad.targetRecoveryItemId);
      const recoveryTargetName = recoveryItem ? recoveryItemPresentation(recoveryItem).name : null;
      this.contextTitle.textContent = this.localize(`ALLY // ${definition.name}`);
      const orderLabel = ({ ADVANCE: 'advance', HOLD: 'Stop', RETREAT: 'Retreat', WITHDRAW: 'Withdrawal', RETURN: 'Return' })[squad.order] ?? squad.order;
      const progress = unitProgressText(squad);
      const special = definition.type === 'skirmisher'
        ? `enemy to of Attack ×${definition.lightTargetMultiplier} · enemy ×${definition.armoredTargetMultiplier}`
        : definition.type === 'heavy'
          ? `${definition.guardRange}mwithin ${Math.round(definition.guardShare * 100)}%`
          : definition.type === 'expedition'
            ? `${definition.recoveryDelaySeconds} secafter from sec${definition.nonCombatRecoveryPerSecond}HPhealing · Nearby 120m buildrange`
            : definition.type === 'siege'
              ? 'High attack power against enemy territory, low firepower against normal enemies'
              : definition.type === 'engineer'
                ? `Nearby ${definition.repairRange}m facilities up to ${definition.repairAmount} HP manual repair; strong against enemy facilities`
                : definition.type === 'artillery'
                  ? `range${definition.engagementRange}m · radius${definition.splashRadius}m to Max${definition.maxSplashTargets} enemy unit(s) to Area attack`
                  : definition.type === 'command'
                    ? `Nearby ${definition.auraRange}m to Attack+${Math.round(definition.commandAura * 100)}% · move+${Math.round(definition.speedAura * 100)}%`
                    : definition.type === 'retrieval'
                      ? `Rebuild on site: ${definition.collectionSeconds} secStop Recovery. and HP at low`
                      : 'Balanced squad for normal enemies and enemy territory';
      if ([FRIENDLY_SQUAD_STATUS.RECOVERING, FRIENDLY_SQUAD_STATUS.READY].includes(squad.status)) {
        const recovery = recoveryPresentation(state, squad);
        const recoveryBase = ownedBaseById(state, squad.recoveryBaseId ?? squad.originBaseId, { includeDestroyed: true });
        const medical = medicalCoverageForSquad(state, squad);
        const recoveryRemaining = squadRecoveryRemainingSeconds(recovery, squad);
        this.setContextContent(
          squad.status === FRIENDLY_SQUAD_STATUS.READY
            ? recovery.baseHealing
              ? 'Supply, healing, and reorganization are complete at the Major Base. Waiting for redispatch orders.'
              : 'Reorganization is complete at the Simple Base. Waiting for redispatch orders. Use healing facilities for HP recovery at the front.'
            : recovery.baseHealing
              ? 'Returning to a Major Base for supply-based healing and reorganization.'
              : 'Returning to a Simple Base for reorganization. HP recovery requires waiting within range of healing facilities.',
          [
            ['HP', `${Math.ceil(squad.hp)}/${squad.maxHp}`],
            ['LV', `Lv.${progress.level}`],
            ['XP', progress.xpText],
            ['NEXT', progress.nextText],
            ['STATUS', squad.status],
            ['BASE', recoveryBase?.name ?? 'Unknown'],
            ['RECOVERY', squad.status === FRIENDLY_SQUAD_STATUS.READY ? 'complete' : `${Math.ceil(recoveryRemaining)} sec`],
            ['HEAL', recovery.baseHealing ? 'Major base supply' : medical ? `${medical.definition.name} ${Math.round(medical.distance)}m` : 'Unknown']
          ],
          [special, recovery.baseHealing
            ? 'Returned squads resupply at the major base. Healing facilities also heal allied squads within range.'
            : 'Simple bases do not provide automatic healing. Build healing facilities to heal squads.']
        );
      } else {
        this.setContextContent(
          squad.order === FRIENDLY_SQUAD_ORDER.HOLD
            ? `Holding at the specified point. ${definition.description}`
            : squad.order === FRIENDLY_SQUAD_ORDER.RETREAT
              ? `Retreating along the selected road route. ${definition.description}`
              : squad.order === FRIENDLY_SQUAD_ORDER.WITHDRAW
                ? `Withdrawing from the current mission to the dispatch origin. ${definition.description}`
                : squad.missionType === 'RECOVERY' && recoveryItem?.status === RECOVERY_ITEM_STATUS.CARRIED
                  ? `Special item secured. Transporting it to the dispatch origin. ${definition.description}`
                  : squad.missionType === 'RECOVERY' && recoveryItem
                    ? `Advancing to the special item recovery point. ${definition.description}`
                    : squad.missionType === 'INTERCEPT' && interceptTarget
                      ? `Tracking and intercepting the specified enemy squad. ${definition.description}`
                      : squad.targetBaseId
                        ? `Advancing into enemy territory. ${definition.description}`
                        : `Returning to the mission dispatch origin. ${definition.description}`,
          [
            ['HP', `${Math.ceil(squad.hp)}/${squad.maxHp}`],
            ['LV', `Lv.${progress.level}`],
            ['XP', progress.xpText],
            ['NEXT', progress.nextText],
            ['MEN', String(Math.max(1, Math.ceil((squad.hp / squad.maxHp) * definition.members)))],
            ['ROLE', definition.role],
            ['STATUS', squad.status],
            ['ORDER', orderLabel],
            ['SPEED', `${definition.speed}m/s`],
            ['ENEMY DPS', String(definition.enemyDps)],
            ['BASE DPS', String(definition.baseDps)],
            ['RANGE', Number.isFinite(remaining) ? `${Math.round(remaining)}m` : 'RECALC'],
            ['ORIGIN', origin?.name ?? 'Unknown'],
            ['TARGET', recoveryItem?.status === RECOVERY_ITEM_STATUS.CARRIED
              ? 'Transport to dispatch origin'
              : recoveryTargetName
                ?? (interceptTarget ? ENEMY_DEFINITIONS[interceptTarget.type]?.name ?? 'enemy squad' : null)
                ?? (target ? ENEMY_BASE_DEFINITIONS[target.type]?.name ?? 'Enemy base' : squad.order === FRIENDLY_SQUAD_ORDER.WITHDRAW ? 'Dispatch origin' : 'Return')]
          ],
          [special]
        );
        if (![FRIENDLY_SQUAD_ORDER.RETURN, FRIENDLY_SQUAD_ORDER.WITHDRAW].includes(squad.order)) {
          if (squad.order !== FRIENDLY_SQUAD_ORDER.HOLD) this.action('Stop', () => this.holdSelectedSquad());
          if (squad.order === FRIENDLY_SQUAD_ORDER.HOLD && ((squad.missionTargetBaseId ?? squad.targetBaseId ?? squad.targetEnemyId ?? squad.targetRecoveryItemId) || squad.heldDestinationNodeId)) this.action('Resume movement', () => this.beginOrderPlanning(FRIENDLY_ORDER_MODE.RESUME), 'primary');
          if (squad.type === 'engineer') this.action('Repair nearby facility', () => this.mutateAction(draft => this.friendlyForceSystem.repairNearby(draft, squad.id), 'friendly:engineer-repair'), 'primary');
          this.appendSelectedSquadItemActions(state, squad);
          this.action('Retreat', () => this.beginOrderPlanning(FRIENDLY_ORDER_MODE.RETREAT));
          this.action('Withdrawal', () => this.beginOrderPlanning(FRIENDLY_ORDER_MODE.WITHDRAW), 'danger');
        }
      }
    } else if (selected.kind === 'enemy') {
      const enemy = state.combat.enemies.find(item => item.id === selected.id);
      if (!enemy || enemy.hp <= 0) { this.clearObjectSelection(); return; }
      const definition = scaleEnemyDefinition(ENEMY_DEFINITIONS[enemy.type] ?? ENEMY_DEFINITIONS.infantry, enemy.level ?? 1);
      const behavior = enemyBehaviorForDefinition(definition, enemy.doctrineKey);
      const doctrine = waveDoctrineDefinition(enemy.doctrineKey);
      const remaining = remainingRouteDistance(state, enemy);
      const targetDefense = enemy.targetDefenseId
        ? state.combat.defenses.find(defense => defense.id === enemy.targetDefenseId && defense.hp > 0)
        : null;
      const targetFieldBase = enemy.targetFieldBaseId ? ownedBaseById(state, enemy.targetFieldBaseId) : null;
      const targetPlayerBase = enemy.targetPlayerBaseId ? ownedBaseById(state, enemy.targetPlayerBaseId) : null;
      const targetSquad = enemy.targetSquadId
        ? (state.combat.friendlySquads ?? []).find(squad => squad.id === enemy.targetSquadId && squad.hp > 0)
        : null;
      const targetName = targetDefense
        ? defenseRuntimeDefinition(targetDefense).name ?? 'Defense facility'
        : targetSquad
          ? FRIENDLY_SQUAD_DEFINITIONS[targetSquad.type]?.name ?? 'friendly squad'
          : targetPlayerBase?.name ?? targetFieldBase?.name ?? (enemy.targetPlayerBaseId ? 'Major Base' : enemy.targetFieldBaseId ? 'Simple Base' : 'city');
      const summary = targetDefense
        ? `${targetName} priorityTarget and Progress in progress. at route select.`
        : targetSquad
          ? `${targetName} is being tracked. When the squad moves, the pursuit route updates at the next road node.`
          : enemy.targetPlayerBaseId || enemy.targetFieldBaseId
            ? `${targetName} raid is prioritized. A different defense line than direct city attackers is required.`
            : 'Advance toward the city. Route, enemy pressure, and target type are selected.';
      const routeMode = ({ FLANK: 'Flank route', EVASIVE: 'risk avoidance', BREACH: 'frontal breach', SABOTAGE: 'Facility infiltration', RAID: 'Base raid', HUNT: 'Squad pursuit', SUPPORT: 'Support advance', GUARD: 'Guarded advance', COMMAND: 'Command advance', DIRECT: 'Shortest advance' })[enemy.path?.routeMode ?? behavior.routeMode] ?? definition.routeLabel ?? 'Unknown';
      const detour = Number(enemy.path?.detourPercent) > 0 ? `+${enemy.path.detourPercent}%` : '—';
      this.contextTitle.textContent = this.localize(`TARGET // ${definition.name}`);
      this.setContextContent(summary, [
        ['LEVEL', `Lv.${enemy.level ?? 1}`],
        ['HP', `${Math.ceil(enemy.hp)}/${enemy.maxHp}`],
        ['RANGE', Number.isFinite(remaining) ? `${Math.round(remaining)}m` : 'RECALC'],
        ['PERSONA', behavior.personalityLabel],
        ['TACTIC', doctrine.label],
        ['ROUTE', routeMode],
        ['DETOUR', detour],
        ['DAMAGE', String(definition.cityDamage)],
        ['OBJECTIVE', targetName]
      ], [behavior.description, `: ${definition.objectiveLabel ?? 'city'}`]);
      const intercept = this.action('Dispatch', () => this.openDeployment?.({ kind: 'enemy', id: enemy.id }), 'primary');
      intercept.disabled = enemy.departDelay > 0 || typeof this.openDeployment !== 'function';
      this.appendStrategicItemActions(state, { kind: 'enemy', id: enemy.id });
    } else if (selected.kind === 'frontier') {
      const source = (state.world.frontierSources ?? []).find(item => item.id === selected.id);
      if (!source || source.status === 'CLEARED') { this.clearObjectSelection(); return; }
      const presentation = frontierPresentation(source);
      const entry = state.world.roadGraph.nodeById.get(source.entryNodeId);
      const sourceDistance = entry ? distance(entry, source.point) : Infinity;
      const playerDistance = state.player.worldPosition ? distance(state.player.worldPosition, source.point) : Infinity;
      this.contextTitle.textContent = this.localize(`FRONTIER // ${presentation.title}`);
      this.setContextContent(
        presentation.stage === 'DISTANT'
          ? 'Intermittent hostile signatures are detected outside the road network. Moving in this direction improves information accuracy.'
          : 'The hostile direction and scale are narrowing. Explore roads to identify the source.',
        [
          ['SIGNAL', presentation.stage],
          ['THREAT', `T${presentation.threat}`],
          ['TYPE', presentation.profileLabel],
          ['SOURCE', Number.isFinite(sourceDistance) ? `about ${Math.round(sourceDistance)} m ahead` : 'Unknown'],
          ['YOU', Number.isFinite(playerDistance) ? `${Math.round(playerDistance)}m` : 'NO GPS'],
          ['WAVES', String(source.wavesSent ?? 0)]
        ],
        ['Enemy squads enter from unconfirmed areas. The source is fixed at the same world coordinates and will not move away when you explore roads toward it.']
      );
    } else if (selected.kind === 'enemyBase') {
      const base = state.world.enemyBases.find(item => item.id === selected.id);
      if (!base?.alive) { this.clearObjectSelection(); return; }
      const definition = ENEMY_BASE_DEFINITIONS[base.type];
      this.contextTitle.textContent = this.localize(definition.name);
      const attackers = (state.combat.friendlySquads ?? []).filter(squad => squad.targetBaseId === base.id).length;
      this.context.classList?.add('is-target-mode');
      this.setContextContent(
        'This is the selected enemy base. Attack squads move along roads and begin attacking after reaching it.',
        [['HP', `${Math.ceil(base.hp)}/${base.maxHp}`], ['LEVEL', `Lv.${base.level ?? 1}`], ['ATTACKERS', String(attackers)], ['STATUS', attackers ? 'UNDER ATTACK' : 'HOSTILE']]
      );
      const deploy = this.action(attackers ? 'Add squad' : 'Dispatch', () => this.openDeployment?.({ kind: 'enemyBase', id: base.id }), 'primary');
      deploy.disabled = typeof this.openDeployment !== 'function';
      this.appendStrategicItemActions(state, { kind: 'enemyBase', id: base.id });
    } else if (selected.kind === 'defense') {
      this.context.classList?.add('is-defense-mode');
      const defense = state.combat.defenses.find(item => item.id === selected.id);
      if (!defense) { this.clearObjectSelection(); return; }
      if (this.defensePanelDefenseId !== defense.id) {
        this.defensePanelDefenseId = defense.id;
        this.defensePanelMode = 'summary';
        this.pendingDefenseRemovalId = null;
      }
      const runtime = defenseRuntimeDefinition(defense);
      const presentation = defensePresentation(defense.isGate ? 'gate' : defense.type, runtime);
      const survey = defense.type === 'survey' ? surveyFacilityPresentation(state, defense) : null;
      const operatingStatus = defense.disabledTimer > 0
          ? `Stop ${defense.disabledTimer.toFixed(1)} sec`
          : survey
            ? survey.statusLabel
            : defense.cooldown > 0 ? `reload ${defense.cooldown.toFixed(1)} sec` : defense.isGate ? 'In progress' : 'Active';
      const upgrade = defenseUpgradeStatus(state, defense);
      const surveyMetrics = survey ? [
        ['NEXT', `${survey.nextScanSeconds} sec`],
        ['EXPANDED', `${survey.completedCount}area`],
        ['REMAIN', String(survey.remainingChunks)],
        ['COMM', survey.lastConnectionAt > 0 ? 'Success' : survey.lastTransport === 'CACHE' ? 'Cache' : 'No success'],
        ['LINK', survey.lastEndpoint ? `${survey.lastEndpoint} ${{ SANDBOX_JSONP: 'Sandbox JSONP', GET: 'GET', POST: 'POST', CACHE: 'Cache' }[survey.lastTransport] ?? survey.lastTransport ?? ''}`.trim() : 'No success'],
        ...(survey.lastConnectionAt > 0 ? [['RESPONSE', `${survey.lastResponseElements}`]] : []),
        ...(survey.lastSuccessAt > 0 ? [['ROADS', String(survey.lastRoadCount)]] : []),
        ...(survey.errorCount > 0 ? [['RETRY', String(survey.errorCount)]] : [])
      ] : [];
      const notes = presentation ? ['Upgrading preserves the damage ratio and does not fully heal.'] : [];
      if (survey) {
        notes.push('area to player actually and, field and enemysource Unlocks.');
        if (survey.lastConnectionAt <= 0) notes.push('This facility has no successful road-server communication record yet. If COMM remains unsuccessful, retry with Survey Now.');
        else if (survey.lastSuccessAt <= 0) notes.push('Communication with the road server succeeded, but road parsing and integration are not complete yet.');
        if (survey.lastError) notes.push(`Latest ${survey.lastErrorStage === 'PROCESSING' ? 'road processing' : 'communication'} failure: ${survey.lastError}`);
      }

      this.context.classList?.add(`is-defense-${this.defensePanelMode}`);
      if (this.defensePanelMode === 'details') {
        this.contextTitle.textContent = this.localize(`DETAIL // ${runtime.name}`);
        this.setDefenseDetails(presentation, notes);
        this.action('Return to facilities', () => this.setDefensePanelMode('summary', defense.id), 'primary');
      } else if (this.defensePanelMode === 'upgrade') {
        this.contextTitle.textContent = this.localize(`UPGRADE // ${runtime.name}`);
        this.contextText.textContent = '';
        this.appendDefenseUpgradePreview(state, defense, upgrade);
        this.action('return', () => this.setDefensePanelMode('summary', defense.id));
        const confirmUpgrade = this.action(upgrade.atMax ? 'highestTier' : upgrade.ok ? 'Confirm upgrade' : 'Upgrade requirements not met', () => {
          this.defensePanelMode = 'summary';
          this.mutateAction(draft => this.civilizationSystem.progression.upgradeDefense(draft, defense.id), 'defense:upgrade');
        }, 'primary');
        confirmUpgrade.disabled = !upgrade.ok;
      } else {
        this.contextTitle.textContent = this.localize(`${runtime.name} // Tier ${defense.tier ?? 0}`);
        this.setContextMetrics([
          ['HP', `${Math.ceil(defense.hp)}/${defense.maxHp}`],
          ['STATUS', operatingStatus],
          ['TIER', String(defense.tier ?? 0)],
          ...(presentation?.metrics ?? []).filter(([label]) => label !== 'HP'),
          ...surveyMetrics
        ]);
        this.action('Description', () => this.setDefensePanelMode('details', defense.id));
        const repair = this.action(defense.hp >= defense.maxHp ? 'Repair not needed' : 'Repair', () => this.mutateAction(draft => this.civilizationSystem.progression.repairDefense(draft, defense.id), 'defense:repair'));
        repair.disabled = defense.hp >= defense.maxHp;
        this.appendDefenseLureAction(state, defense);
        if (survey) {
          const surveyBusy = ['QUEUED', 'LOADING'].includes(survey.status);
          const surveyComplete = survey.status === 'COMPLETE' && survey.remainingChunks <= 0;
          const scan = this.action(
            surveyBusy ? 'Survey communication in progress' : surveyComplete ? 'Area acquisition complete' : 'Survey Now',
            () => {
              const result = this.requestSurvey?.(defense.id) ?? { ok: false, reason: 'Survey communication could not start.' };
              this.notifications.show(result.ok ? result.message ?? 'Road surveying started.' : result.reason ?? 'Road survey could not start.');
              if (result.ok) this.persist?.();
              this.renderContext();
            },
            'primary'
          );
          scan.disabled = defense.hp <= 0 || defense.disabledTimer > 0 || surveyBusy || surveyComplete || typeof this.requestSurvey !== 'function';
        }
        const upgradeButton = this.action(upgrade.atMax ? 'highestTier' : 'Upgrade', () => this.setDefensePanelMode('upgrade', defense.id), 'primary');
        upgradeButton.disabled = upgrade.atMax;
        if (defense.kind === 'barrier' && !defense.isGate) {
          const gate = this.action((state.civilization.level ?? 0) >= 2 ? 'Gate to convert' : 'Gate Civ Lv.2 with Unlocks', () => this.mutateAction(draft => this.civilizationSystem.progression.convertBarrierToGate(draft, defense.id), 'defense:gate'));
          gate.disabled = (state.civilization.level ?? 0) < 2 || defense.hp <= 0;
        }
        const removalPending = this.pendingDefenseRemovalId === defense.id;
        this.action(
          removalPending ? 'Confirm removal (no resource refund)' : 'Remove',
          () => this.requestDefenseRemoval(defense.id),
          'danger'
        );
        if (removalPending) this.action('Removing', () => this.cancelDefenseRemoval());
      }
    } else {
      this.contextTitle.textContent = this.localize('city');
      this.setContextContent('Defense target and central city are under attack.', [['HP', `${Math.ceil(state.world.city.hp)}/${state.world.city.maxHp}`], ['CIV', String(state.civilization.level)], ['KILLS', String(state.statistics.kills ?? 0)]]);
    }
    setVisible(this.context, true);
  }

  update(state = this.store.snapshot()) {
    this.cityHp.textContent = `${Math.ceil(state.world.city?.hp ?? 0)}/${Math.ceil(state.world.city?.maxHp ?? 0)}`;
    this.enemyCount.textContent = enemyTotalPopulation(state);
    this.civilizationLevel.textContent = state.civilization.level;
    const affordability = this.affordabilitySignature(state);
    if (affordability !== this.toolAffordabilitySignature) this.renderTools(state);
    if (this.selectedTool !== 'select') this.refreshBuildPlacement(false, state);
    if (this.orderPlanning) {
      const subject = this.planningSubject(state);
      const startNodeId = subject
        ? this.orderPlanning.mode === FRIENDLY_ORDER_MODE.DEPLOYMENT
          ? this.orderPlanning.originNodeId
          : commandStartNodeId(state, subject)
        : null;
      if (!subject) this.cancelOrderPlanning();
      else if (startNodeId !== this.orderPlanning.startNodeId) this.rebuildOrderRoutes(state);
    }
    if (!this.context.hidden) this.renderContext(state);
  }
}
