import { bindDismissibleModal, queryRequired, setVisible } from './dom.js';
import { buildOperationGuidance, operationGuidanceMarkup } from './operation-guidance.js';
import { SUPPORTED_LANGUAGES } from '../i18n/catalog.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

export class MenuUi {
  constructor({ store = null, onSave, onReset, notifications, i18n = null, onLanguageChange = null, confirmImpl = globalThis.confirm?.bind(globalThis) }) {
    this.panel = queryRequired('#menuPanel');
    this.manualSave = queryRequired('#manualSave');
    this.store = store;
    this.i18n = i18n;
    this.onLanguageChange = onLanguageChange;
    this.notifications = notifications;
    this.opsPanel = this.panel.querySelector('#operationGuidanceContent');
    this.guidePanel = this.panel.querySelector('#menuGuideContent');
    this.languageButtons = this.panel.querySelector('#languageButtons');
    this.confirmImpl = confirmImpl;
    this.activeTab = 'ops';
    queryRequired('#menuButton').addEventListener('click', () => { this.refreshOperations(true); this.renderLocalizedContent(); this.setTab(this.activeTab); setVisible(this.panel, true); });
    queryRequired('#closeMenu').addEventListener('click', () => setVisible(this.panel, false));
    bindDismissibleModal(this.panel, () => setVisible(this.panel, false));
    this.panel.addEventListener('click', event => {
      const languageButton = event.target.closest('button[data-language-choice]');
      if (languageButton) {
        this.setLanguage(languageButton.dataset.languageChoice);
        return;
      }
      const button = event.target.closest('button[data-menu-tab]');
      if (button) this.setTab(button.dataset.menuTab || 'guide');
    });
    this.manualSave.addEventListener('click', () => {
      const saved = onSave();
      notifications.show(saved ? this.t('menu.saved', '現在の状態を保存しました。') : this.t('menu.saveFailed', '保存できません。このタブを閉じると進行状況は失われます。'));
    });
    queryRequired('#menuReset').addEventListener('click', () => {
      const confirmed = this.confirmImpl ? this.confirmImpl(this.t('menu.resetConfirm', 'ゲームの進行状況を完全に初期化します。元に戻せません。続行しますか？')) : false;
      if (confirmed) onReset();
    });
    this.renderLocalizedContent();
  }

  t(key, fallback = '') {
    return this.i18n?.t?.(key, fallback) ?? fallback;
  }

  setLanguage(language) {
    this.i18n?.setLanguage?.(language);
    this.onLanguageChange?.(this.i18n?.language ?? language);
    this.renderLocalizedContent();
    this.setSaveAvailable(!this.manualSave.disabled);
    this.notifications?.show?.(this.t('language.changed', '表示言語を変更しました。'));
  }

  renderLocalizedContent() {
    this.i18n?.apply?.(globalThis.document);
    this.renderGuide();
    this.renderLanguageButtons();
  }

  renderGuide() {
    if (!this.guidePanel) return;
    const entries = this.i18n?.guideEntries?.() ?? [];
    this.guidePanel.innerHTML = entries.map((entry, index) => `
      <details ${index === 0 ? 'open' : ''}>
        <summary>${escapeHtml(entry.title)}</summary>
        <p>${escapeHtml(entry.body)}</p>
      </details>
    `).join('');
  }

  renderLanguageButtons() {
    if (!this.languageButtons) return;
    const current = this.i18n?.language ?? 'ja';
    this.languageButtons.innerHTML = SUPPORTED_LANGUAGES.map(language => `
      <button type="button" data-language-choice="${escapeHtml(language.code)}" aria-pressed="${language.code === current ? 'true' : 'false'}" class="${language.code === current ? 'active' : ''}">${escapeHtml(language.label)}</button>
    `).join('');
  }

  setTab(tab) {
    this.activeTab = tab;
    if (tab === 'ops') this.refreshOperations(true);
    if (tab === 'guide' || tab === 'display' || tab === 'system') this.renderLocalizedContent();
    for (const button of this.panel.querySelectorAll('[data-menu-tab]')) {
      button.classList.toggle('active', button.dataset.menuTab === tab);
    }
    for (const panel of this.panel.querySelectorAll('[data-menu-panel]')) {
      panel.classList.toggle('active', panel.dataset.menuPanel === tab);
    }
  }

  refreshOperations(force = false) {
    if (!this.opsPanel || !this.store) return;
    const now = Date.now();
    if (!force && this.lastOpsRefreshAt && now - this.lastOpsRefreshAt < 1200) return;
    this.lastOpsRefreshAt = now;
    const state = this.store.snapshot ? this.store.snapshot() : null;
    this.opsPanel.innerHTML = this.i18n?.copy?.(state ? operationGuidanceMarkup(buildOperationGuidance(state)) : `<p class="emptyText">${escapeHtml(this.t('menu.opsUnavailable', '作戦目標を取得できません。'))}</p>`) ?? (state ? operationGuidanceMarkup(buildOperationGuidance(state)) : `<p class="emptyText">${escapeHtml(this.t('menu.opsUnavailable', '作戦目標を取得できません。'))}</p>`);
  }

  update() {
    if (!this.panel.hidden && this.activeTab === 'ops') this.refreshOperations(false);
  }

  setSaveAvailable(available) {
    this.manualSave.disabled = !available;
    this.manualSave.textContent = available ? this.t('menu.saveReady', '現在の状態を保存') : this.t('menu.saveUnavailable', '保存できません');
  }
}
