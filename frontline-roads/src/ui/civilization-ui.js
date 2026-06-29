import {
  CIVILIZATIONS, CIVILIZATION_PROJECTS, DEFENSE_LINES, PRODUCTION_RECIPES,
  RESOURCE_KEYS, RESOURCE_LABELS, SETTLEMENT_BUILDINGS, MAX_CIVILIZATION_LEVEL
} from '../civilization/data.js';
import { bundleText, currentCivilization, hasBundle } from '../civilization/inventory-system.js';
import { evaluateProject, projectContributionReserve, safeProjectContributionAmount } from '../civilization/progression-system.js';
import { bindDismissibleModal, queryRequired, setVisible } from './dom.js';
import { usedSettlementSlots, settlementSlotLimit, isStorageBuildingType } from '../civilization/settlement-system.js';
import { baseLimitForCivilization } from '../base/player-bases.js';
import { fieldBaseLimitForCivilization, fieldBaseSlotsUsed } from '../base/field-bases.js';
import { diagnoseFieldBaseNetwork } from '../base/field-base-system.js';
import {
  FRIENDLY_SQUAD_DEFINITIONS, FRIENDLY_SQUAD_TYPES, friendlyGlobalCommandStatus, friendlySquadCapacityForBase
} from '../combat/friendly-force-system.js';

function formatDuration(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours) return `${hours}time${minutes ? `${minutes} min` : ''}`;
  if (minutes) return `${minutes} min${secs ? `${secs} sec` : ''}`;
  return `${secs} sec`;
}

function limitText(value) { return Number.isFinite(value) ? String(value) : 'No limit'; }

function resourceAmountParts(state, key) {
  const stored = Math.floor(state.inventory.resources[key] ?? 0);
  const category = RESOURCE_CATEGORY_BY_KEY[key];
  const capacity = Math.floor(state.inventory.capacity?.[category] ?? 0);
  return { stored, capacity };
}

function buildingBuildStatus(state, type) {
  const definition = SETTLEMENT_BUILDINGS[type];
  if (!definition) return { ok: false, label: 'Undefined', reason: 'Unknown facility.' };
  if (definition.level > (state.civilization?.level ?? 0)) return { ok: false, label: 'Locked', reason: `Civ Lv.${definition.level} with Unlocks` };
  const existing = state.civilization.buildings.filter(building => building.type === type).length;
  if (definition.limit && existing >= definition.limit) return { ok: false, label: 'Limit', reason: 'Build limit reached.' };
  const sameStorageSlot = isStorageBuildingType(type) && existing > 0;
  if (usedSettlementSlots(state) >= settlementSlotLimit(state) && !sameStorageSlot) return { ok: false, label: 'No slot', reason: 'No settlement building slot available.' };
  if (!hasBundle(state, definition.cost)) return { ok: false, label: 'Resources short', reason: `Missing: ${bundleText(definition.cost)}` };
  return { ok: true, label: 'Build', reason: 'Can build.' };
}

function recipeSummaryText(recipe) {
  const input = bundleText(recipe.input);
  const output = bundleText(recipe.output);
  const projectNote = recipe.projectDelivery ? ' · delivered to development plan first' : '';
  return `Input ${input} · Output ${output} · ${formatDuration(recipe.seconds)}${projectNote}`;
}

const PROJECT_STATUS_LABELS = Object.freeze({
  AVAILABLE: 'Preparing', CONTRIBUTING: 'Delivering', READY: 'Ready to build', BUILDING: 'Building', PAUSED: 'Paused'
});

function projectStatusLabel(status) { return PROJECT_STATUS_LABELS[status] ?? 'Preparing'; }

function checkProgressText(check) {
  if (check.key === 'cityHpStreak') return `${formatDuration(check.current)}/${formatDuration(check.required)}`;
  return `${Math.floor(check.current)}/${Math.floor(check.required)}`;
}

function tabButton(id, label, active) {
  return `<button type="button" data-ui-tab="${id}" class="${active === id ? 'active' : ''}">${label}</button>`;
}

function tabPanel(id, active, html) {
  return `<section class="uiTabPanel ${active === id ? 'active' : ''}" data-panel="${id}">${html}</section>`;
}

const RESOURCE_CATEGORIES = Object.freeze([
  ['base', 'Basic materials', ['wood', 'stone', 'fiber']],
  ['processed', 'Processed materials', ['timber', 'rope', 'cutStone', 'charcoal']],
  ['ore', 'Ore', ['copperOre', 'tinOre', 'ironOre']],
  ['metal', 'Metals / Parts', ['copperIngot', 'tinIngot', 'bronzeIngot', 'ironBloom', 'wroughtIron', 'steel', 'mechanism']]
]);
const RESOURCE_CATEGORY_BY_KEY = Object.freeze(Object.fromEntries(
  RESOURCE_CATEGORIES.flatMap(([category, , keys]) => keys.map(key => [key, category]))
));


const CAPACITY_CATEGORY_LABELS = Object.freeze({
  base: 'Basic materials', processed: 'Processed materials', ore: 'Ore', metal: 'Metals / Parts'
});

function storageCapacityBonus(definition, count = 1) {
  const result = {};
  const copies = Math.max(0, Math.floor(Number(count) || 0));
  for (let index = 0; index < copies; index += 1) {
    const multiplier = index === 0 ? 1 : 0.5;
    for (const [category, amount] of Object.entries(definition?.capacityBonus ?? {})) {
      result[category] = (result[category] ?? 0) + Math.floor(Number(amount) * multiplier);
    }
  }
  return result;
}

function storageBonusText(definition, count = 1) {
  const bonus = storageCapacityBonus(definition, count);
  const entries = Object.entries(bonus).filter(([, amount]) => amount > 0);
  return entries.length
    ? entries.map(([category, amount]) => `${CAPACITY_CATEGORY_LABELS[category] ?? category} +${amount}`).join(' · ')
    : 'No storage capacity increase';
}

function storageGroups(state) {
  const groups = new Map();
  for (const building of state.civilization?.buildings ?? []) {
    const definition = SETTLEMENT_BUILDINGS[building.type];
    if (!definition?.capacityBonus) continue;
    if (!groups.has(building.type)) groups.set(building.type, { type: building.type, definition, buildings: [] });
    groups.get(building.type).buildings.push(building);
  }
  return [...groups.values()].sort((a, b) => a.definition.level - b.definition.level || String(a.type).localeCompare(String(b.type)));
}

function storageSummaryMarkup(state) {
  const groups = storageGroups(state);
  if (!groups.length) return '<p class="emptyText">No storage facilities built.</p>';
  return `<div class="storageEffectGrid">${groups.map(group => {
    const count = group.buildings.length;
    const damaged = group.buildings.filter(building => building.hp < building.maxHp).length;
    return `<article class="storageEffectCard"><header><strong>${group.definition.name}</strong><small>Active ${count} · 1 building slot · ${damaged ? `damaged ${damaged}`: 'all active'}</small></header><p>${storageBonusText(group.definition, count)}</p></article>`;
  }).join('')}</div>`;
}

function storageActionButtons(group) {
  const damaged = group.buildings.find(building => building.hp < building.maxHp);
  const newest = [...group.buildings].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))[0];
  return `<div class="buttonRow">${damaged ? `<button data-action="repair-building" data-building-id="${damaged.id}">damaged1 Repair</button>` : ''}<button data-action="demolish-building" data-building-id="${newest?.id ?? ''}">1 Dismantle</button></div>`;
}

function resourceCategorySections(state) {
  return RESOURCE_CATEGORIES.map(([, label, keys]) => {
    const rows = keys
      .filter(key => (state.inventory.resources[key] ?? 0) > 0)
      .map(key => {
        const { stored, capacity } = resourceAmountParts(state, key);
        return `<div class="resourceRow compact"><span>${RESOURCE_LABELS[key]}</span><strong>${stored}/${capacity}</strong></div>`;
      }).join('') || '<p class="emptyText">resourcesNone</p>';
    return `<details class="compactDisclosure resourceCategory" open><summary>${label}</summary><div class="resourceGrid">${rows}</div></details>`;
  }).join('');
}


const DEFENSE_LINE_LABELS = Object.freeze({
  barrier: 'Wall', single: 'Single-target attack', area: 'Area attack', slow: 'Slow support', repair: 'Auto repair',
  medical: 'Area healing', fieldBarracks: 'Frontline Barracks', survey: 'Road surveying', gate: 'Gate'
});

function defenseTierCatalog(state) {
  const level = Math.max(0, Math.min(MAX_CIVILIZATION_LEVEL, Number(state.civilization?.level) || 0));
  return Object.entries(DEFENSE_LINE_LABELS).map(([line, label]) => {
    const minimum = line === 'gate' ? 2 : ['survey', 'medical', 'fieldBarracks'].includes(line) ? 1 : 0;
    if (level < minimum) {
      return `<div class="defenseTierCard is-locked"><small>${label}</small><strong>Civ Lv.${minimum} with Unlocks</strong><span>Currently unavailable</span></div>`;
    }
    let tier = level;
    while (tier >= minimum && !DEFENSE_LINES[line]?.[tier]) tier -= 1;
    const current = DEFENSE_LINES[line]?.[tier];
    const next = tier < MAX_CIVILIZATION_LEVEL ? DEFENSE_LINES[line]?.[tier + 1] : null;
    return `<div class="defenseTierCard"><small>${label} · Upgrade cap Tier ${tier}</small><strong>${current?.name ?? 'undefined'}</strong><span>${next ? `Next: Civ Lv.${tier + 1} with ${next.name}` : 'Final tier unlocked'}</span></div>`;
  }).join('');
}


function friendlyUnitCatalog(state) {
  const level = Math.max(0, Math.min(MAX_CIVILIZATION_LEVEL, Number(state.civilization?.level) || 0));
  return FRIENDLY_SQUAD_TYPES.map(type => {
    const definition = FRIENDLY_SQUAD_DEFINITIONS[type];
    const unlocked = level >= definition.unlockLevel;
    const bases = definition.allowedBaseKinds.includes('FIELD') ? 'Major · Simple Base' : 'Major Base of only';
    return `<div class="defenseTierCard ${unlocked ? '' : 'is-locked'}"><small>${definition.role} · ${bases}</small><strong>${definition.name}</strong><span>${unlocked ? definition.description : `Civ Lv.${definition.unlockLevel} with Unlocks`}</span></div>`;
  }).join('');
}

function checkLabel(check) {
  const labels = {
    totalKills: 'Enemy kills', totalCampsCaptured: 'Enemy bases destroyed', totalRepairHpPaid: 'Resource Repair',
    totalProduced: 'Processed materials of Production', selfProducedBronze: 'self-producedBronze ingot', selfProducedWroughtIron: 'self-producedWrought iron',
    perfectWaveStreak: 'completeDefensestreak', activeFieldBases: 'Active in progress of Simple Base',
    copperCampsCaptured: 'Copper camps captured', tinCampsCaptured: 'Tin camps captured',
    ironCampsCaptured: 'Iron ore camp captured', siegeCaptainsDefeated: 'Siege captaindefeat',
    cityHpStreak: 'city HP', recoveredArtifacts: 'fieldRecovery special item', barrier0: 'Log Palisade', single0: 'Stone Thrower',
    otherDefense0: 'the of defense facility', upgradedDefenses: 'defense facility',
    upgradedDefenseKinds: 'facility of types', barrier2: 'Stone Wall', gate2: 'Stone Gate', gate3: 'Bronze Gate',
    bronzeDefenses: 'bronzefacility', bronzeDefenseKinds: 'bronzefacility of types', wallAtLeast2: 'Stone Wallor more',
    ironDefenses: 'iron agefacility', ironDefenseKinds: 'iron agefacility of types', gate4: 'Iron Gate',
    steelDefenses: 'steelfacility', steelDefenseKinds: 'steelfacility of types', gate5: 'Steel Gate',
    mechanismDefenses: 'machinefacility', mechanismDefenseKinds: 'machinefacility of types', gate6: 'Mechanized Gate',
    selfProducedSteel: 'self-producedSteel', selfProducedMechanism: 'self-producedMechanism parts',
    generation5CommandersDefeated: 'Steel captaindefeat', generation6CommandersDefeated: 'Line commander defeated',
    machineWorksCaptured: 'Machine works captured'
  };
  return RESOURCE_LABELS[check.key] ?? SETTLEMENT_BUILDINGS[check.key]?.name ?? labels[check.key] ?? check.key;
}

const DEFENSE_BUILDING_CHECKS = new Set([
  'barrier0', 'single0', 'otherDefense0', 'upgradedDefenses', 'upgradedDefenseKinds',
  'barrier2', 'gate2', 'gate3', 'bronzeDefenses', 'bronzeDefenseKinds', 'wallAtLeast2',
  'ironDefenses', 'ironDefenseKinds', 'gate4', 'steelDefenses', 'steelDefenseKinds', 'gate5',
  'mechanismDefenses', 'mechanismDefenseKinds', 'gate6'
]);

export function projectCheckGuidance(check, state) {
  if (!check || check.complete) return '';
  if (check.kind === 'artifact') return 'Enemy base destroyed, remaining recovery item field recovery or recovery squad with base to bring back.';
  if (check.kind === 'building') {
    if (SETTLEMENT_BUILDINGS[check.key]) return '"Civilization"screen of Settlement facilities from build.slot Missing Not neededfacilities Dismantle with.';
    if (DEFENSE_BUILDING_CHECKS.has(check.key)) return 'MAP with targetfacility Build , existingfacility select  requiredTier to Upgrade .Gate Wall select  convert .';
    return 'MAPor "Civilization"screen from requiredFacilities Build .';
  }
  const guidance = {
    totalKills: 'defense dispatch with enemy squad defeat.',
    totalCampsCaptured: 'Select enemy base  squad , BaseHP 0 at  .',
    totalRepairHpPaid: 'damaged defense facility select, Resource manual repair.',
    totalProduced: 'matchingSettlement facilities build, production Execute.',
    selfProducedBronze: 'Copper Furnace · Tin Furnace · Trial Bronze Furnaceor Bronze Workshop, min of facilities with bronze Production.',
    selfProducedWroughtIron: 'Bloomery with Iron bloom produce, Forge with Wrought iron to process .',
    selfProducedSteel: 'Steelworks with Wrought iron and Charcoal from Steel Production .Enemy base of reward only in is not added.',
    selfProducedMechanism: 'Mechanism Workshop with Steel · Timber · Rope from Mechanism parts Production .Enemy base of reward only in is not added.',
    perfectWaveStreak: 'enemy city to at normalwave and 1. and streak 0 for reorganization.',
    activeFieldBases: 'BASES from roadon to Simple Base Place .existing base and Buildrange non-overlappingpoint choose.',
    copperCampsCaptured: '"Cu" and highlightedcopper ore camp destroy.',
    tinCampsCaptured: '"Sn" and highlightedtin ore camp destroy.',
    ironCampsCaptured: '"Fe" and highlightediron ore camp destroy.',
    siegeCaptainsDefeated: 'Bronze Ageand later of Siege Squad at appearingSiege captain defeat .',
    generation5CommandersDefeated: 'steel generation of wave at appearingSteel captain defeat .',
    generation6CommandersDefeated: 'wave at appearingline commander defeat.',
    machineWorksCaptured: '"Mc" and highlightedMachine works destroy.',
    cityHpStreak: `city HP ${Math.floor(Number(check.threshold) || 70)}or more at. and 0 from.`
  };
  return guidance[check.key] ?? 'requirements at · build · Production.';
}

export class CivilizationUi {
  constructor({ store, civilizationSystem, notifications, persist, i18n = null }) {
    this.store = store;
    this.system = civilizationSystem;
    this.notifications = notifications;
    this.persist = persist;
    this.i18n = i18n;
    this.panel = queryRequired('#civilizationPanel');
    this.body = queryRequired('#civilizationBody');
    this.resourceSummary = queryRequired('#resourceSummary');
    this.lastPanelRenderAt = 0;
    this.activeTab = 'progress';
    queryRequired('#civilizationButton').addEventListener('click', () => this.open());
    queryRequired('#closeCivilization').addEventListener('click', () => this.close());
    bindDismissibleModal(this.panel, () => this.close());
    this.body.addEventListener('click', event => this.handleAction(event));
  }

  localize(text = '') { return this.i18n?.copy?.(text) ?? text; }

  open() {
    this.render();
    setVisible(this.panel, true);
  }

  close() {
    setVisible(this.panel, false);
  }

  transaction(action, reason) {
    let result;
    this.store.transaction(state => { result = action(state); }, reason, { emit: true, validate: true });
    if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Action unavailable.'));
    else this.persist?.();
    this.render();
    return result;
  }

  handleAction(event) {
    const tabButton = event.target.closest('button[data-ui-tab]');
    if (tabButton?.dataset?.uiTab) {
      this.activeTab = tabButton.dataset.uiTab || 'progress';
      this.render();
      return;
    }
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, resource, type, buildingId, recipeId, quantity } = button.dataset;
    if (action === 'contribute-safe-all') {
      const result = this.transaction(state => {
        let total = 0;
        const project = state.civilization?.project;
        const definition = project ? CIVILIZATION_PROJECTS[project.targetLevel] : null;
        for (const key of Object.keys(definition?.contributions ?? {})) {
          const amount = safeProjectContributionAmount(state, key);
          if (amount <= 0) continue;
          const contributed = this.system.progression.contribute(state, key, amount);
          if (contributed?.ok) total += contributed.amount;
        }
        return total > 0 ? { ok: true, amount: total } : { ok: false, reason: 'No resources can be delivered while keeping reserves.' };
      }, 'civilization:contribute-safe-all');
      if (result?.ok) this.notifications.show(this.localize(`Delivered a reserve-safe total of ${result.amount} resources.`));
    } else if (action === 'contribute-safe-basic') {
      const protectedKeys = new Set(['bronzeIngot', 'wroughtIron', 'steel', 'mechanism']);
      const result = this.transaction(state => {
        let total = 0;
        const project = state.civilization?.project;
        const definition = project ? CIVILIZATION_PROJECTS[project.targetLevel] : null;
        for (const key of Object.keys(definition?.contributions ?? {})) {
          if (protectedKeys.has(key)) continue;
          const amount = safeProjectContributionAmount(state, key);
          if (amount <= 0) continue;
          const contributed = this.system.progression.contribute(state, key, amount);
          if (contributed?.ok) total += contributed.amount;
        }
        return total > 0 ? { ok: true, amount: total } : { ok: false, reason: 'No basic resources can be delivered while keeping reserves.' };
      }, 'civilization:contribute-safe-basic');
      if (result?.ok) this.notifications.show(this.localize(`Delivered basic resources only, total ${result.amount} resources.`));
    } else if (action === 'contribute-safe') {
      const result = this.transaction(state => this.system.progression.contributeSafely(state, resource), 'civilization:contribute-safe');
      if (result?.ok) this.notifications.show(this.localize(`${RESOURCE_LABELS[resource]} ${result.amount} delivered.`));
    } else if (action === 'contribute-all') {
      const result = this.transaction(state => this.system.progression.contribute(state, resource), 'civilization:contribute-all');
      if (result?.ok) this.notifications.show(this.localize(`${RESOURCE_LABELS[resource]} ${result.amount} delivered.`));
    } else if (action === 'withdraw') {
      this.transaction(state => this.system.progression.withdraw(state), 'civilization:withdraw');
    } else if (action === 'start-project') {
      this.transaction(state => this.system.progression.start(state), 'civilization:start-project');
    } else if (action === 'build-building') {
      const result = this.transaction(state => this.system.settlement.build(state, type), 'civilization:build');
      if (result?.ok) this.notifications.show(this.localize(`${SETTLEMENT_BUILDINGS[type].name} constructed.`));
    } else if (action === 'produce') {
      const result = this.transaction(state => {
        const requested = quantity === 'max'
          ? this.system.production.maximumProducible(state, buildingId, recipeId).quantity
          : Math.max(1, Number(quantity) || 1);
        if (requested <= 0) return this.system.production.maximumProducible(state, buildingId, recipeId);
        return this.system.production.enqueue(state, buildingId, recipeId, requested);
      }, 'civilization:produce');
      if (result?.ok) this.notifications.show(this.localize(`${PRODUCTION_RECIPES[recipeId].name} ${result.quantity} queued for production.`));
    } else if (action === 'repair-building') {
      this.transaction(state => this.system.settlement.repair(state, buildingId), 'civilization:repair-building');
    } else if (action === 'demolish-building') {
      this.transaction(state => this.system.settlement.demolish(state, buildingId), 'civilization:demolish-building');
    } else if (action === 'collect-output') {
      this.transaction(state => this.system.production.collectOutput(state, buildingId), 'civilization:collect-output');
    }
  }

  update(state = this.store.snapshot()) {
    this.updateSummary(state);
    if (!this.panel.hidden && Date.now() - this.lastPanelRenderAt >= 1000) this.render(state);
  }

  updateSummary(state = this.store.snapshot()) {
    const visibleResources = RESOURCE_KEYS.filter(key =>
      (state.inventory.resources[key] ?? 0) > 0
      || ['wood', 'stone', 'fiber'].includes(key)
    );
    this.resourceSummary.innerHTML = this.localize(visibleResources.map(key => {
      const { stored, capacity } = resourceAmountParts(state, key);
      return `<span class="resourceChip" data-resource="${key}"><small>${RESOURCE_LABELS[key]}</small><strong>${stored}</strong><em>Limit ${capacity}</em></span>`;
    }).join(''));
    this.resourceSummary.setAttribute(
      'aria-label',
      this.localize(visibleResources.map(key => {
        const { stored, capacity } = resourceAmountParts(state, key);
        return `${RESOURCE_LABELS[key]} ${stored}, Limit ${capacity}`;
      }).join(', '))
    );
  }

  render(state = this.store.snapshot()) {
    this.updateSummary(state);
    this.lastPanelRenderAt = Date.now();
    const civilization = currentCivilization(state);
    const project = state.civilization.project;
    const evaluation = evaluateProject(state);
    const resources = RESOURCE_KEYS
      .filter(key => (state.inventory.resources[key] ?? 0) > 0)
      .map(key => {
        const { stored, capacity } = resourceAmountParts(state, key);
        return `<div class="resourceRow"><span>${RESOURCE_LABELS[key]}</span><strong>${stored}/${capacity}</strong></div>`;
      }).join('') || '<p class="emptyText">No stored resources.</p>';

    let projectHtml = '<p class="emptyText">Maximum civilization reached.</p>';
    if (project) {
      const definition = CIVILIZATION_PROJECTS[project.targetLevel];
      const locked = ['BUILDING', 'PAUSED'].includes(project.status);
      const resourceChecks = evaluation.checks.filter(check => check.kind === 'resource');
      const otherChecks = evaluation.checks.filter(check => check.kind !== 'resource');
      const allChecks = [...resourceChecks, ...otherChecks];
      const completeCount = allChecks.filter(check => check.complete).length;
      const progressPercent = allChecks.length ? Math.floor((completeCount / allChecks.length) * 100) : 100;
      const contributionRow = check => {
        const key = check.key;
        const required = check.required;
        const current = project.contributions[key] ?? 0;
        const available = state.inventory.resources[key] ?? 0;
        const safeAmount = safeProjectContributionAmount(state, key);
        const reserve = projectContributionReserve(state, key);
        const gap = Math.max(0, required - current);
        const guidance = gap > 0
          ? `${RESOURCE_LABELS[key]} needs ${gap} more.${reserve ? `You can keep ${reserve} for defense and construction.` : 'You can deliver stored resources.'}`
          : 'Required amount delivered.';
        return `<div class="requirementRow ${check.complete ? 'complete' : 'missing'}"><span>${check.complete ? '✓' : 'Missing'} ${RESOURCE_LABELS[key]} ${current}/${required}${reserve ? `<small>Defense reserve ${reserve}</small>` : ''}<small>${guidance}</small></span><div class="contributionButtons"><button data-action="contribute-safe" data-resource="${key}" ${safeAmount <= 0 || locked ? 'disabled' : ''}>Keep reserves${safeAmount > 0 ? ` ${safeAmount}` : ''}</button><button data-action="contribute-all" data-resource="${key}" ${available <= 0 || locked ? 'disabled' : ''}>Deliver all</button></div></div>`;
      };
      const conditionRow = check => {
        const fieldDiagnostic = check.key === 'activeFieldBases' ? diagnoseFieldBaseNetwork(state, check.required) : null;
        const guidance = fieldDiagnostic?.guidance ?? projectCheckGuidance(check, state);
        return `<div class="conditionRow ${check.complete ? 'complete' : 'missing'}"><span>${check.complete ? '✓' : 'Missing'} ${checkLabel(check)}${guidance ? `<small>${guidance}</small>`: ''}</span><strong>${checkProgressText(check)}</strong></div>`;
      };
      const missingRows = [
        ...resourceChecks.filter(check => !check.complete).map(contributionRow),
        ...otherChecks.filter(check => !check.complete).map(conditionRow)
      ].join('') || '<div class="conditionRow complete"><span>✓ All current development requirements are complete.</span><strong>OK</strong></div>';
      const completedRows = [
        ...resourceChecks.filter(check => check.complete).map(contributionRow),
        ...otherChecks.filter(check => check.complete).map(conditionRow)
      ].join('') || '<p class="emptyText">No completed requirements yet.</p>';
      const remaining = Math.max(0, project.durationSec - (project.progressedSec ?? 0));
      projectHtml = `
        <h3>${CIVILIZATIONS[project.targetLevel].name} to  of Growth</h3>
        <p class="sectionNote">Status: ${projectStatusLabel(project.status)}${project.status === 'BUILDING' ? ` · remaining ${formatDuration(remaining)}` : ''}</p>
        <div class="civilizationProgressBox"><strong>${progressPercent}%</strong><span>${completeCount}/${allChecks.length} conditions complete</span></div>
        <div class="buttonRow">
          <button data-action="contribute-safe-basic" ${locked ? 'disabled' : ''}>Deliver only basic resources with reserves</button>
          <button data-action="contribute-safe-all" ${locked ? 'disabled' : ''}>Deliver shortages while keeping reserves</button>
        </div>
        <h4>Missing requirements</h4>
        <div class="requirementList missingFirst">${missingRows}</div>
        <details class="completedRequirements"><summary>Completed requirements ${completeCount}</summary><div class="requirementList">${completedRows}</div></details>
        <div class="buttonRow">
          <button data-action="withdraw" ${locked ? 'disabled' : ''}>Withdraw deliveries</button>
          <button class="primary" data-action="start-project" ${!evaluation.complete || project.status === 'BUILDING' ? 'disabled' : ''}>Start construction</button>
        </div>`;
    }

    const unlockedBuildings = Object.entries(SETTLEMENT_BUILDINGS)
      .filter(([, definition]) => definition.level <= state.civilization.level);
    const storageCatalog = unlockedBuildings
      .filter(([type]) => isStorageBuildingType(type))
      .map(([type, definition]) => {
        const count = state.civilization.buildings.filter(building => building.type === type).length;
        const status = buildingBuildStatus(state, type);
        return `<div class="catalogCard storageCatalogCard"><div><strong>${definition.name}</strong><p>${definition.description}</p><small>Owned ${count} · building slots with 1slot · Cost ${bundleText(definition.cost)}</small><small>Effect: ${storageBonusText(definition, Math.max(1, count || 1))}</small>${!status.ok ?`<small class="statusWarning">${status.reason}</small>` : ''}</div><button data-action="build-building" data-type="${type}" ${status.ok ? '' : 'disabled'}>${status.label}</button></div>`;
      }).join('') || '<p class="emptyText">Storage facilities are not unlocked yet.</p>';
    const productiveCatalog = unlockedBuildings
      .filter(([type]) => !isStorageBuildingType(type))
      .map(([type, definition]) => {
        const count = state.civilization.buildings.filter(building => building.type === type).length;
        const status = buildingBuildStatus(state, type);
        return `<div class="catalogCard"><div><strong>${definition.name}</strong><p>${definition.description}</p><small>Owned ${count} · Cost ${bundleText(definition.cost)}</small>${!status.ok ?`<small class="statusWarning">${status.reason}</small>` : ''}</div><button data-action="build-building" data-type="${type}" ${status.ok ? '' : 'disabled'}>${status.label}</button></div>`;
      }).join('') || '<p class="emptyText">Production facilities are not unlocked yet.</p>';
    const storageOperations = storageGroups(state).map(group => `<div class="productionCard storageOperationCard"><strong>${group.definition.name}</strong><p class="buildingDescription">${group.definition.description}</p><small>Active ${group.buildings.length} · 1 building slot · storage limit ${storageBonusText(group.definition, group.buildings.length)}</small>${storageActionButtons(group)}</div>`).join('');
    const buildingCatalog = `<h3>Storage</h3><p class="sectionNote">Multiple storehouses of the same type use one building slot, and their capacity bonuses are shown as a total.</p>${storageSummaryMarkup(state)}${storageOperations ? `<h4>Active Storehouses</h4>${storageOperations}` : ''}<div class="catalogGrid compactCatalog">${storageCatalog}</div><h3>Production / Processing</h3><div class="catalogGrid compactCatalog">${productiveCatalog}</div>`;

    const productionBuildings = state.civilization.buildings.filter(building => !isStorageBuildingType(building.type));
    const production = productionBuildings.map(building => {
      const definition = SETTLEMENT_BUILDINGS[building.type];
      const recipes = this.system.production.availableRecipes(state, building);
      const queue = state.civilization.productionQueues.find(item => item.buildingId === building.id);
      const summary = this.system.production.queueSummary(state, building.id);
      const current = queue?.current ? `${PRODUCTION_RECIPES[queue.current.recipeId].name} ${Math.floor(queue.current.elapsedSec)}/${queue.current.durationSec} sec` : queue?.waitingForResources ? 'Waiting for resources' : 'Idle';
      const buffer = bundleText(building.outputBuffer ?? {});
      const recipeCards = recipes.map(recipe => {
        const maximum = this.system.production.maximumProducible(state, building.id, recipe.id).quantity;
        return `<div class="productionRecipe"><div><strong>${recipe.name}</strong><small>${recipeSummaryText(recipe)}</small>${maximum <= 0 ? '<small class="statusWarning">Input resources are insufficient.</small>': ''}</div><div class="productionQuantity"><button data-action="produce" data-building-id="${building.id}" data-recipe-id="${recipe.id}" data-quantity="1" ${maximum < 1 ? 'disabled': ''}>+1</button><button data-action="produce" data-building-id="${building.id}" data-recipe-id="${recipe.id}" data-quantity="5" ${maximum < 5 ? 'disabled': ''}>+5</button><button data-action="produce" data-building-id="${building.id}" data-recipe-id="${recipe.id}" data-quantity="10" ${maximum < 10 ? 'disabled': ''}>+10</button><button data-action="produce" data-building-id="${building.id}" data-recipe-id="${recipe.id}" data-quantity="max" ${maximum <= 0 ? 'disabled': ''}>Max ${maximum}</button></div></div>`;
      }).join('') || '<span>No active recipe unlocked</span>';
      return `<div class="productionCard"><strong>${definition.name}</strong><p class="buildingDescription">${definition.description}</p><small>HP ${Math.ceil(building.hp)}/${building.maxHp} · ${current}${summary.pendingUnits ? ` · queued ${summary.pendingUnits}` : ''}</small>${buffer !== 'None' ? `<small>Uncollected: ${buffer}</small>` : ''}<div class="recipeButtons">${recipeCards}</div><div class="buttonRow">${building.hp < building.maxHp ? `<button data-action="repair-building" data-building-id="${building.id}">Repair</button>` : ''}${buffer !== 'None' ? `<button data-action="collect-output" data-building-id="${building.id}">Collect output</button>` : ''}<button data-action="demolish-building" data-building-id="${building.id}">Dismantle</button></div></div>`;
    }).join('') || '<p class="emptyText">No active production facilities yet.</p>';


    const active = ['progress', 'resources', 'settlement', 'production', 'reference'].includes(this.activeTab) ? this.activeTab : 'progress';
    const nextName = project ? CIVILIZATIONS[project.targetLevel]?.name : 'reachdone';
    this.body.innerHTML = this.localize(`
      <div class="uiTabBar" role="tablist" aria-label="Civilization tab switcher">
        ${tabButton('progress', 'Growth', active)}
        ${tabButton('resources', 'Resources', active)}
        ${tabButton('settlement', 'Facilities', active)}
        ${tabButton('production', 'Production', active)}
        ${tabButton('reference', 'Unlocks', active)}
      </div>
      <section class="overviewHero civilizationHero">
        <div><small>Current civilization</small><strong>Lv.${state.civilization.level} ${civilization.name}</strong><span>${civilization.central}</span></div>
        <div><small>Next goal</small><strong>${nextName}</strong><span>Building slots ${usedSettlementSlots(state)}/${civilization.slots}</span></div>
        <div><small>Base limits</small><strong>Major ${limitText(baseLimitForCivilization(state.civilization.level))}</strong><span>Simple ${fieldBaseSlotsUsed(state)}/${limitText(fieldBaseLimitForCivilization(state.civilization.level))}</span></div>
      </section>
      ${tabPanel('progress', active, `<h2>Civilization Growth</h2>${projectHtml}`)}
      ${tabPanel('resources', active, `<h2>Resource List</h2><p class="sectionNote">Normal resources are used for civilization growth, construction, and production. Amounts above storage capacity are not acquired. Tactical materials are used from ITEMS / Tactical Workshop.</p><h3>Storage Effects</h3>${storageSummaryMarkup(state)}${resourceCategorySections(state)}`)}
      ${tabPanel('settlement', active, `<h2>Settlement facilities</h2><p class="sectionNote">Build and review facilities. Multiple facilities of the same type use one building slot, and their effects are combined.</p>${buildingCatalog}`)}
      ${tabPanel('production', active, `<h2>Production</h2><p class="sectionNote">Only active processing and smelting facilities are shown. Check storage totals in the Resources and Facilities tabs.</p>${production}`)}
      ${tabPanel('reference', active, `<h2>Defense Facility Tiers</h2><p class="sectionNote">Existing map defenses can be upgraded individually up to the tier matching civilization level.</p><div class="defenseTierGrid compactReference">${defenseTierCatalog(state)}</div><h2>Dispatch Squads</h2><p class="sectionNote">Current major base ${friendlySquadCapacityForBase(state, { kind: 'MAJOR' })} slots, simple base  ${friendlySquadCapacityForBase(state, { kind: 'FIELD' })} slots, global command  ${friendlyGlobalCommandStatus(state).assigned}/${friendlyGlobalCommandStatus(state).capacity}. Simple bases can dispatch Assault, Skirmisher, and Recovery squads.</p><div class="defenseTierGrid compactReference">${friendlyUnitCatalog(state)}</div>`)}
    `);
  }
}
