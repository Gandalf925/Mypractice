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
  constructor({ store, roadsideSupplySystem, notifications, persist }) {
    this.store = store;
    this.roadsideSupplySystem = roadsideSupplySystem;
    this.notifications = notifications;
    this.persist = persist;
    this.button = queryRequired('#suppliesButton');
    this.panel = queryRequired('#suppliesPanel');
    this.body = queryRequired('#suppliesBody');
    this.closeButton = queryRequired('#closeSupplies');
    this.lastPanelRenderAt = 0;
    this.activeTab = 'inventory';
    this.button.addEventListener('click', () => this.open());
    this.closeButton.addEventListener('click', () => this.close());
    this.panel.addEventListener('click', event => { if (event.target === this.panel) this.close(); });
    this.body.addEventListener('click', event => {
      const tabButton = event.target.closest('button[data-ui-tab]');
      if (!tabButton) return;
      this.activeTab = tabButton.dataset.uiTab || 'inventory';
      this.render();
    });
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
    if (!result?.ok) this.notifications.show(result?.reason ?? 'アイテムを使用できません。');
    else this.persist?.({ notify: false });
    this.render();
  }

  useLureTarget(kind, id) {
    let result = null;
    this.store.transaction(state => { result = this.roadsideSupplySystem.useLureTarget?.(state, { kind, id }); }, `roadside:lure-${kind}`);
    if (!result?.ok) this.notifications.show(result?.reason ?? '誘導信号を使用できません。');
    else this.persist?.({ notify: false });
    this.render();
  }

  craft(recipeKey) {
    let result = null;
    this.store.transaction(state => { result = this.roadsideSupplySystem.craft?.(state, recipeKey); }, `roadside:craft-${recipeKey}`);
    if (!result?.ok) this.notifications.show(result?.reason ?? '製作できません。');
    else this.persist?.({ notify: false });
    this.render();
  }

  removeMine(mineId) {
    let result = null;
    this.store.transaction(state => { result = this.roadsideSupplySystem.removeMine?.(state, mineId); }, 'roadside:remove-mine');
    if (!result?.ok) this.notifications.show(result?.reason ?? '撤去できません。');
    else this.persist?.({ notify: false });
    this.render();
  }

  update(view = this.store.uiSnapshot()) {
    const state = view ?? this.store.uiSnapshot();
    const supplies = ensureRoadsideSupplyState(state);
    const total = Object.values(supplies.inventory ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    const materialTotal = Object.values(supplies.materials ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    this.button.textContent = total + materialTotal > 0 ? `ITEMS // 物資 ${countText(total + materialTotal)}` : 'ITEMS // 物資';
    this.button.title = activeSummary(state);
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

    const inventoryHtml = Object.entries(ROADSIDE_USE_DEFINITIONS).map(([key, definition]) => {
      const count = Math.max(0, Math.floor(Number(inventory[key]) || 0));
      const squadOnly = key === 'marchBanner' || key === 'smokeScreen';
      const targetOnly = ['remoteBarrage', 'airSupport', 'areaSuppression'].includes(key);
      const lureTargetOnly = key === 'lureSignal';
      const disabled = count <= 0 || squadOnly || targetOnly || lureTargetOnly ? 'disabled' : '';
      const label = definition.squadType
        ? `${definition.searchRangeMeters}m以内の対象へ一時部隊を出撃`
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
                    : '消耗品を使用';
      const buttonText = squadOnly ? `部隊選択で使用 ×${count}` : targetOnly ? `対象選択で使用 ×${count}` : lureTargetOnly ? `誘導先選択で使用 ×${count}` : `使用 ×${count}`;
      return `<div class="supplyInventoryRow${squadOnly || targetOnly || lureTargetOnly ? ' is-squad-only' : ''}">
        <div><strong>${definition.name}</strong><span>${label}</span></div>
        <button type="button" data-use-roadside="${key}" ${disabled}>${buttonText}</button>
      </div>`;
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
        ? '製作可能です。'
        : !unlocked
          ? `文明Lv.${recipe.level}で解禁されます。`
          : !workshopReady
            ? '戦術工房が必要です。'
            : missing
              ? `不足：${missing}`
              : status.reason ?? '製作できません。';
      return { key, ready, unlocked, html: `<div class="supplyInventoryRow tacticalRecipe${ready ? ' is-ready' : unlocked ? '' : ' is-locked'}"><div><strong>${recipe.name}</strong><span>${reason}</span><small>資材 ${resourceCost}</small><small>素材 ${materialCost}</small></div><button type="button" data-craft-roadside="${key}" ${ready ? '' : 'disabled'}>製作</button></div>` };
    });
    const craftableHtml = recipes.filter(recipe => recipe.ready).map(recipe => recipe.html).join('') || '<p class="emptyText">現在すぐ製作できるアイテムはありません。</p>';
    const unavailableHtml = recipes.filter(recipe => !recipe.ready).map(recipe => recipe.html).join('') || '<p class="emptyText">製作待ちのレシピはありません。</p>';

    const activeTab = ['inventory', 'lure', 'workshop', 'materials', 'nearby'].includes(this.activeTab) ? this.activeTab : 'inventory';
    this.body.innerHTML = `
      <div class="uiTabBar" role="tablist" aria-label="アイテム画面の表示切替">
        ${tabButton('inventory', '所持品', activeTab)}
        ${tabButton('lure', '誘導', activeTab)}
        ${tabButton('workshop', '製作', activeTab)}
        ${tabButton('materials', '素材', activeTab)}
        ${tabButton('nearby', '周辺', activeTab)}
      </div>
      <section class="overviewHero suppliesHero">
        <div><small>消耗品</small><strong>${Object.values(inventory).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)}</strong><span>所持数合計</span></div>
        <div><small>戦術素材</small><strong>${Object.values(supplies.materials ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)}</strong><span>レア製作素材</span></div>
        <div><small>周辺物資</small><strong>${active.length}</strong><span>本日取得 ${supplies.daily?.collectedCount ?? 0}</span></div>
      </section>
      ${tabPanel('inventory', activeTab, `<h2>消耗品インベントリ</h2><p class="sectionNote">その場で使うもの、対象選択で使うもの、部隊選択で使うものを分けて表示します。</p><div class="supplyInventoryList compactInventory">${inventoryHtml}</div>`)}
      ${tabPanel('lure', activeTab, `<h2>誘導信号の誘導先</h2><p class="sectionNote">設置済み地雷または防衛密集地点へ敵を誘導します。地雷に誘導した敵が踏むと威力が上がります。</p><div class="supplyInventoryList">${lureHtml}</div>`)}
      ${tabPanel('workshop', activeTab, `<h2>戦術工房</h2><p class="sectionNote">${workshopReady ? '高級資材と戦術素材から強力な消耗品を製作できます。' : '文明Lv.4以降で戦術工房を建設すると製作できます。'}</p><h3>製作可能</h3><div class="supplyInventoryList">${craftableHtml}</div><details class="completedRequirements workshopUnavailable"><summary>素材不足・未解禁レシピ</summary><div class="supplyInventoryList">${unavailableHtml}</div></details>`)}
      ${tabPanel('materials', activeTab, `<h2>戦術素材</h2><p class="sectionNote">高レア物資から入手し、高コスト戦術アイテムの製作に使います。</p><div class="supplyInventoryList compactInventory">${materialHtml}</div>`)}
      ${tabPanel('nearby', activeTab, `<h2>道端物資</h2><p class="sectionNote">道路沿いの資源箱は近づくと自動回収します。表示数は軽量化のため制限されています。</p><div class="supplyStatusGrid"><span><small>周辺</small><strong>${active.length}</strong></span><span><small>本日取得</small><strong>${supplies.daily?.collectedCount ?? 0}</strong></span><span><small>レア取得</small><strong>${supplies.daily?.rareCollectedCount ?? 0}</strong></span></div><ul class="supplyNearbyList">${nearby}</ul>`)}
    `;
    for (const button of this.body.querySelectorAll('[data-use-roadside]')) {
      if (button.disabled) continue;
      button.addEventListener('click', () => this.useItem(button.dataset.useRoadside));
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
