import { distance } from '../core/utilities.js';
import { activePlayerBases, baseLimitForCivilization, playerBaseSlotsUsed } from '../base/player-bases.js';
import {
  activeFieldBases,
  fieldBaseLimitForCivilization,
  fieldBaseSlotsUsed
} from '../base/field-bases.js';
import { enemyPosition } from '../combat/enemy-system.js';
import { defenseWorldPosition } from '../combat/combat-geometry.js';
import { bindDismissibleModal, queryRequired, setVisible } from './dom.js';
import { bundleText } from '../civilization/inventory-system.js';
import { diagnoseFieldBaseNetwork } from '../base/field-base-system.js';
import { friendlySquadCapacityForBase } from '../combat/friendly-force-system.js';
import { fieldBaseBuildRange, majorBaseBuildRange } from '../base/construction-range.js';
import { basePressureProfile, basePressureUiText } from '../base/base-pressure.js';
import { isPlayerCheckmateActive } from '../base/base-collapse.js';

const BASE_STATUS_RADIUS_METERS = 300;
const FACILITY_RADIUS_METERS = 120;
function localizedLimit(value, i18n = null) {
  if (Number.isFinite(value)) return String(value);
  return i18n?.language === 'en' ? 'No limit' : 'No limit';
}

function tabButton(id, label, active) {
  return `<button type="button" data-ui-tab="${id}" class="${active === id ? 'active' : ''}">${label}</button>`;
}

function tabPanel(id, active, html) {
  return `<section class="uiTabPanel ${active === id ? 'active' : ''}" data-panel="${id}">${html}</section>`;
}

function i18nCopy(i18n, text = '') { return i18n?.copy?.(text) ?? String(text ?? ''); }
function i18nBundle(i18n, bundle = {}) { return i18n?.bundleText?.(bundle) ?? bundleText(bundle); }
function isEnglish(i18n) { return i18n?.language === 'en'; }

function baseKindName(kind, i18n = null) {
  const field = kind === 'field' || kind === 'FIELD';
  if (isEnglish(i18n)) return field ? 'Simple Base' : 'Major Base';
  return field ? 'Simple Base' : 'Major Base';
}

function localizedBasePressureText(profile, i18n = null) {
  if (!profile) return isEnglish(i18n) ? 'Enemy pressure unknown' : 'Enemy pressure Unknown';
  if (!isEnglish(i18n)) return basePressureUiText(profile);
  const stage = ({ Unrecognized: 'Unrecognized', Scouting: 'Scouting', Minor: 'Minor', Escalating: 'Escalating', Full: 'Full' })[profile.stageLabel] ?? i18nCopy(i18n, profile.stageLabel);
  const percent = Math.round(profile.ratio * 100);
  if (profile.kind === 'PRIMARY') return 'Enemy pressure Full';
  if (profile.mature) return `Enemy pressure ${stage} · ${percent}%`;
  const hours = Math.max(1, Math.ceil(profile.remainingMs / 3_600_000));
  return `Enemy pressure ${stage} · ${percent}% · about ${hours} h until full pressure`;
}

function localizedPlacementReason(i18n, reason = '') {
  const text = String(reason ?? '');
  if (!isEnglish(i18n)) return text;
  const exact = new Map([
    ['Acquire your current location.', 'Acquire your current location.'],
    ['Location data is too old to place a simple base. Refresh your current location.', 'Location data is too old to place a simple base. Refresh your current location.'],
    ['Location data is too old to place a base. Refresh your current location.', 'Location data is too old to place a base. Refresh your current location.'],
    ['Location data is too old to rebuild. Refresh your current location.', 'Location data is too old to rebuild. Refresh your current location.'],
    ['Location accuracy is insufficient.', 'Location accuracy is insufficient.'],
    ['Civ Lv.1 with Simple Base Unlocks.', 'Simple bases unlock at Civ Lv.1.'],
    ['Resources for placing a simple base are insufficient.', 'Resources for placing a simple base are insufficient.'],
    ['Resources for placing a major base are insufficient.', 'Resources for placing a major base are insufficient.'],
    ['Simple Base not found.', 'Simple base not found.'],
    ['Major Base not found.', 'Major base not found.'],
    ['this of Simple Base Active in progress.', 'This simple base is active.'],
    ['This major base is still active.', 'This major base is active.'],
    ['The road connected to this Simple Base is unavailable.', 'The road connected to this simple base is unavailable.'],
    ['Resources for rebuilding a simple base are insufficient.', 'Resources for rebuilding a simple base are insufficient.'],
    ['Resources for rebuilding a major base are insufficient.', 'Resources for rebuilding a major base are insufficient.'],
    ['RemoveSimple Base not found.', 'Simple base to dismantle was not found.'],
    ['RemoveMajor Base not found.', 'Major base to dismantle was not found.'],
    ['last at leaveMajor Base Cannot dismantle.', 'The last remaining major base cannot be dismantled.'],
    ['Major Base minimum1one more.', 'At least one major base is required.'],
    ['Simple Basesystem unavailable.', 'Simple base system is unavailable.']
  ]);
  if (exact.has(text)) return exact.get(text);
  let match = text.match(/^current of CivilizationLevel in Simple Base (\d+)count to Place with .$/);
  if (match) return `Current civilization level allows up to ${match[1]} simple bases.`;
  match = text.match(/^current of CivilizationLevel in Base (\d+)count to Place with .$/);
  if (match) return `Current civilization level allows up to ${match[1]} major bases.`;
  match = text.match(/^Move within (\d+) m of an acquired road intersection.$/);
  if (match) return `Move within ${match[1]} m of an acquired road intersection.`;
  match = text.match(/^Move at least (\d+) m away from an existing base.$/);
  if (match) return `Move at least ${match[1]} m away from an existing base.`;
  match = text.match(/^Move at least (\d+) m away from a simple base.$/);
  if (match) return `Move at least ${match[1]} m away from a simple base.`;
  match = text.match(/^Move at least (\d+) m away from an enemy base.$/);
  if (match) return `Move at least ${match[1]} m away from an enemy base.`;
  match = text.match(/^DestroyedSimple Base from (\d+) m of an acquired road intersection.$/);
  if (match) return `Move within ${match[1]} m of the destroyed simple base.`;
  match = text.match(/^DestroyedMajor Base from (\d+) m of an acquired road intersection.$/);
  if (match) return `Move within ${match[1]} m of the destroyed major base.`;
  return i18nCopy(i18n, text);
}

function localizedDiagnosticGuidance(i18n, text = '') {
  const value = String(text ?? '');
  if (!isEnglish(i18n)) return value;
  if (value === 'The required number of simple bases is already active.') return 'The required number of simple bases is already active.';
  if (value === 'No base slots are available. Rebuild destroyed simple bases on site.') return 'No base slots are available. Rebuild destroyed simple bases on site.';
  if (value === 'The acquired road network does not contain enough sites. Acquire more roads or secure areas around enemy bases.') return 'The acquired road network does not contain enough sites. Acquire more roads or secure areas around enemy bases.';
  let match = value.match(/^DestroyedSimple Base (\d+)Rebuild and requirements can satisfy.$/);
  if (match) return `Rebuild ${match[1]} destroyed simple base(s) to meet the requirement.`;
  match = value.match(/^The acquired road network has (\d+) additional candidate site(s).$/);
  if (match) return `The acquired road network has ${match[1]} additional candidate site(s).`;
  return i18nCopy(i18n, value);
}


function defensePoint(state, defense) {
  return defenseWorldPosition(state.world.roadGraph, defense);
}


export function summarizePlayerBase(state, base) {
  const nearbyEnemies = (state.combat.enemies ?? []).filter(enemy => enemy.hp > 0 && distance(base, enemyPosition(state, enemy)) <= BASE_STATUS_RADIUS_METERS).length;
  const facilities = (state.combat.defenses ?? []).filter(defense => defense.hp > 0 && (() => {
    const point = defensePoint(state, defense);
    return point && distance(base, point) <= FACILITY_RADIUS_METERS;
  })()).length;
  const baseSquads = (state.combat.friendlySquads ?? []).filter(squad => squad.originBaseId === base.id && squad.hp > 0);
  const recoveringSquads = baseSquads.filter(squad => squad.status === 'RECOVERING').length;
  const readySquads = baseSquads.filter(squad => squad.status === 'READY').length;
  const activeSquads = baseSquads.length - recoveringSquads - readySquads;
  const squads = baseSquads.length;
  const squadCapacity = friendlySquadCapacityForBase(state, base);
  const recoveryItems = (state.world.recoveryItems ?? []).filter(item => item.status === 'AVAILABLE' && distance(base, state.world.roadGraph?.nodeById?.get(item.nodeId) ?? item) <= BASE_STATUS_RADIUS_METERS).length;
  return {
    nearbyEnemies,
    facilities,
    squads,
    squadCapacity,
    activeSquads,
    recoveringSquads,
    readySquads,
    recoveryItems,
    alert: base.status === 'DESTROYED' || base.hp <= 0
      ? 'Destroyed'
      : nearbyEnemies > 0
        ? 'Enemy contact'
        : recoveryItems > 0
          ? 'Recovery item nearby'
          : 'Stable'
  };
}

function baseCard(state, base, { selected, label, field = false, rebuild = null, rebuildKind = null, dismantle = null, dismantleKind = null, i18n = null }) {
  const status = summarizePlayerBase(state, base);
  const destroyed = base.status === 'DESTROYED' || base.hp <= 0;
  const pressure = basePressureProfile(state, base, field ? 'FIELD' : base.primary ? 'PRIMARY' : 'MAJOR');
  const c = text => i18nCopy(i18n, text);
  const en = isEnglish(i18n);
  const baseName = c(base.name);
  const baseKind = baseKindName(field ? 'field' : 'major', i18n);
  const targetCap = pressure.kind === 'PRIMARY' ? localizedLimit(Infinity, i18n) : pressure.targetCap;
  const fieldRangeNote = field
    ? (en
      ? `<p class="sectionNote">Construction range ${fieldBaseBuildRange(state.civilization?.level)} m. Can dispatch Assault, Skirmisher, and Recovery squads.</p>`
      : `<p class="sectionNote">Construction range ${fieldBaseBuildRange(state.civilization?.level)}m. Build simple bases, dispatch skirmishers, and manage recovery squads.</p>`)
    : '';
  const pressureNotice = en
    ? `${localizedBasePressureText(pressure, i18n)} · simultaneous target cap ${targetCap}`
    : `${basePressureUiText(pressure)} · simultaneous target cap ${targetCap}`;
  const squadNotice = en
    ? `Deployed ${status.activeSquads} · Recovering ${status.recoveringSquads} · Ready to redeploy ${status.readySquads}`
    : `Deployed ${status.activeSquads} · Recovering ${status.recoveringSquads} · Ready to redeploy ${status.readySquads}`;
  const recoveryNotice = status.recoveryItems
    ? (en ? `<p class="baseRecoveryNotice">Unrecovered nearby items ${status.recoveryItems}</p>` : `<p class="baseRecoveryNotice">Unrecovered nearby items ${status.recoveryItems}</p>`)
    : '';
  const focusLabel = en ? 'Show this base on MAP' : 'Show this base on MAP';
  const rebuildHtml = destroyed && rebuildKind ? (() => {
    const kind = baseKindName(rebuildKind, i18n);
    const button = en ? `Rebuild on site: ${kind}` : `Rebuild on site: ${kind} rebuild`;
    const reason = rebuild?.ok
      ? (en ? 'Can rebuild from your current location.' : 'Can rebuild from your current location.')
      : localizedPlacementReason(i18n, rebuild?.reason ?? (en ? 'Move to the site.' : 'Move to the site.'));
    return `<button class="secondary wideButton" data-action="rebuild-${rebuildKind}-base" data-base-id="${base.id}" ${rebuild?.ok ? '' : 'disabled'}>${button}</button><p class="sectionNote">${en ? 'Cost' : 'Cost'} ${i18nBundle(i18n, rebuild?.cost)} · ${reason}</p>`;
  })() : '';
  const dismantleHtml = dismantleKind ? (() => {
    const kind = baseKindName(dismantleKind, i18n);
    const button = en ? `Dismantle ${kind}` : `${kind} dismantle`;
    const reason = dismantle?.ok
      ? (en ? 'Dismantling frees a base slot and reassigns enemies and squads targeting it to a remaining major base.' : 'Dismantling frees a base slot and reassigns enemies and squads targeting it to a remaining major base.')
      : localizedPlacementReason(i18n, dismantle?.reason ?? (en ? 'Cannot dismantle.' : 'Cannot dismantle.'));
    return `<button class="secondary wideButton danger" data-action="dismantle-${dismantleKind}-base" data-base-id="${base.id}" ${dismantle?.ok ? '' : 'disabled'}>${button}</button><p class="sectionNote">${reason}</p>`;
  })() : '';
  return `<article class="baseCommandCard ${selected ? 'selected' : ''} ${destroyed ? 'destroyed' : ''}">
    <header><div><small>${label}</small><strong>${baseName}</strong></div><span data-alert="${destroyed || status.nearbyEnemies > 0 ? 'danger' : 'clear'}">${c(status.alert)}</span></header>
    <div class="contextMetricGrid"><span><small>HP</small><b>${Math.ceil(base.hp)}/${base.maxHp}</b></span><span><small>ENEMY</small><b>${status.nearbyEnemies}</b></span><span><small>DEF</small><b>${status.facilities}</b></span><span><small>SQUAD</small><b>${status.squads}/${status.squadCapacity}</b></span><span><small>PRESS</small><b>${Math.round(pressure.ratio * 100)}%</b></span></div>
    ${fieldRangeNote}
    <p class="basePressureNotice">${pressureNotice}</p>
    <p class="baseSquadNotice">${squadNotice}</p>
    ${recoveryNotice}
    <button class="primary wideButton" data-action="focus-base" data-base-id="${base.id}" data-base-kind="${field ? 'field' : 'major'}">${focusLabel}</button>
    ${rebuildHtml}
    ${dismantleHtml}
  </article>`;
}

export class BaseCommandUi {
  constructor({ store, playerBaseSystem, fieldBaseSystem = null, renderer, notifications, persist, i18n = null }) {
    this.store = store;
    this.system = playerBaseSystem;
    this.fieldSystem = fieldBaseSystem;
    this.renderer = renderer;
    this.notifications = notifications;
    this.persist = persist;
    this.i18n = i18n;
    this.panel = queryRequired('#baseCommandPanel');
    this.body = queryRequired('#baseCommandBody');
    this.summary = queryRequired('#baseSummary');
    this.focusedBaseId = null;
    this.focusedBaseKind = 'major';
    this.lastRenderAt = 0;
    this.activeTab = 'overview';
    queryRequired('#baseCommandButton').addEventListener('click', () => this.open());
    queryRequired('#closeBaseCommand').addEventListener('click', () => this.close());
    bindDismissibleModal(this.panel, () => this.close());
    this.body.addEventListener('click', event => this.handleAction(event));
  }

  localize(text = '') { return this.i18n?.copy?.(text) ?? text; }

  availableBases(state) {
    return [...(state.world?.playerBases ?? []), ...(state.world?.fieldBases ?? [])];
  }

  open() {
    const state = this.store.snapshot();
    const bases = this.availableBases(state);
    if (!bases.some(base => base.id === this.focusedBaseId)) {
      this.focusedBaseId = bases[0]?.id ?? null;
      this.focusedBaseKind = 'major';
    }
    this.render(state);
    setVisible(this.panel, true);
  }

  close() { setVisible(this.panel, false); }

  selectedBase(state = this.store.snapshot()) {
    const bases = this.availableBases(state);
    return bases.find(base => base.id === this.focusedBaseId) ?? bases[0] ?? null;
  }

  focusCurrentBase(state = this.store.snapshot()) {
    const base = this.selectedBase(state);
    if (!base) return false;
    this.focusedBaseId = base.id;
    this.focusedBaseKind = base.kind === 'FIELD' ? 'field' : 'major';
    this.renderer.centerOn(base, 0.9);
    this.updateSummary(state);
    return true;
  }

  update(state = this.store.snapshot()) {
    this.updateSummary(state);
    if (!this.panel.hidden && Date.now() - this.lastRenderAt >= 1000) this.render(state);
  }

  updateSummary(state = this.store.snapshot()) {
    const major = activePlayerBases(state);
    const majorSlots = playerBaseSlotsUsed(state);
    const field = state.world?.fieldBases ?? [];
    const focused = [...major, ...field].find(base => base.id === this.focusedBaseId);
    const damagedDefenses = (state.combat?.defenses ?? []).filter(defense => defense.hp > 0 && defense.hp < defense.maxHp).length;
    const damagedBuildings = (state.civilization?.buildings ?? []).filter(building => building.hp > 0 && building.hp < building.maxHp).length;
    const repairCount = damagedDefenses + damagedBuildings;
    const majorLimit = localizedLimit(baseLimitForCivilization(state.civilization?.level), this.i18n);
    const fieldLimit = localizedLimit(fieldBaseLimitForCivilization(state.civilization?.level), this.i18n);
    const focusedName = focused ? i18nCopy(this.i18n, focused.name) : '';
    if (isPlayerCheckmateActive(state) || Number(state.world?.city?.hp) <= 0) {
      this.summary.textContent = this.localize('Home base destroyed · recovery required');
    } else {
      this.summary.textContent = isEnglish(this.i18n)
        ? `Major ${major.length} active · ${majorSlots}/${majorLimit} · Simple ${fieldBaseSlotsUsed(state)}/${fieldLimit}${repairCount ? ` · Repairs needed ${repairCount}` : ''}${focused ? ` · Focused ${focusedName}` : ''}`
        : `Major ${major.length}Active · ${majorSlots}/${majorLimit} · Simple ${fieldBaseSlotsUsed(state)}/${fieldLimit}${repairCount ? ` · Repairs needed ${repairCount}` : ''}${focused ? ` · Focused ${focusedName}` : ''}`;
    }
    this.summary.classList?.toggle('has-repairs', repairCount > 0);
  }

  handleAction(event) {
    const tabButton = event.target.closest('button[data-ui-tab]');
    if (tabButton?.dataset?.uiTab) {
      this.activeTab = tabButton.dataset.uiTab || 'overview';
      this.render();
      return;
    }
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, baseId, baseKind } = button.dataset;
    if (action === 'focus-base') {
      const state = this.store.snapshot();
      const pool = baseKind === 'field' ? (state.world?.fieldBases ?? []) : (state.world?.playerBases ?? []);
      const base = pool.find(value => value.id === baseId);
      if (!base) return;
      this.focusedBaseId = base.id;
      this.focusedBaseKind = baseKind ?? 'major';
      this.focusCurrentBase(state);
      this.close();
      return;
    }
    if (action === 'restore-home-base') {
      let result;
      this.store.transaction(state => { result = this.system.restoreHomeBaseAfterDefeat(state); }, 'base:home-recovered', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Cannot restore home base.'));
      else {
        this.focusedBaseId = result.base.id;
        this.focusedBaseKind = 'major';
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize('Emergency recovery complete. The home base is back online with a temporary enemy regroup grace period.'));
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'establish-base') {
      let result;
      this.store.transaction(state => { result = this.system.establishAtCurrentLocation(state); }, 'base:player-established', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Cannot place base.'));
      else {
        this.focusedBaseId = result.base.id;
        this.focusedBaseKind = 'major';
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize(`${result.base.name} placed.`));
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'establish-field-base') {
      if (!this.fieldSystem) return;
      let result;
      this.store.transaction(state => { result = this.fieldSystem.establishAtCurrentLocation(state); }, 'base:field-established', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Cannot place simple base.'));
      else {
        this.focusedBaseId = result.base.id;
        this.focusedBaseKind = 'field';
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize(`${result.base.name} placed.`));
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'rebuild-major-base') {
      let result;
      this.store.transaction(state => { result = this.system.rebuild(state, baseId); }, 'base:player-rebuilt', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Cannot rebuild major base.'));
      else {
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize(`${result.base.name} rebuilt.`));
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'rebuild-field-base') {
      if (!this.fieldSystem) return;
      let result;
      this.store.transaction(state => { result = this.fieldSystem.rebuild(state, baseId); }, 'base:field-rebuilt', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Cannot rebuild simple base.'));
      else {
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize(`${result.base.name} rebuilt.`));
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'dismantle-major-base') {
      let result;
      this.store.transaction(state => { result = this.system.dismantle(state, baseId); }, 'base:player-dismantled', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Cannot dismantle major base.'));
      else {
        const state = this.store.snapshot();
        this.focusedBaseId = (state.world?.playerBases ?? [])[0]?.id ?? (state.world?.fieldBases ?? [])[0]?.id ?? null;
        this.focusedBaseKind = 'major';
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize(`${result.base.name} dismantled.`));
        this.persist?.();
      }
      this.render();
      return;
    }
    if (action === 'dismantle-field-base') {
      if (!this.fieldSystem) return;
      let result;
      this.store.transaction(state => { result = this.fieldSystem.dismantle(state, baseId); }, 'base:field-dismantled', { emit: true, validate: true });
      if (!result?.ok) this.notifications.show(this.localize(result?.reason ?? 'Cannot dismantle simple base.'));
      else {
        const state = this.store.snapshot();
        this.focusedBaseId = (state.world?.playerBases ?? [])[0]?.id ?? (state.world?.fieldBases ?? [])[0]?.id ?? null;
        this.focusedBaseKind = 'major';
        this.renderer.invalidateStatic();
        this.renderer.render();
        this.notifications.show(this.localize(`${result.base.name} dismantled.`));
        this.persist?.();
      }
      this.render();
    }
  }

  render(state = this.store.snapshot()) {
    this.lastRenderAt = Date.now();
    const c = text => i18nCopy(this.i18n, text);
    const en = isEnglish(this.i18n);
    const majorBases = state.world?.playerBases ?? [];
    const fieldBases = state.world?.fieldBases ?? [];
    const majorLimit = baseLimitForCivilization(state.civilization?.level);
    const fieldLimit = fieldBaseLimitForCivilization(state.civilization?.level);
    const all = [...majorBases, ...fieldBases];
    if (!all.some(base => base.id === this.focusedBaseId)) this.focusedBaseId = majorBases[0]?.id ?? fieldBases[0]?.id ?? null;

    const recoveryMode = isPlayerCheckmateActive(state) || Number(state.world?.city?.hp) <= 0;
    const homeRecovery = this.system.previewHomeBaseRecovery?.(state) ?? { ok: false, reason: 'Home base recovery is not required.' };
    const majorPlacement = this.system.previewCurrentLocation(state);
    const fieldPlacement = this.fieldSystem?.previewCurrentLocation(state) ?? { ok: false, reason: 'Simple base system is unavailable.' };
    const fieldDiagnostic = diagnoseFieldBaseNetwork(state, Math.min(3, fieldLimit));
    const majorCards = majorBases.map((base, index) => baseCard(state, base, {
      selected: base.id === this.focusedBaseId,
      label: index === 0 ? 'PRIMARY' : `MAJOR ${String(index + 1).padStart(2, '0')}`,
      rebuild: base.status === 'DESTROYED' ? this.system.previewRebuild(state, base.id) : null,
      rebuildKind: base.primary ? null : 'major',
      dismantle: this.system.previewDismantle(state, base.id),
      dismantleKind: base.primary ? null : 'major',
      i18n: this.i18n
    })).join('') || `<p class="emptyText">${en ? 'No active major bases.': 'No active major bases.'}</p>`;
    const fieldCards = fieldBases.map((base, index) => baseCard(state, base, {
      selected: base.id === this.focusedBaseId,
      label: `FIELD ${String(index + 1).padStart(2, '0')}`,
      field: true,
      rebuild: base.status === 'DESTROYED' ? this.fieldSystem?.previewRebuild(state, base.id) : null,
      rebuildKind: 'field',
      dismantle: this.fieldSystem?.previewDismantle(state, base.id),
      dismantleKind: 'field',
      i18n: this.i18n
    })).join('') || `<p class="emptyText">${en ? 'No simple bases yet.': 'No simple bases yet.'}</p>`;

    const active = ['overview', 'major', 'field', 'build'].includes(this.activeTab) ? this.activeTab : 'overview';
    const majorLimitText = localizedLimit(majorLimit, this.i18n);
    const fieldLimitText = localizedLimit(fieldLimit, this.i18n);
    const majorSlotsPerBase = friendlySquadCapacityForBase(state, { kind: 'MAJOR' });
    const fieldSlotsPerBase = friendlySquadCapacityForBase(state, { kind: 'FIELD' });
    const buildMajorCost = i18nBundle(this.i18n, majorPlacement.cost);
    const buildFieldCost = i18nBundle(this.i18n, fieldPlacement.cost);
    const majorBuildStatus = majorPlacement.ok
      ? (en ? `Can place · about ${Math.round(majorPlacement.distanceToRoad)} m to road` : `Can place · about ${Math.round(majorPlacement.distanceToRoad)}m`)
      : localizedPlacementReason(this.i18n, majorPlacement.reason);
    const fieldBuildStatus = fieldPlacement.ok
      ? (en ? `Can place · about ${Math.round(fieldPlacement.distanceToRoad)} m to road` : `Can place · about ${Math.round(fieldPlacement.distanceToRoad)}m`)
      : localizedPlacementReason(this.i18n, fieldPlacement.reason);
    const fieldDiagnosticTitle = en
      ? `Road network check: ${fieldDiagnostic.active}/${fieldDiagnostic.required} active`
      : `Road network check: ${fieldDiagnostic.active}/${fieldDiagnostic.required}Active`;
    const fieldDiagnosticDetail = en
      ? `Additional candidates ${fieldDiagnostic.confirmedAdditional} · Destroyed ${fieldDiagnostic.destroyed}`
      : `Additional candidates ${fieldDiagnostic.confirmedAdditional} · Destroyed ${fieldDiagnostic.destroyed}`;
    const recoveryPanel = recoveryMode ? `<section class="baseDefeatRecoveryPanel"><h2>${c('Home base recovery')}</h2><p class="sectionNote">${c('Your home base has fallen. Enemy attacks are paused until you restore the home base, but normal construction and dispatch require recovery first.')}</p><button class="primary wideButton" data-action="restore-home-base" ${homeRecovery.ok ? '' : 'disabled'}>${c('Restore Home Base')}</button><p class="sectionNote">${homeRecovery.ok ? `${c('Restores HP')} ${homeRecovery.hp}/${homeRecovery.maxHp} · ${Math.round((homeRecovery.graceSeconds ?? 0) / 60)} ${c('min enemy regroup grace')}` : localizedPlacementReason(this.i18n, homeRecovery.reason)}</p></section>` : '';

    this.body.innerHTML = `<div class="uiTabBar" role="tablist" aria-label="${this.localize('Base tab switcher')}">
        ${tabButton('overview', en ? 'Overview' : 'Overview', active)}
        ${tabButton('major', en ? 'Major' : 'Major', active)}
        ${tabButton('field', en ? 'Simple' : 'Simple', active)}
        ${tabButton('build', en ? 'Build' : 'Build', active)}
      </div>
      ${recoveryPanel}
      <section class="overviewHero baseHero">
        <div><small>${en ? 'Major Bases' : 'Major Base'}</small><strong>${majorBases.length}/${majorLimitText}</strong><span>${en ? `${majorSlotsPerBase} squad slots each` : `each  ${majorSlotsPerBase}squad slots`}</span></div>
        <div><small>${en ? 'Simple Bases' : 'Simple Base'}</small><strong>${fieldBaseSlotsUsed(state)}/${fieldLimitText}</strong><span>${en ? `${fieldSlotsPerBase} squad slots each` : `each  ${fieldSlotsPerBase}squad slots`}</span></div>
        <div><small>${en ? 'Civilization' : 'Civilization'}</small><strong>Lv.${state.civilization.level}</strong><span>${en ? 'Growth increases base and squad slots' : 'Growth increases base and squad slots'}</span></div>
      </section>
      ${tabPanel('overview', active, `<h2>${en ? 'Base Overview' : 'Base Overview'}</h2><div class="baseCommandGrid compactBaseGrid">${majorCards}${fieldCards}</div>`)}
      ${tabPanel('major', active, `<h2>${en ? 'Major Bases' : 'Major Base'}</h2><p class="sectionNote">${en ? 'Core bases that can dispatch all squad types. At least one major base must remain; the rest can be dismantled.' : 'Core bases that can dispatch all squad types. At least one major base must remain; the rest can be dismantled.'}</p><div class="baseCommandGrid">${majorCards}</div>`)}
      ${tabPanel('field', active, `<h2>${en ? 'Simple Bases' : 'Simple Base'}</h2><p class="sectionNote">${en ? 'Used for frontline operation of Assault, Skirmisher, and Recovery squads. Unneeded simple bases can be dismantled.' : 'Used for frontline operation of Assault, Skirmisher, and Recovery squads. Unneeded simple bases can be dismantled.'}</p><div class="baseCommandGrid">${fieldCards}</div>`)}
      ${tabPanel('build', active, `<h2>${en ? 'Build a major base here' : 'Build a major base here'}</h2><div class="baseEstablishSection"><p class="sectionNote">${en ? `Construction range ${majorBaseBuildRange(state.civilization?.level)} m. All squad types can be dispatched.` : `Construction range ${majorBaseBuildRange(state.civilization?.level)}m.All squad types can be dispatched.`}</p><button class="primary wideButton" data-action="establish-base" ${majorPlacement.ok ? '' : 'disabled'}>${en ? 'Place major base here' : 'Place major base here'}</button><p class="sectionNote">${en ? 'Cost' : 'Cost'} ${buildMajorCost} · ${majorBuildStatus}</p></div><h2>${en ? 'Build a simple base here' : 'Build a simple base here'}</h2><div class="baseEstablishSection"><p class="sectionNote">${en ? 'Unlocked at Civ Lv.1. Can be placed within 100 m of an acquired road intersection.' : 'Unlocked at Civ Lv.1. Can be placed within 100 m of an acquired road intersection.'}</p><div class="fieldBaseDiagnostic ${fieldDiagnostic.sufficient ? 'is-sufficient' : 'is-insufficient'}"><strong>${fieldDiagnosticTitle}</strong><span>${fieldDiagnosticDetail}</span><small>${localizedDiagnosticGuidance(this.i18n, fieldDiagnostic.guidance)}</small></div><button class="primary wideButton" data-action="establish-field-base" ${fieldPlacement.ok ? '' : 'disabled'}>${en ? 'Place simple base here' : 'Place simple base here'}</button><p class="sectionNote">${en ? 'Cost' : 'Cost'} ${buildFieldCost} · ${fieldBuildStatus}</p></div>`)}
    `;
    this.updateSummary(state);
  }

}
