export class Notifications {
  constructor(element, { i18n = null } = {}) {
    this.element = element;
    this.i18n = i18n;
    this.timer = null;
    this.currentMessage = '';
    this.currentMessageLocalized = false;
  }

  localize(message) {
    return this.i18n?.status?.(message) ?? this.i18n?.copy?.(message) ?? String(message ?? '');
  }

  show(message, duration = 2600, { localized = false } = {}) {
    clearTimeout(this.timer);
    this.currentMessage = String(message ?? '');
    this.currentMessageLocalized = Boolean(localized);
    this.element.textContent = this.currentMessageLocalized ? this.currentMessage : this.localize(this.currentMessage);
    this.element.classList.add('is-visible');
    this.timer = setTimeout(() => this.element.classList.remove('is-visible'), duration);
  }

  refreshLocalization() {
    if (this.currentMessage && this.element.classList.contains('is-visible')) {
      this.element.textContent = this.currentMessageLocalized ? this.currentMessage : this.localize(this.currentMessage);
    }
  }
}
