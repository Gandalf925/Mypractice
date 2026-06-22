export class EventBus {
  #listeners = new Map();

  on(type, listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
    return () => this.off(type, listener);
  }

  off(type, listener) {
    const listeners = this.#listeners.get(type);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) this.#listeners.delete(type);
  }

  emit(type, payload) {
    for (const listener of this.#listeners.get(type) ?? []) listener(payload);
  }

  clear() {
    this.#listeners.clear();
  }
}
