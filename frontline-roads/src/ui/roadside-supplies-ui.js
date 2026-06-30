import { queryRequired, setVisible } from './dom.js';
import {
  ROADSIDE_USE_DEFINITIONS, TACTICAL_MATERIAL_DEFINITIONS, TACTICAL_RECIPES, TACTICAL_WORKSHOP_BUILDING,
  ensureRoadsideSupplyState, roadsideSupplyPresentation, tacticalRecipeStatus
} from '../exploration/roadside-supplies.js';
import { RESOURCE_LABELS } from '../civilization/data.js';

function countText(count) {
  return count > 99 ? '99+' : String(count);
}

function activeSummary(state) {
  const supplies = state.world?.roadsideSupplies?.active ?? [];
  if (!supplies.length) return '周辺の道端物資なし';
  const resources = supplies.filter(item => item.kind === 'resource').length;
  const items = supplies.length - resources;
  return [`周辺 ${supplies.length}`, resources ? `資源 ${resources}` : null, items ? `装備 ${items}` : null].filter(Boolean).join(' / ');
}

function bundleText(bundle = {}) {
  const values = Object.entries(bundle).filter(([, value]) => Number(value) > 0);
  return values.length ? values.map(([key, value]) => `${RESOURCE_LABELS[key] ?? key} ${value}`).join('・') : 'なし';
}

function materialText(materials = {}) {
  const values = Object.entries(materials).filter(([, value]) => Number(value) > 0);
  return values.length ? values.map(([key, value]) => `${TACTICAL_MATERIAL_DEFINITIONS[key]?.name ?? key} ${value}`).join('・') : 'なし';
}

function shortageText(resourceMissing = {}, materialMissing = {}) {
  const resources = Object.entries(resourceMissing)
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${RESOURCE_LABELS[key] ?? key} あと${Math.floor(Number(value) || 0)}`);
  const materials = Object.entries(materialMissing)
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${TACTICAL_MATERIAL_DEFINITIONS[key]?.name ?? key} あと${Math.floor(Number(value) || 0)}`);
  return [...resources, ...materials].join('・');
}

function distanceText(state, point) {
  const player = state.player?.worldPosition;
  if (!player || !Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y))) return '';
  const dx = Number(point.x) - Number(player.x);
  const dy = Number(point.y) - Number(player.y);
  const meters = Math.round(Math.sqrt(dx * dx + dy * dy));
  return Number.isFinite(meters) ? `${meters}m` : '';
}

function tabButton(id, label, active) {
  return `<button type="button" data-ui-tab="${id}" class="${active === id ? 'active' : ''}">${label}</button>`;
}

function tabPanel(id, active, html) {
  return `<section class="uiTabPanel ${active === id ? 'active' : ''}" data-panel="${id}">${html}</section>`;
}

export class RoadsideSuppliesUi {
  constructor({ store, roadsideSupplySystem, notifications, persist, i18n = null }) {
    this.store = store;
    this.roadsideSupplySystem = roadsideSupplySystem;
    this.notifications = notifications;
    this.persist = persist;
    this.i18n = i18n;
    this.button = queryRequired('#suppliesButton');
    this.panel = queryRequired('#suppliesPanel');
    this.body = queryRequired('#suppliesBody');
    this.closeButton = queryRequired('#closeSupplies');
    this.lastPanelRenderAt = 0;
    this.activeTab = 'inventory';
    this.disclosureState = new Map();
    this.button.addEventListener('click', () => this.open());
    this.closeButton.addEventListener('click', () => this.close());
    this.panel.addEventListener('click', event => { if (event.target === this.panel) this.close(); });
    this.body.addEventListener('click', event => {
      const tabButton = event.target.closest('button[data-ui-tab]');
      if (!tabButton) return;
      this.activeTab = tabButton.dataset.uiTab || 'inventory';
      this.render();
    });
    this.body.addEventListener('toggle', event => this.handleDisclosureToggle(event), true);
  }

  localize(text = '') { return this.i18n?.copy?.(text) ?? text; }

  handleDisclosureToggle(event) {
    const target = event?.target;
    if (!target?.matches?.('details[data-ui-disclosure]')) return;
    const key = target.dataset?.uiDisclosure;
    if (!key) return;
    this.disclosureState.set(key, Boolean(target.open));
  }

  disclosureOpen(key, fallback = false) {
    return this.disclosureState.has(key) ? Boolean(this.disclosureState.get(key)) : fallback;
  }

  open() {
    this.store.transaction(state => { this.roadsideSupplySystem.refresh(state, true); }, 'roadside:manual-refresh');
    this.render();
    setVisible(this.panel, true);
  }

  close() { setVisible(this.panel, false); }

  useItem(key) {
    let result = null;
    this.store.transaction(state => { result = this.roadsideSupplySystem.use(state, key); }, `roadside:use-${key}`);
    if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'アイテムを使用できません。'));
    else this.persist?.({ notify: false });
    this.render();
  }

  openDeploymentTab(key = null) {
    this.activeTab = 'deployment';
    this.render();
    if (key) {
      const target = this.body.querySelector(`[data-deployment-section="${key}"]`);
      target?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  useDeploymentTarget(key, kind, id) {
    let result = null;
    this.store.transaction(state => { result = this.roadsideSupplySystem.useDeploymentTarget?.(state, key, { kind, id }); }, `roadside:deploy-${key}`);
    if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? '一時部隊を出撃できません。'));
    else this.persist?.({ notify: false });
    this.render();
  }

  useLureTarget(kind, id) {
    let result = null;
    this.store.transaction(state => { result = this.roadsideSupplySystem.useLureTarget?.(state, { kind, id }); }, `roadside:lure-${kind}`);
    if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? '誘導信号を使用できません。'));
    else this.persist?.({ notify: false });
    this.render();
  }

  craft(recipeKey) {
    let result = null;
    this.store.transaction(state => { result = this.roadsideSupplySystem.craft?.(state, recipeKey); }, `roadside:craft-${recipeKey}`);
    if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? '製作できません。'));
    else this.persist?.({ notify: false });
    this.render();
  }

  removeMine(mineId) {
    let result = null;
    this.store.transaction(state => { result = this.roadsideSupplySystem.removeMine?.(state, mineId); }, 'roadside:remove-mine');
    if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? '撤去できません。'));
    else this.persist?.({ notify: false });
    this.render();
  }

  update(view = this.store.uiSnapshot()) {
    const state = view ?? this.store.uiSnapshot();
    const supplies = ensureRoadsideSupplyState(state);
    const total = Object.values(supplies.inventory ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    const materialTotal = Object.values(supplies.materials ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    this.button.textContent = total + materialTotal > 0 ? this.localize(`ITEMS // 物資 ${countText(total + materialTotal)}`) : this.localize('ITEMS // 物資');
    this.button.title = this.localize(activeSummary(state));
    if (!this.panel.hidden && Date.now() - this.lastPanelRenderAt >= 700) this.render(state);
  }

  render(snapshot = this.store.uiSnapshot()) {
    this.lastPanelRenderAt = Date.now();
    const state = snapshot ?? this.store.uiSnapshot();
    const supplies = ensureRoadsideSupplyState(state);
    const inventory = supplies.inventory ?? {};
    const active = supplies.active ?? [];
    const activeSorted = [...active].sort((a, b) => {
      const da = distanceText(state, a) || '99999m';
      const db = distanceText(state, b) || '99999m';
      return parseInt(da, 10) - parseInt(db, 10) || String(a.id).localeCompare(String(b.id));
    });
    const nearby = activeSorted.slice(0, 12).map(item => {
      const presentation = roadsideSupplyPresentation(item);
      const detail = item.kind === 'resource' ? bundleText(item.bundle) : presentation.summary;
      const gap = distanceText(state, item);
      return `<li><strong>${presentation.name}<em>${presentation.rarity ?? item.rarity ?? 'common'}${gap ? `・${gap}` : ''}</em></strong><span>${detail}</span></li>`;
    }).join('') || '<li><span>現在地周辺に表示中の道端物資はありません。</span></li>';

    const deploymentKeys = Object.entries(ROADSIDE_USE_DEFINITIONS).filter(([, definition]) => definition.squadType).map(([key]) => key);
    const inventoryHtml = Object.entries(ROADSIDE_USE_DEFINITIONS).map(([key, definition]) => {
      const count = Math.max(0, Math.floor(Number(inventory[key]) || 0));
      const squadOnly = key === 'marchBanner' || key === 'smokeScreen';
      const targetOnly = ['remoteBarrage', 'airSupport', 'areaSuppression'].includes(key);
      const lureTargetOnly = key === 'lureSignal';
      const deploymentCall = Boolean(definition.squadType);
      const disabled = count <= 0 || squadOnly || targetOnly || lureTargetOnly || deploymentCall ? 'disabled' : '';
      const label = deploymentCall
        ? `${definition.searchRangeMeters}m以内の出撃先を選び、一時部隊を派遣`
        : key === 'sweepSignal'
          ? `現在地${definition.radiusMeters}m以内の通常敵を掃討`
          : key === 'breachCharge'
            ? `現在地${definition.radiusMeters}m以内の敵拠点1つを破壊`
            : ['roadMine', 'directionalMine', 'armorBreakerMine'].includes(key)
              ? `道路上に設置。時間制限なし・発動まで残存`
              : key === 'lureSignal'
                ? `下の誘導先リストから地雷または防衛密集地点を指定`
                : targetOnly
                  ? '敵部隊または敵拠点を選択すると下部操作に表示されます'
                  : squadOnly
                    ? '味方部隊を選択すると下部操作に表示されます'
                    : '対象不要の消耗品';
      const buttonText = deploymentCall ? `出撃先を選ぶ ×${count}` : squadOnly ? `部隊選択後に使用 ×${count}` : targetOnly ? `対象選択後に使用 ×${count}` : lureTargetOnly ? `誘導先を選ぶ ×${count}` : `すぐ使用 ×${count}`;
      const action = deploymentCall
        ? `<button type="button" data-open-deployment="${key}" ${count <= 0 ? 'disabled' : ''}>${buttonText}</button>`
        : `<button type="button" data-use-roadside="${key}" ${disabled}>${buttonText}</button>`;
      return `<div class="supplyInventoryRow${squadOnly || targetOnly || lureTargetOnly || deploymentCall ? ' is-squad-only' : ''}">
        <div><strong>${definition.name}</strong><span>${label}</span></div>
        ${action}
      </div>`;
    }).join('');

    const deploymentHtml = deploymentKeys.map(key => {
      const definition = ROADSIDE_USE_DEFINITIONS[key];
      const count = Math.max(0, Math.floor(Number(inventory[key]) || 0));
      const targets = this.roadsideSupplySystem.deploymentTargets?.(state, key) ?? [];
      const targetRows = targets.slice(0, 8).map(target => {
        const hpPercent = Math.max(0, Math.min(100, Math.round(target.hp / Math.max(1, target.maxHp) * 100)));
        const route = target.routeMeters != null ? `経路 ${target.routeMeters}m` : '経路なし';
        const disabled = count <= 0 || !target.available ? 'disabled' : '';
        return `<div class="supplyInventoryRow deploymentTargetRow"><div><strong>${target.name}<em>${target.distanceMeters}m・HP ${hpPercent}%</em></strong><span>${route}${target.available ? '' : '・接続不可'}</span></div><button type="button" data-deploy-roadside="${key}" data-deploy-kind="${target.kind}" data-deploy-id="${target.id}" ${disabled}>この対象へ出撃 ×${count}</button></div>`;
      }).join('') || `<p class="emptyText">${count > 0 ? `現在地から${definition.searchRangeMeters}m以内に出撃可能な対象がありません。` : `${definition.name}を所持していません。`}</p>`;
      return `<section class="deploymentCallSection" data-deployment-section="${key}"><h3>${definition.name}</h3><p class="sectionNote">${definition.squadType === 'skirmisher' ? '遊撃部隊が選択した敵部隊へ向かいます。' : `${definition.targetKind === 'enemyBase' ? '選択した敵拠点' : '選択した敵'}へ一時部隊を向かわせます。`} 一時部隊は同時に1隊までです。</p><div class="supplyInventoryList">${targetRows}</div></section>`;
    }).join('');

    const materialHtml = Object.entries(TACTICAL_MATERIAL_DEFINITIONS).map(([key, definition]) => {
      const count = Math.max(0, Math.floor(Number(supplies.materials?.[key]) || 0));
      if (count <= 0) return '';
      return `<div class="supplyInventoryRow is-material"><div><strong>${definition.name}</strong><span>${definition.rarity}素材</span></div><em>×${count}</em></div>`;
    }).join('') || '<p class="emptyText">戦術素材はまだありません。レア以上の道端物資から入手します。</p>';

    const lureTargets = this.roadsideSupplySystem.lureTargets?.(state) ?? [];
    const lureCount = Math.max(0, Math.floor(Number(inventory.lureSignal) || 0));
    const lureHtml = lureTargets.map(target => {
      const gap = distanceText(state, target);
      const kindText = target.kind === 'mine' ? `設置済み地雷${target.itemKey ? `・${ROADSIDE_USE_DEFINITIONS[target.itemKey]?.name ?? target.itemKey}` : ''}` : `防衛密集地点・${target.count ?? 0}基`;
      const remove = target.kind === 'mine' ? `<button type="button" class="danger" data-remove-mine="${target.id}">撤去</button>` : '';
      return `<div class="supplyInventoryRow lureTargetRow"><div><strong>${target.name}<em>${gap}</em></strong><span>${kindText}</span></div><div class="rowActions"><button type="button" data-lure-kind="${target.kind}" data-lure-id="${target.id}" ${lureCount <= 0 ? 'disabled' : ''}>誘導信号 ×${lureCount}</button>${remove}</div></div>`;
    }).join('') || '<p class="emptyText">誘導先になる設置済み地雷・防衛密集地点がありません。</p>';

    const workshopReady = (state.civilization?.buildings ?? []).some(building => building.type === TACTICAL_WORKSHOP_BUILDING && building.hp > 0);
    const recipes = Object.entries(TACTICAL_RECIPES).map(([key, recipe]) => {
      const status = tacticalRecipeStatus(state, key);
      const resourceCost = bundleText(recipe.resources);
      const materialCost = materialText(recipe.materials);
      const missing = shortageText(status.resourceMissing, status.materialMissing);
      const unlocked = (state.civilization?.level ?? 0) >= recipe.level;
      const ready = status.ok;
      const reason = ready
        ? '必要資源がそろっています。'
        : !unlocked
          ? `文明Lv.${recipe.level}で解禁されます。`
          : !workshopReady
            ? '戦術工房を建設すると製作できます。'
            : missing
              ? `不足：${missing}`
              : status.reason ?? '製作できません。';
      return { key, ready, unlocked, html: `<div class="supplyInventoryRow tacticalRecipe${ready ? ' is-ready' : unlocked ? '' : ' is-locked'}"><div><strong>${recipe.name}</strong><span>${reason}</span><small>資材 ${resourceCost}</small><small>素材 ${materialCost}</small></div><button type="button" data-craft-roadside="${key}" ${ready ? '' : 'disabled'}>製作</button></div>` };
    });
    const craftableHtml = recipes.filter(recipe => recipe.ready).map(recipe => recipe.html).join('') || '<p class="emptyText">現在すぐ製作できるアイテムはありません。</p>';
    const unavailableHtml = recipes.filter(recipe => !recipe.ready).map(recipe => recipe.html).join('') || '<p class="emptyText">未解禁または資源不足のレシピはありません。</p>';

    const activeTab = ['inventory', 'deployment', 'lure', 'workshop', 'materials', 'nearby'].includes(this.activeTab) ? this.activeTab : 'inventory';
    this.body.innerHTML = this.localize(`
      <div class="uiTabBar" role="tablist" aria-label="アイテム画面の表示切替">
        ${tabButton('inventory', '所持品', activeTab)}
        ${tabButton('deployment', '出撃', activeTab)}
        ${tabButton('lure', '誘導', activeTab)}
        ${tabButton('workshop', '製作', activeTab)}
        ${tabButton('materials', '素材', activeTab)}
        ${tabButton('nearby', '周辺', activeTab)}
      </div>
      <section class="overviewHero suppliesHero">
        <div><small>消耗品</small><strong>${Object.values(inventory).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)}</strong><span>所持数合計</span></div>
        <div><small>戦術素材</small><strong>${Object.values(supplies.materials ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)}</strong><span>製作用素材</span></div>
        <div><small>周辺物資</small><strong>${active.length}</strong><span>取得済み ${supplies.daily?.collectedCount ?? 0}</span></div>
      </section>
      ${tabPanel('inventory', activeTab, `<h2>消耗品インベントリ</h2><p class="sectionNote">出撃札は出撃タブで対象を選んでから使用します。使用すると一時部隊がその対象へ出撃します。</p><div class="supplyInventoryList compactInventory">${inventoryHtml}</div>`)}
      ${tabPanel('deployment', activeTab, `<h2>出撃札の出撃先</h2><p class="sectionNote">突撃・遊撃・攻城の各出撃札は、ここで対象を選んで一時部隊を派遣します。対象ごとに距離・経路・HPを確認できます。</p>${deploymentHtml}`)}
      ${tabPanel('lure', activeTab, `<h2>誘導信号の誘導先</h2><p class="sectionNote">設置済み地雷または防衛設備の密集地点へ、一定時間だけ敵の目標を寄せます。地雷へ誘導した敵が踏むと高い損害を与えます。</p><div class="supplyInventoryList">${lureHtml}</div>`)}
      ${tabPanel('workshop', activeTab, `<h2>戦術工房</h2><p class="sectionNote">${workshopReady ? '資源と戦術素材を使って、地雷・誘導信号・遠隔支援・出撃札を製作できます。' : '文明Lv.4以降で戦術工房を建設すると、この画面で戦術アイテムを製作できます。'}</p><h3>製作可能</h3><div class="supplyInventoryList">${craftableHtml}</div><details class="completedRequirements workshopUnavailable" data-ui-disclosure="roadside.workshopUnavailable"${this.disclosureOpen('roadside.workshopUnavailable') ? ' open' : ''}><summary>素材不足・未解禁レシピ</summary><div class="supplyInventoryList">${unavailableHtml}</div></details>`)}
      ${tabPanel('materials', activeTab, `<h2>戦術素材</h2><p class="sectionNote">レア以上の道端物資から入手し、戦術アイテムの製作に使います。</p><div class="supplyInventoryList compactInventory">${materialHtml}</div>`)}
      ${tabPanel('nearby', activeTab, `<h2>道端物資</h2><p class="sectionNote">道路沿いの資源箱は近づくと自動回収します。保管上限を超える資源は取得されません。</p><div class="supplyStatusGrid"><span><small>周辺</small><strong>${active.length}</strong></span><span><small>取得済み</small><strong>${supplies.daily?.collectedCount ?? 0}</strong></span><span><small>レア取得</small><strong>${supplies.daily?.rareCollectedCount ?? 0}</strong></span></div><ul class="supplyNearbyList">${nearby}</ul>`)}
    `);
    for (const button of this.body.querySelectorAll('[data-use-roadside]')) {
      if (button.disabled) continue;
      button.addEventListener('click', () => this.useItem(button.dataset.useRoadside));
    }
    for (const button of this.body.querySelectorAll('[data-open-deployment]')) {
      if (button.disabled) continue;
      button.addEventListener('click', () => this.openDeploymentTab(button.dataset.openDeployment));
    }
    for (const button of this.body.querySelectorAll('[data-deploy-roadside]')) {
      if (button.disabled) continue;
      button.addEventListener('click', () => this.useDeploymentTarget(button.dataset.deployRoadside, button.dataset.deployKind, button.dataset.deployId));
    }
    for (const button of this.body.querySelectorAll('[data-lure-kind]')) {
      if (button.disabled) continue;
      button.addEventListener('click', () => this.useLureTarget(button.dataset.lureKind, button.dataset.lureId));
    }
    for (const button of this.body.querySelectorAll('[data-craft-roadside]')) {
      if (button.disabled) continue;
      button.addEventListener('click', () => this.craft(button.dataset.craftRoadside));
    }
    for (const button of this.body.querySelectorAll('[data-remove-mine]')) {
      button.addEventListener('click', () => this.removeMine(button.dataset.removeMine));
    }
  }
}
