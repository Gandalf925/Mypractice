import { distance } from '../core/utilities.js';
import { DEFENSE_DEFINITIONS, ENEMY_BASE_CAPTURE_RANGE_METERS, ENEMY_BASE_DEFINITIONS, ENEMY_DEFINITIONS, defenseRuntimeDefinition } from '../combat/definitions.js';
import { defensePresentation } from '../combat/defense-presentation.js';
import { edgeMidpoint } from '../combat/combat-geometry.js';
import { enemyPosition } from '../combat/enemy-system.js';
import { analyzeThreatCached, remainingRouteDistance } from '../rendering/threat-analysis.js';
import { bundleText } from '../civilization/inventory-system.js';
import { RESOURCE_LABELS } from '../civilization/data.js';
import { queryRequired, setVisible } from './dom.js';

export class CombatUi {
  constructor({ store, buildSystem, civilizationSystem, camera, renderer, notifications }) {
    this.store = store;
    this.buildSystem = buildSystem;
    this.civilizationSystem = civilizationSystem;
    this.camera = camera;
    this.renderer = renderer;
    this.notifications = notifications;
    this.selectedTool = 'select';
    this.selectedObject = null;
    this.buildCandidate = null;
    this.buildSites = [];
    this.buildPlacementSignature = '';
    this.toolAffordabilitySignature = '';
    this.tools = queryRequired('#combatTools');
    this.cityHp = queryRequired('#cityHp');
    this.enemyCount = queryRequired('#enemyCount');
    this.civilizationLevel = queryRequired('#civilizationLevel');
    this.context = queryRequired('#contextPanel');
    this.contextTitle = queryRequired('#contextTitle');
    this.contextText = queryRequired('#contextText');
    this.contextActions = queryRequired('#contextActions');
    this.threatStatus = queryRequired('#threatStatus');
    this.threatLevel = queryRequired('#threatLevel');
    this.threatDetail = queryRequired('#threatDetail');
    this.nearestThreat = queryRequired('#nearestThreat');
    this.activeDefenses = queryRequired('#activeDefenses');
    this.activeWaves = queryRequired('#activeWaves');
    this.renderTools();
  }

  clearObjectSelection({ hideContext = true } = {}) {
    this.selectedObject = null;
    this.renderer.setFocus(null);
    if (hideContext) setVisible(this.context, false);
  }

  affordabilitySignature(state) {
    return Object.keys(DEFENSE_DEFINITIONS)
      .map(type => `${type}:${this.buildSystem.canAfford(state, type) ? 1 : 0}`)
      .join('|');
  }

  renderTools() {
    const state = this.store.select(value => value);
    this.toolAffordabilitySignature = this.affordabilitySignature(state);
    this.tools.textContent = '';
    const entries = [['select', { name: '選択', icon: '☝', cost: null }], ...Object.entries(DEFENSE_DEFINITIONS)];
    for (const [type, definition] of entries) {
      const affordable = type === 'select' || this.buildSystem.canAfford(state, type);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `toolButton${type === this.selectedTool ? ' is-selected' : ''}${affordable ? '' : ' is-unaffordable'}`;
      button.dataset.tool = type;
      button.setAttribute?.('aria-pressed', String(type === this.selectedTool));
      const cost = definition.cost ? bundleText(definition.cost) : '';
      button.innerHTML = `<strong>${definition.icon}</strong><span>${definition.name}</span>${cost ? `<small>${cost}</small>` : ''}`;
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
      this.context.classList?.remove('is-build-mode', 'has-candidate');
      this.notifications.show('設備・敵拠点・前哨地を選択できます。');
      return;
    }

    this.refreshBuildPlacement(true);
    this.renderContext();
    const presentation = defensePresentation(this.selectedTool);
    this.notifications.show(`${presentation?.role ?? '建設'}：表示された有効地点を選択してください。`);
  }

  placementSignature(state) {
    if (this.selectedTool === 'select') return 'select';
    const definition = DEFENSE_DEFINITIONS[this.selectedTool];
    const resourceState = Object.keys(definition.cost)
      .map(key => `${key}:${state.inventory.resources[key] ?? 0}`)
      .join(',');
    const occupiedState = state.combat.defenses
      .filter(defense => defense.kind === definition.kind)
      .map(defense => `${defense.id}:${defense.hp > 0 && !defense.ruined ? 1 : 0}`)
      .join(',');
    const graph = state.world.roadGraph;
    const anchorState = this.buildSystem.getBuildAnchors(state)
      .map(anchor => `${anchor.id}:${anchor.point.x.toFixed(1)},${anchor.point.y.toFixed(1)}`)
      .join(';');
    return [
      this.selectedTool,
      resourceState,
      occupiedState,
      graph?.nodes?.length ?? 0,
      graph?.edges?.length ?? 0,
      anchorState
    ].join('|');
  }

  refreshBuildPlacement(force = false) {
    if (this.selectedTool === 'select') {
      this.renderer.setBuildPlacement(null);
      return;
    }
    const state = this.store.select(value => value);
    const signature = this.placementSignature(state);
    if (!force && signature === this.buildPlacementSignature) return;

    if (this.buildCandidate) {
      const validation = this.buildSystem.validateCandidate(state, this.buildCandidate, { checkResources: false });
      this.buildCandidate = validation.ok ? validation.candidate : null;
    }
    this.buildSites = this.buildSystem.listBuildSites(state, this.selectedTool);
    const affordable = this.buildSystem.canAfford(state, this.selectedTool);
    this.renderer.setBuildPlacement({
      type: this.selectedTool,
      anchors: this.buildSystem.getBuildAnchors(state),
      sites: this.buildSites,
      candidate: this.buildCandidate,
      affordable
    });
    this.buildPlacementSignature = signature;
  }

  nearestObject(state, point, tolerance) {
    const graph = state.world.roadGraph;
    const candidates = [];
    for (const base of state.world.enemyBases) {
      if (!base.alive) continue;
      const node = graph.nodeById.get(base.nodeId);
      if (node) candidates.push({ kind: 'enemyBase', id: base.id, point: node, distance: distance(point, node) });
    }
    for (const outpost of state.world.outposts) {
      if (!['ACTIVE', 'RUINED'].includes(outpost.status)) continue;
      const node = graph.nodeById.get(outpost.nodeId);
      if (node) candidates.push({ kind: 'outpost', id: outpost.id, point: node, distance: distance(point, node) });
    }
    for (const defense of state.combat.defenses) {
      const position = defense.kind === 'barrier' ? edgeMidpoint(graph, defense.edgeId) : graph.nodeById.get(defense.nodeId);
      if (position) candidates.push({ kind: 'defense', id: defense.id, point: position, distance: distance(point, position) });
    }
    for (const enemy of state.combat.enemies) {
      if (enemy.hp <= 0 || enemy.departDelay > 0) continue;
      const position = enemyPosition(state, enemy);
      candidates.push({ kind: 'enemy', id: enemy.id, point: position, distance: distance(point, position) });
    }
    const city = graph.nodeById.get(state.world.city.nodeId);
    if (city) candidates.push({ kind: 'city', id: 'city', point: city, distance: distance(point, city) });
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0]?.distance <= tolerance ? candidates[0] : null;
  }

  handleMapTap(worldPoint) {
    if (this.selectedTool === 'select') {
      const state = this.store.select(value => value);
      this.selectedObject = this.nearestObject(state, worldPoint, 24 / this.camera.scale);
      this.renderer.setFocus(this.selectedObject ? { kind: this.selectedObject.kind, id: this.selectedObject.id } : null);
      this.renderContext();
      return;
    }

    const state = this.store.select(value => value);
    const result = this.buildSystem.previewAt(state, this.selectedTool, worldPoint, 24 / this.camera.scale);
    if (!result.ok) {
      this.buildCandidate = null;
      this.refreshBuildPlacement(true);
      this.renderContext();
      this.notifications.show(result.reason ?? 'この位置には設置できません。');
      return;
    }
    this.buildCandidate = result.candidate;
    this.refreshBuildPlacement(true);
    this.renderContext();
    this.notifications.show('設置候補を選択しました。範囲と効果を確認して建設を確定してください。');
  }

  confirmBuildCandidate() {
    if (!this.buildCandidate || this.selectedTool === 'select') return;
    const state = this.store.select(value => value);
    const validation = this.buildSystem.validateCandidate(state, this.buildCandidate, { checkResources: true });
    if (!validation.ok) {
      this.notifications.show(validation.reason ?? '建設できません。');
      this.refreshBuildPlacement(true);
      this.renderContext();
      return;
    }

    let result = null;
    this.store.mutate(draft => {
      result = this.buildSystem.buildCandidate(draft, validation.candidate);
    }, 'combat:build', { emit: true, validate: true });
    if (!result?.ok) {
      this.notifications.show(result?.reason ?? '建設できません。');
      this.refreshBuildPlacement(true);
      this.renderContext();
      return;
    }

    this.notifications.show(`${DEFENSE_DEFINITIONS[this.selectedTool].name}を設置しました。`);
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

  setContextContent(summary, metrics = [], details = []) {
    this.contextText.textContent = '';
    const description = document.createElement('p');
    description.className = 'contextSummary';
    description.textContent = summary;
    this.contextText.appendChild(description);
    for (const detailText of details) {
      const detail = document.createElement('p');
      detail.className = 'contextDetail';
      detail.textContent = detailText;
      this.contextText.appendChild(detail);
    }
    if (!metrics.length) return;
    const grid = document.createElement('div');
    grid.className = 'contextMetricGrid';
    for (const [label, value] of metrics) {
      const item = document.createElement('span');
      const key = document.createElement('small');
      const data = document.createElement('b');
      key.textContent = label;
      data.textContent = value;
      item.append(key, data);
      grid.appendChild(item);
    }
    this.contextText.appendChild(grid);
  }

  action(label, handler, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = className;
    button.addEventListener('click', handler);
    this.contextActions.appendChild(button);
    return button;
  }

  mutateAction(action, reason) {
    let result;
    this.store.mutate(state => { result = action(state); }, reason, { emit: true, validate: true });
    this.notifications.show(result?.ok ? '操作を実行しました。' : result?.reason ?? '操作できません。');
    this.renderContext();
    this.renderer.render();
  }

  renderBuildContext() {
    const state = this.store.select(value => value);
    const definition = DEFENSE_DEFINITIONS[this.selectedTool];
    const presentation = defensePresentation(this.selectedTool, definition);
    if (!definition || !presentation) {
      this.selectTool('select');
      return;
    }
    const affordable = this.buildSystem.canAfford(state, this.selectedTool);
    this.context.classList?.add('is-build-mode');
    this.context.classList?.toggle('has-candidate', Boolean(this.buildCandidate));
    this.contextActions.textContent = '';
    this.contextTitle.textContent = `BUILD // ${definition.name} // ${presentation.role}`;
    const instruction = this.buildCandidate
      ? '白い照準が現在の設置候補です。効果範囲と費用を確認して確定してください。'
      : this.buildSites.length
        ? '緑色で表示された有効地点から設置位置を選択してください。'
        : '現在の建設可能範囲内に空いている設置地点がありません。';
    const anchors = this.buildSystem.getBuildAnchors(state);
    const metrics = [
      ...presentation.metrics,
      ['COST', bundleText(definition.cost)],
      ['STOCK', affordable ? 'OK' : '不足'],
      ['SITES', String(this.buildSites.length)],
      ['ZONES', anchors.map(anchor => anchor.label).join(' + ') || 'NONE'],
      ...(this.buildCandidate ? [['SOURCE', this.buildCandidate.anchorLabel ?? '再計算']] : [])
    ];
    this.setContextContent(instruction, metrics, [
      presentation.summary,
      presentation.effect,
      presentation.placement,
      `建設可能範囲は本拠地と現在地を中心とする各85mです。現在地側は読み込み済み道路網の範囲内で利用できます。`
    ]);
    if (this.buildCandidate) {
      const confirm = this.action(affordable ? '建設を確定' : '資源不足', () => this.confirmBuildCandidate(), 'primary');
      confirm.disabled = !affordable;
      this.action('候補を解除', () => this.cancelBuildCandidate());
    }
    this.action('選択モードへ戻る', () => this.selectTool('select'));
    setVisible(this.context, true);
  }

  renderContext() {
    if (this.selectedTool !== 'select') {
      this.renderBuildContext();
      return;
    }
    this.context.classList?.remove('is-build-mode', 'has-candidate');
    if (!this.selectedObject) {
      setVisible(this.context, false);
      return;
    }
    const state = this.store.select(value => value);
    this.contextActions.textContent = '';
    const selected = this.selectedObject;
    if (selected.kind === 'enemy') {
      const enemy = state.combat.enemies.find(item => item.id === selected.id);
      if (!enemy || enemy.hp <= 0) { this.clearObjectSelection(); return; }
      const definition = ENEMY_DEFINITIONS[enemy.type] ?? ENEMY_DEFINITIONS.infantry;
      const remaining = remainingRouteDistance(state, enemy);
      const targetDefense = enemy.targetDefenseId
        ? state.combat.defenses.find(defense => defense.id === enemy.targetDefenseId && defense.hp > 0 && !defense.ruined)
        : null;
      const targetName = targetDefense ? DEFENSE_DEFINITIONS[targetDefense.type]?.name ?? '防衛施設' : '都市';
      const summary = targetDefense
        ? `${targetName}を優先目標として進行中です。目標を破壊すると別の施設または都市へ再進路を取ります。`
        : '都市へ進行中の敵性反応です。壁への対応は敵種ごとに異なります。';
      this.contextTitle.textContent = `TARGET // ${definition.name}`;
      this.setContextContent(summary, [
        ['HP', `${Math.ceil(enemy.hp)}/${enemy.maxHp}`],
        ['RANGE', Number.isFinite(remaining) ? `${Math.round(remaining)}m` : 'RECALC'],
        ['SPEED', `${definition.speed}m/s`],
        ['DAMAGE', String(definition.cityDamage)],
        ['ROUTE', definition.routeLabel ?? '状況判断'],
        ['OBJECTIVE', targetName]
      ], [`基本目標：${definition.objectiveLabel ?? '都市'}`]);
    } else if (selected.kind === 'enemyBase') {
      const base = state.world.enemyBases.find(item => item.id === selected.id);
      if (!base?.alive) { this.clearObjectSelection(); return; }
      const definition = ENEMY_BASE_DEFINITIONS[base.type];
      const node = state.world.roadGraph.nodeById.get(base.nodeId);
      const gap = state.player.worldPosition && node ? distance(state.player.worldPosition, node) : Infinity;
      this.contextTitle.textContent = definition.name;
      const entryStatus = gap <= ENEMY_BASE_CAPTURE_RANGE_METERS ? 'IN RANGE' : 'OUTSIDE';
      this.setContextContent(
        '敵部隊の出撃源です。制圧範囲内で敵を排除し、必要時間その場に留まると前哨地化できます。',
        [['WAVES', String(base.wavesSent)], ['DIST', Number.isFinite(gap) ? `${Math.round(gap)}m` : 'NO GPS'], ['ENTRY', `${ENEMY_BASE_CAPTURE_RANGE_METERS}m`], ['STATUS', entryStatus], ['CAPTURE', `${Math.floor(base.captureProgress ?? 0)}/${definition.captureDuration}s`], ['LEVEL', String(base.level ?? 1)]]
      );
      this.action('現地で制圧開始', () => this.mutateAction(draft => this.civilizationSystem.outposts.beginCapture(draft, base.id), 'outpost:capture-start'), 'primary');
    } else if (selected.kind === 'defense') {
      const defense = state.combat.defenses.find(item => item.id === selected.id);
      if (!defense) { this.clearObjectSelection(); return; }
      const definition = DEFENSE_DEFINITIONS[defense.type];
      this.contextTitle.textContent = `${definition.name} Tier ${defense.tier ?? 0}`;
      const runtime = defenseRuntimeDefinition(defense);
      const presentation = defensePresentation(defense.type, runtime);
      const status = defense.ruined ? '破壊済み' : defense.disabledTimer > 0 ? `停止 ${defense.disabledTimer.toFixed(1)}秒` : defense.cooldown > 0 ? `再装填 ${defense.cooldown.toFixed(1)}秒` : '稼働';
      this.setContextContent(
        presentation?.summary ?? '道路防衛設備です。',
        [['HP', `${Math.ceil(defense.hp)}/${defense.maxHp}`], ['STATUS', status], ['TIER', String(defense.tier ?? 0)], ...(presentation?.metrics ?? [])],
        presentation ? [presentation.effect, presentation.placement] : []
      );
      this.action('修理', () => this.mutateAction(draft => this.civilizationSystem.progression.repairDefense(draft, defense.id), 'defense:repair'));
      this.action('強化', () => this.mutateAction(draft => this.civilizationSystem.progression.upgradeDefense(draft, defense.id), 'defense:upgrade'), 'primary');
      if (defense.kind === 'barrier' && !defense.isGate) this.action('門へ変換', () => this.mutateAction(draft => this.civilizationSystem.progression.convertBarrierToGate(draft, defense.id), 'defense:gate'));
    } else if (selected.kind === 'outpost') {
      const outpost = state.world.outposts.find(item => item.id === selected.id);
      if (!outpost) { this.clearObjectSelection(); return; }
      this.contextTitle.textContent = outpost.status === 'RUINED' ? '廃墟前哨地' : '前哨地';
      if (outpost.status === 'RUINED') {
        const cost = this.civilizationSystem.outposts.restoreCost(state, outpost);
        this.setContextContent('修復すると資源前哨地として再稼働します。', [['STATUS', 'RUINED'], ['COST', bundleText(cost)]]);
        this.action('前哨地を修復', () => this.mutateAction(draft => this.civilizationSystem.outposts.restore(draft, outpost.id), 'outpost:restore'), 'primary');
      } else {
        this.setContextContent('制圧済み前哨地です。', [['STATUS', 'ACTIVE'], ['OUTPUT', outpost.resource ? `${RESOURCE_LABELS[outpost.resource] ?? outpost.resource}` : 'NONE'], ['HP', `${Math.ceil(outpost.hp)}/${outpost.maxHp}`]]);
      }
    } else {
      this.contextTitle.textContent = '都市';
      this.setContextContent('防衛対象となる中枢都市です。', [['HP', `${Math.ceil(state.world.city.hp)}/${state.world.city.maxHp}`], ['CIV', String(state.civilization.level)], ['KILLS', String(state.statistics.kills ?? 0)]]);
    }
    setVisible(this.context, true);
  }

  update() {
    const state = this.store.select(value => value);
    this.cityHp.textContent = Math.ceil(state.world.city?.hp ?? 0);
    this.enemyCount.textContent = state.combat.enemies.length;
    this.civilizationLevel.textContent = state.civilization.level;
    const threat = analyzeThreatCached(state);
    this.threatStatus.dataset.level = threat.key;
    this.threatLevel.textContent = threat.label;
    this.threatDetail.textContent = threat.detail;
    this.nearestThreat.textContent = Number.isFinite(threat.nearestDistance) ? `${Math.round(threat.nearestDistance)}m` : '--';
    this.activeDefenses.textContent = state.combat.defenses.filter(defense => defense.hp > 0 && !defense.ruined).length;
    this.activeWaves.textContent = Object.keys(state.combat.waves.active ?? {}).length;

    const affordability = this.affordabilitySignature(state);
    if (affordability !== this.toolAffordabilitySignature) this.renderTools();
    if (this.selectedTool !== 'select') this.refreshBuildPlacement();
    if (!this.context.hidden) this.renderContext();
  }
}
