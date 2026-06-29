export class Notifications {
  constructor(element, { i18n = null } = {}) {
    this.element = element;
    this.i18n = i18n;
    this.timer = null;
    this.currentMessage = '';
  }

  localize(message) {
    return this.i18n?.copy?.(message) ?? String(message ?? '');
  }

  show(message, duration = 2600) {
    clearTimeout(this.timer);
    this.currentMessage = String(message ?? '');
    this.element.textContent = this.localize(this.currentMessage);
    this.element.classList.add('is-visible');
    this.timer = setTimeout(() => this.element.classList.remove('is-visible'), duration);
  }

  refreshLocalization() {
    if (this.currentMessage && this.element.classList.contains('is-visible')) {
      this.element.textContent = this.localize(this.currentMessage);
    }
  }
}
