import { queryRequired, setVisible } from './dom.js';
import { ROADSIDE_USE_DEFINITIONS, ensureRoadsideSupplyState, roadsideSupplyPresentation } from '../exploration/roadside-supplies.js';
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
    this.button.addEventListener('click', () => this.open());
    this.closeButton.addEventListener('click', () => this.close());
    this.panel.addEventListener('click', event => { if (event.target === this.panel) this.close(); });
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

  update(view = this.store.uiSnapshot()) {
    const state = view ?? this.store.uiSnapshot();
    const supplies = ensureRoadsideSupplyState(state);
    const total = Object.values(supplies.inventory ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    this.button.textContent = total > 0 ? `ITEMS // 物資 ${countText(total)}` : 'ITEMS // 物資';
    this.button.title = activeSummary(state);
    if (!this.panel.hidden) this.render(state);
  }

  render(snapshot = this.store.uiSnapshot()) {
    const state = snapshot ?? this.store.uiSnapshot();
    const supplies = ensureRoadsideSupplyState(state);
    const inventory = supplies.inventory ?? {};
    const active = supplies.active ?? [];
    const nearby = active.slice(0, 8).map(item => {
      const presentation = roadsideSupplyPresentation(item);
      const detail = item.kind === 'resource' ? bundleText(item.bundle) : presentation.summary;
      return `<li><strong>${presentation.name}</strong><span>${detail}</span></li>`;
    }).join('') || '<li><span>現在地周辺に表示中の道端物資はありません。</span></li>';

    const inventoryHtml = Object.entries(ROADSIDE_USE_DEFINITIONS).map(([key, definition]) => {
      const count = Math.max(0, Math.floor(Number(inventory[key]) || 0));
      const disabled = count <= 0 ? 'disabled' : '';
      const label = definition.squadType
        ? `${definition.searchRangeMeters}m以内の対象へ一時部隊を出撃`
        : key === 'sweepSignal'
          ? `現在地${definition.radiusMeters}m以内の通常敵を掃討`
          : key === 'breachCharge'
            ? `現在地${definition.radiusMeters}m以内の敵拠点1つを破壊`
            : key === 'roadMine'
              ? `道路上に設置し、通過した敵へ範囲ダメージ`
              : key === 'lureSignal'
                ? `周囲${definition.radiusMeters}m以内の敵を現在地付近へ誘導`
                : key === 'marchBanner'
                  ? `周囲${definition.radiusMeters}m以内の味方部隊を一時加速`
                  : key === 'smokeScreen'
                    ? `周囲${definition.radiusMeters}m以内の味方部隊を緊急撤退`
                    : '消耗品を使用';
      return `<div class="supplyInventoryRow">
        <div><strong>${definition.name}</strong><span>${label}</span></div>
        <button type="button" data-use-roadside="${key}" ${disabled}>使用 ×${count}</button>
      </div>`;
    }).join('');

    this.body.innerHTML = `
      <section>
        <h2>道端物資</h2>
        <p class="sectionNote">道路沿いの資源箱は近づくと自動回収します。出撃札・信号弾・爆薬は拾得後、この画面から使用します。</p>
        <div class="supplyStatusGrid">
          <span><small>周辺</small><strong>${active.length}</strong></span>
          <span><small>本日取得</small><strong>${supplies.daily?.collectedCount ?? 0}</strong></span>
          <span><small>レア取得</small><strong>${supplies.daily?.rareCollectedCount ?? 0}</strong></span>
        </div>
        <ul class="supplyNearbyList">${nearby}</ul>
      </section>
      <section>
        <h2>消耗品インベントリ</h2>
        <div class="supplyInventoryList">${inventoryHtml}</div>
      </section>
    `;
    for (const button of this.body.querySelectorAll('[data-use-roadside]')) {
      button.addEventListener('click', () => this.useItem(button.dataset.useRoadside));
    }
  }
}
