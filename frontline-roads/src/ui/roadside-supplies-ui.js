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
  if (!supplies.length) return 'No nearby roadside supplies';
  const resources = supplies.filter(item => item.kind === 'resource').length;
  const items = supplies.length - resources;
  return [`Nearby ${supplies.length}`, resources ? `Resources ${resources}` : null, items ? `Gear ${items}` : null].filter(Boolean).join(' / ');
}

function bundleText(bundle = {}) {
  const values = Object.entries(bundle).filter(([, value]) => Number(value) > 0);
  return values.length ? values.map(([key, value]) => `${RESOURCE_LABELS[key] ?? key} ${value}`).join(' · ') : 'None';
}

function materialText(materials = {}) {
  const values = Object.entries(materials).filter(([, value]) => Number(value) > 0);
  return values.length ? values.map(([key, value]) => `${TACTICAL_MATERIAL_DEFINITIONS[key]?.name ?? key} ${value}`).join(' · ') : 'None';
}

function shortageText(resourceMissing = {}, materialMissing = {}) {
  const resources = Object.entries(resourceMissing)
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${RESOURCE_LABELS[key] ?? key} a and ${Math.floor(Number(value) || 0)}`);
  const materials = Object.entries(materialMissing)
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${TACTICAL_MATERIAL_DEFINITIONS[key]?.name ?? key} a and ${Math.floor(Number(value) || 0)}`);
  return [...resources, ...materials].join(' · ');
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

  localize(text = '') { return this.i18n?.copy?.(text) ?? text; }

  open() {
    this.store.transaction(state => { this.roadsideSupplySystem.refresh(state, true); }, 'roadside:manual-refresh');
    this.render();
    setVisible(this.panel, true);
  }

  close() { setVisible(this.panel, false); }

  useItem(key) {
    let result = null;
    this.store.transaction(state => { result = this.roadsideSupplySystem.use(state, key); }, `roadside:use-${key}`);
    if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Item cannot be used.'));
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
    if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Temporary squad cannot be dispatched.'));
    else this.persist?.({ notify: false });
    this.render();
  }

  useLureTarget(kind, id) {
    let result = null;
    this.store.transaction(state => { result = this.roadsideSupplySystem.useLureTarget?.(state, { kind, id }); }, `roadside:lure-${kind}`);
    if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Guidance signal cannot be used.'));
    else this.persist?.({ notify: false });
    this.render();
  }

  craft(recipeKey) {
    let result = null;
    this.store.transaction(state => { result = this.roadsideSupplySystem.craft?.(state, recipeKey); }, `roadside:craft-${recipeKey}`);
    if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Cannot craft.'));
    else this.persist?.({ notify: false });
    this.render();
  }

  removeMine(mineId) {
    let result = null;
    this.store.transaction(state => { result = this.roadsideSupplySystem.removeMine?.(state, mineId); }, 'roadside:remove-mine');
    if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Cannot dismantle.'));
    else this.persist?.({ notify: false });
    this.render();
  }

  update(view = this.store.uiSnapshot()) {
    const state = view ?? this.store.uiSnapshot();
    const supplies = ensureRoadsideSupplyState(state);
    const total = Object.values(supplies.inventory ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    const materialTotal = Object.values(supplies.materials ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    this.button.textContent = total + materialTotal > 0 ? this.localize(`ITEMS ${countText(total + materialTotal)}`) : this.localize('ITEMS');
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
      return `<li><strong>${presentation.name}<em>${presentation.rarity ?? item.rarity ?? 'common'}${gap ? ` · ${gap}` : ''}</em></strong><span>${detail}</span></li>`;
    }).join('') || '<li><span>No visible roadside supplies near your current position.</span></li>';

    const deploymentKeys = Object.entries(ROADSIDE_USE_DEFINITIONS).filter(([, definition]) => definition.squadType).map(([key]) => key);
    const inventoryHtml = Object.entries(ROADSIDE_USE_DEFINITIONS).map(([key, definition]) => {
      const count = Math.max(0, Math.floor(Number(inventory[key]) || 0));
      const squadOnly = key === 'marchBanner' || key === 'smokeScreen';
      const targetOnly = ['remoteBarrage', 'airSupport', 'areaSuppression'].includes(key);
      const lureTargetOnly = key === 'lureSignal';
      const deploymentCall = Boolean(definition.squadType);
      const disabled = count <= 0 || squadOnly || targetOnly || lureTargetOnly || deploymentCall ? 'disabled' : '';
      const label = deploymentCall
        ? `${definition.searchRangeMeters}m range: choose a target and send a temporary squad`
        : key === 'sweepSignal'
          ? `current position ${definition.radiusMeters}m range: sweep normal enemies`
          : key === 'breachCharge'
            ? `current position ${definition.radiusMeters}m range: destroy one enemy base`
            : ['roadMine', 'directionalMine', 'armorBreakerMine'].includes(key)
              ? `Place on a road. No time limit; remains until triggered.`
              : key === 'lureSignal'
                ? `Choose a mine or dense defense point from the guidance target list below.`
                : targetOnly
                  ? 'Appears in the lower actions after selecting an enemy squad or enemy base.'
                  : squadOnly
                    ? 'Appears in the lower actions after selecting an allied squad.'
                    : 'Consumable that does not require a target.';
      const buttonText = deploymentCall ? `Choose target ×${count}` : squadOnly ? `Use after selecting squad ×${count}` : targetOnly ? `Use after selecting target ×${count}` : lureTargetOnly ? `Choose guidance target ×${count}` : `Use now ×${count}`;
      const action = deploymentCall
        ? `<button type="button" data-open-deployment="${key}" ${count <= 0 ? 'disabled': ''}>${buttonText}</button>`
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
        const route = target.routeMeters != null ? `Route ${target.routeMeters}m` : 'No route';
        const disabled = count <= 0 || !target.available ? 'disabled' : '';
        return `<div class="supplyInventoryRow deploymentTargetRow"><div><strong>${target.name}<em>${target.distanceMeters}m · HP ${hpPercent}%</em></strong><span>${route}${target.available ? '' : ' · Not connected'}</span></div><button type="button" data-deploy-roadside="${key}" data-deploy-kind="${target.kind}" data-deploy-id="${target.id}" ${disabled}>Dispatch to this target ×${count}</button></div>`;
      }).join('') || `<p class="emptyText">${count > 0 ?`From current position, ${definition.searchRangeMeters}m no valid dispatch target is in range.` : `${definition.name} not owned.`}</p>`;
      return `<section class="deploymentCallSection" data-deployment-section="${key}"><h3>${definition.name}</h3><p class="sectionNote">${definition.squadType === 'skirmisher' ? 'The skirmisher squad moves toward the selected enemy squad.' : `${definition.targetKind === 'enemyBase' ? 'The selected enemy base' : 'The selected enemy'} receives a temporary squad.`} Only one temporary squad can be active at once.</p><div class="supplyInventoryList">${targetRows}</div></section>`;
    }).join('');

    const materialHtml = Object.entries(TACTICAL_MATERIAL_DEFINITIONS).map(([key, definition]) => {
      const count = Math.max(0, Math.floor(Number(supplies.materials?.[key]) || 0));
      if (count <= 0) return '';
      return `<div class="supplyInventoryRow is-material"><div><strong>${definition.name}</strong><span>${definition.rarity}Material</span></div><em>×${count}</em></div>`;
    }).join('') || '<p class="emptyText">No tactical materials yet. Obtain them from rare or better roadside supplies.</p>';

    const lureTargets = this.roadsideSupplySystem.lureTargets?.(state) ?? [];
    const lureCount = Math.max(0, Math.floor(Number(inventory.lureSignal) || 0));
    const lureHtml = lureTargets.map(target => {
      const gap = distanceText(state, target);
      const kindText = target.kind === 'mine' ? `Placed mine${target.itemKey ? ` · ${ROADSIDE_USE_DEFINITIONS[target.itemKey]?.name ?? target.itemKey}` : ''}` : `Dense defense point · ${target.count ?? 0}`;
      const remove = target.kind === 'mine' ? `<button type="button" class="danger" data-remove-mine="${target.id}">Remove</button>` : '';
      return `<div class="supplyInventoryRow lureTargetRow"><div><strong>${target.name}<em>${gap}</em></strong><span>${kindText}</span></div><div class="rowActions"><button type="button" data-lure-kind="${target.kind}" data-lure-id="${target.id}" ${lureCount <= 0 ? 'disabled': ''}>Guidance signal ×${lureCount}</button>${remove}</div></div>`;
    }).join('') || '<p class="emptyText">No placed mine or dense defense point is available as a guidance target.</p>';

    const workshopReady = (state.civilization?.buildings ?? []).some(building => building.type === TACTICAL_WORKSHOP_BUILDING && building.hp > 0);
    const recipes = Object.entries(TACTICAL_RECIPES).map(([key, recipe]) => {
      const status = tacticalRecipeStatus(state, key);
      const resourceCost = bundleText(recipe.resources);
      const materialCost = materialText(recipe.materials);
      const missing = shortageText(status.resourceMissing, status.materialMissing);
      const unlocked = (state.civilization?.level ?? 0) >= recipe.level;
      const ready = status.ok;
      const reason = ready
        ? 'Required resources are available.'
        : !unlocked
          ? `Civ Lv.${recipe.level} required.`
          : !workshopReady
            ? 'Build a Tactical Workshop to craft this.'
            : missing
              ? `Missing: ${missing}`
              : status.reason ?? 'Cannot craft.';
      return { key, ready, unlocked, html: `<div class="supplyInventoryRow tacticalRecipe${ready ? ' is-ready' : unlocked ? '' : ' is-locked'}"><div><strong>${recipe.name}</strong><span>${reason}</span><small>Resources ${resourceCost}</small><small>Material ${materialCost}</small></div><button type="button" data-craft-roadside="${key}" ${ready ? '' : 'disabled'}>Craft</button></div>` };
    });
    const craftableHtml = recipes.filter(recipe => recipe.ready).map(recipe => recipe.html).join('') || '<p class="emptyText">No item can be crafted right now.</p>';
    const unavailableHtml = recipes.filter(recipe => !recipe.ready).map(recipe => recipe.html).join('') || '<p class="emptyText">No locked or resource-short recipes.</p>';

    const activeTab = ['inventory', 'deployment', 'lure', 'workshop', 'materials', 'nearby'].includes(this.activeTab) ? this.activeTab : 'inventory';
    this.body.innerHTML = this.localize(`
      <div class="uiTabBar" role="tablist" aria-label="Items tab switcher">
        ${tabButton('inventory', 'Inventory', activeTab)}
        ${tabButton('deployment', 'Dispatch', activeTab)}
        ${tabButton('lure', 'Guide', activeTab)}
        ${tabButton('workshop', 'Craft', activeTab)}
        ${tabButton('materials', 'Material', activeTab)}
        ${tabButton('nearby', 'Nearby', activeTab)}
      </div>
      <section class="overviewHero suppliesHero">
        <div><small>Consumables</small><strong>${Object.values(inventory).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)}</strong><span>Total items</span></div>
        <div><small>Tactical Materials</small><strong>${Object.values(supplies.materials ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)}</strong><span>Crafting materials</span></div>
        <div><small>Nearby Supplies</small><strong>${active.length}</strong><span>Collected ${supplies.daily?.collectedCount ?? 0}</span></div>
      </section>
      ${tabPanel('inventory', activeTab, `<h2>Consumable Inventory</h2><p class="sectionNote">Dispatch tickets are used from the Dispatch tab after selecting a target. Using one sends a temporary squad to that target.</p><div class="supplyInventoryList compactInventory">${inventoryHtml}</div>`)}
      ${tabPanel('deployment', activeTab, `<h2>Dispatch Ticket Targets</h2><p class="sectionNote">Choose targets here for Assault, Skirmisher, and Siege tickets. Each target shows distance, route, and HP.</p>${deploymentHtml}`)}
      ${tabPanel('lure', activeTab, `<h2>Guidance Signal Targets</h2><p class="sectionNote">For a limited time, pulls enemy targets toward placed mines or dense defense points. Enemies guided onto mines take heavy damage.</p><div class="supplyInventoryList">${lureHtml}</div>`)}
      ${tabPanel('workshop', activeTab, `<h2>Tactical Workshop</h2><p class="sectionNote">${workshopReady ? 'Use resources and tactical materials to craft mines, guidance signals, remote support, and dispatch tickets.': 'Civ Lv.4and later with Tactical Workshop build and, this of screen with Craft with.'}</p><h3>Craftable</h3><div class="supplyInventoryList">${craftableHtml}</div><details class="completedRequirements workshopUnavailable"><summary>Missing materials / Locked recipes</summary><div class="supplyInventoryList">${unavailableHtml}</div></details>`)}
      ${tabPanel('materials', activeTab, `<h2>Tactical Materials</h2><p class="sectionNote">Obtained from rare or better roadside supplies and used to craft tactical items.</p><div class="supplyInventoryList compactInventory">${materialHtml}</div>`)}
      ${tabPanel('nearby', activeTab, `<h2>Roadside Supplies</h2><p class="sectionNote">Resource crates along roads are collected automatically when approached. Resources above storage capacity are not obtained.</p><div class="supplyStatusGrid"><span><small>Nearby</small><strong>${active.length}</strong></span><span><small>Collected</small><strong>${supplies.daily?.collectedCount ?? 0}</strong></span><span><small>Rare collected</small><strong>${supplies.daily?.rareCollectedCount ?? 0}</strong></span></div><ul class="supplyNearbyList">${nearby}</ul>`)}
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
