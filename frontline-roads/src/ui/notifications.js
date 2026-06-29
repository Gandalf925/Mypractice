export class Notifications {
  constructor(element, { localize = null } = {}) {
    this.element = element;
    this.timer = null;
    this.localize = typeof localize === 'function' ? localize : value => String(value ?? '');
  }

  show(message, duration = 2600) {
    clearTimeout(this.timer);
    this.element.textContent = this.localize(message);
    this.element.classList.add('is-visible');
    this.timer = setTimeout(() => this.element.classList.remove('is-visible'), duration);
  }
}
