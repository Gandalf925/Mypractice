import { distance } from '../core/utilities.js';
import { DEFENSE_DEFINITIONS, ENEMY_BASE_DEFINITIONS, ENEMY_DEFINITIONS, defenseRuntimeDefinition } from '../combat/definitions.js';
import { edgeMidpoint } from '../combat/combat-geometry.js';
import { enemyPosition } from '../combat/enemy-system.js';
import { analyzeThreat, remainingRouteDistance } from '../rendering/threat-analysis.js';
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


  clearSelection() {
    this.selectedObject = null;
    this.renderer.setFocus(null);
    setVisible(this.context, false);
  }

  renderTools() {
    this.tools.textContent = '';
    const entries = [['select', { name: '選択', icon: '☝', cost: null }], ...Object.entries(DEFENSE_DEFINITIONS)];
    for (const [type, definition] of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `toolButton${type === this.selectedTool ? ' is-selected' : ''}`;
      button.dataset.tool = type;
      const cost = definition.cost ? bundleText(definition.cost) : '';
      button.innerHTML = `<strong>${definition.icon}</strong><span>${definition.name}</span>${cost ? `<small>${cost}</small>` : ''}`;
      button.addEventListener('click', () => {
        this.selectedTool = type;
        this.clearSelection();
        this.renderTools();
        this.notifications.show(type === 'select' ? '設備・敵拠点・前哨地を選択できます。' : '拠点から85m以内へ配置してください。');
      });
      this.tools.appendChild(button);
    }
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
    let result = null;
    this.store.mutate(state => {
      result = this.buildSystem.buildAt(state, this.selectedTool, worldPoint, 24 / this.camera.scale);
    }, 'combat:build', { emit: true, validate: true });
    if (!result?.ok) {
      this.notifications.show(result?.reason ?? '設置できません。');
      return;
    }
    this.notifications.show(`${DEFENSE_DEFINITIONS[this.selectedTool].name}を設置しました。`);
    this.renderer.render();
    this.update();
  }


  setContextContent(summary, metrics = []) {
    this.contextText.textContent = '';
    const description = document.createElement('p');
    description.className = 'contextSummary';
    description.textContent = summary;
    this.contextText.appendChild(description);
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
  }

  mutateAction(action, reason) {
    let result;
    this.store.mutate(state => { result = action(state); }, reason, { emit: true, validate: true });
    this.notifications.show(result?.ok ? '操作を実行しました。' : result?.reason ?? '操作できません。');
    this.renderContext();
    this.renderer.render();
  }

  renderContext() {
    if (!this.selectedObject) {
      setVisible(this.context, false);
      return;
    }
    const state = this.store.select(value => value);
    this.contextActions.textContent = '';
    const selected = this.selectedObject;
    if (selected.kind === 'enemy') {
      const enemy = state.combat.enemies.find(item => item.id === selected.id);
      if (!enemy || enemy.hp <= 0) { this.clearSelection(); return; }
      const definition = ENEMY_DEFINITIONS[enemy.type] ?? ENEMY_DEFINITIONS.infantry;
      const remaining = remainingRouteDistance(state, enemy);
      this.contextTitle.textContent = `TARGET // ${definition.name}`;
      this.setContextContent('都市へ進行中の敵性反応です。', [['HP', `${Math.ceil(enemy.hp)}/${enemy.maxHp}`], ['RANGE', Number.isFinite(remaining) ? `${Math.round(remaining)}m` : 'RECALC'], ['SPEED', `${definition.speed}m/s`], ['DAMAGE', String(definition.cityDamage)]]);
    } else if (selected.kind === 'enemyBase') {
      const base = state.world.enemyBases.find(item => item.id === selected.id);
      if (!base?.alive) { this.clearSelection(); return; }
      const definition = ENEMY_BASE_DEFINITIONS[base.type];
      const node = state.world.roadGraph.nodeById.get(base.nodeId);
      const gap = state.player.worldPosition && node ? distance(state.player.worldPosition, node) : Infinity;
      this.contextTitle.textContent = definition.name;
      this.setContextContent('敵部隊の出撃源です。現地へ移動すると制圧できます。', [['WAVES', String(base.wavesSent)], ['RANGE', Number.isFinite(gap) ? `${Math.round(gap)}m` : 'NO GPS'], ['CAPTURE', `${Math.floor(base.captureProgress ?? 0)}/${definition.captureDuration}s`], ['LEVEL', String(base.level ?? 1)]]);
      this.action('現地で制圧開始', () => this.mutateAction(draft => this.civilizationSystem.outposts.beginCapture(draft, base.id), 'outpost:capture-start'), 'primary');
    } else if (selected.kind === 'defense') {
      const defense = state.combat.defenses.find(item => item.id === selected.id);
      if (!defense) { this.clearSelection(); return; }
      const definition = DEFENSE_DEFINITIONS[defense.type];
      this.contextTitle.textContent = `${definition.name} Tier ${defense.tier ?? 0}`;
      const runtime = defenseRuntimeDefinition(defense);
      const status = defense.ruined ? '破壊済み' : defense.disabledTimer > 0 ? `停止 ${defense.disabledTimer.toFixed(1)}秒` : defense.cooldown > 0 ? `再装填 ${defense.cooldown.toFixed(1)}秒` : '稼働';
      const range = runtime?.range ? `・射程 ${Math.round(runtime.range)}m` : '';
      this.setContextContent('道路防衛設備です。', [['HP', `${Math.ceil(defense.hp)}/${defense.maxHp}`], ['RANGE', runtime?.range ? `${Math.round(runtime.range)}m` : '--'], ['STATUS', status], ['TIER', String(defense.tier ?? 0)]]);
      this.action('修理', () => this.mutateAction(draft => this.civilizationSystem.progression.repairDefense(draft, defense.id), 'defense:repair'));
      this.action('強化', () => this.mutateAction(draft => this.civilizationSystem.progression.upgradeDefense(draft, defense.id), 'defense:upgrade'), 'primary');
      if (defense.kind === 'barrier' && !defense.isGate) this.action('門へ変換', () => this.mutateAction(draft => this.civilizationSystem.progression.convertBarrierToGate(draft, defense.id), 'defense:gate'));
    } else if (selected.kind === 'outpost') {
      const outpost = state.world.outposts.find(item => item.id === selected.id);
      if (!outpost) { this.clearSelection(); return; }
      this.contextTitle.textContent = outpost?.status === 'RUINED' ? '廃墟前哨地' : '前哨地';
      if (outpost?.status === 'RUINED') {
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
    const threat = analyzeThreat(state);
    this.threatStatus.dataset.level = threat.key;
    this.threatLevel.textContent = threat.label;
    this.threatDetail.textContent = threat.detail;
    this.nearestThreat.textContent = Number.isFinite(threat.nearestDistance) ? `${Math.round(threat.nearestDistance)}m` : '--';
    this.activeDefenses.textContent = state.combat.defenses.filter(defense => defense.hp > 0 && !defense.ruined).length;
    this.activeWaves.textContent = Object.keys(state.combat.waves.active ?? {}).length;
    if (!this.context.hidden) this.renderContext();
  }
}
