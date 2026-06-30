import { bindDismissibleModal, queryRequired, setVisible } from './dom.js';
import { buildOperationGuidance, operationGuidanceMarkup } from './operation-guidance.js';
import { SUPPORTED_LANGUAGES, languageMeta, nextLanguageCode } from '../i18n/catalog.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

export class MenuUi {
  constructor({ store = null, onSave, onReset, notifications, i18n = null, onLanguageChange = null, onOperationAction = null, confirmImpl = globalThis.confirm?.bind(globalThis) }) {
    this.panel = queryRequired('#menuPanel');
    this.manualSave = queryRequired('#manualSave');
    this.store = store;
    this.i18n = i18n;
    this.onLanguageChange = onLanguageChange;
    this.notifications = notifications;
    this.onOperationAction = onOperationAction;
    this.opsPanel = this.panel.querySelector('#operationGuidanceContent');
    this.guidePanel = this.panel.querySelector('#menuGuideContent');
    this.languageButtons = this.panel.querySelector('#languageButtons');
    this.bootLanguageButtons = globalThis.document?.querySelector?.('#bootLanguageButtons') ?? null;
    this.confirmImpl = confirmImpl;
    this.activeTab = 'ops';
    queryRequired('#menuButton').addEventListener('click', () => { this.refreshOperations(true); this.renderLocalizedContent(); this.setTab(this.activeTab); setVisible(this.panel, true); });
    queryRequired('#closeMenu').addEventListener('click', () => setVisible(this.panel, false));
    bindDismissibleModal(this.panel, () => setVisible(this.panel, false));
    this.bootLanguageButtons?.addEventListener('click', event => {
      const toggleButton = event.target.closest('button[data-language-toggle]');
      if (toggleButton) this.toggleBootLanguage();
    });
    this.panel.addEventListener('click', event => {
      const operationButton = event.target.closest('button[data-operation-action]');
      if (operationButton) {
        this.handleOperationAction(operationButton);
        return;
      }
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

  currentLanguage() {
    return languageMeta(this.i18n?.language ?? 'en');
  }

  nextBootLanguage() {
    return nextLanguageCode(this.i18n?.language ?? this.currentLanguage().code);
  }

  toggleBootLanguage() {
    this.setLanguage(this.nextBootLanguage());
  }

  languageButtonMarkup() {
    const current = this.currentLanguage().code;
    return SUPPORTED_LANGUAGES.map(language => {
      const active = language.code === current;
      const visible = `${language.flag ?? ''} ${language.label}`.trim();
      return `<button type="button" data-language-choice="${escapeHtml(language.code)}" aria-label="${escapeHtml(language.nativeName)}" title="${escapeHtml(language.nativeName)}" aria-pressed="${active ? 'true' : 'false'}" class="${active ? 'active' : ''}">${escapeHtml(visible)}</button>`;
    }).join('');
  }

  bootLanguageButtonMarkup() {
    const current = this.currentLanguage();
    const next = languageMeta(this.nextBootLanguage());
    const label = this.t('language.toggleButtonLabel', '言語を切り替え');
    const title = `${this.t('language.toggleButtonTitle', 'English / 中文 / 日本語')} · ${current.nativeName} → ${next.nativeName}`;
    return `<button type="button" data-language-toggle="next" data-current-language="${escapeHtml(current.code)}" data-next-language="${escapeHtml(next.code)}" aria-label="${escapeHtml(`${label}: ${current.nativeName}`)}" title="${escapeHtml(title)}" class="active">${escapeHtml(current.flag ?? current.label)}</button>`;
  }

  renderLanguageButtons() {
    if (this.languageButtons) this.languageButtons.innerHTML = this.languageButtonMarkup();
    if (this.bootLanguageButtons) this.bootLanguageButtons.innerHTML = this.bootLanguageButtonMarkup();
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


  handleOperationAction(button) {
    const action = button?.dataset?.operationAction ?? '';
    if (!action) return;
    const context = {
      action,
      operationId: button.dataset.operationId ?? '',
      label: button.textContent ?? ''
    };
    const result = this.onOperationAction?.(action, context);
    if (result !== false) setVisible(this.panel, false);
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
