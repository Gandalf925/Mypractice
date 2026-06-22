export class GameLoop {
  constructor({ store, combatSystem, civilizationSystem = null, renderer, saveRepository, onUiUpdate, onError, onSaveDisabled }) {
    this.store = store;
    this.combatSystem = combatSystem;
    this.civilizationSystem = civilizationSystem;
    this.renderer = renderer;
    this.saveRepository = saveRepository;
    this.onUiUpdate = onUiUpdate;
    this.onError = onError;
    this.onSaveDisabled = onSaveDisabled;
    this.running = false;
    this.frameId = null;
    this.lastTime = 0;
    this.uiClock = 0;
    this.saveClock = 0;
    this.autoSaveDisabled = !saveRepository.isAvailable();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(time => this.frame(time));
  }

  trySave() {
    if (this.autoSaveDisabled || !this.saveRepository.isAvailable()) return false;
    try {
      const savedAt = this.saveRepository.save(this.store.getState());
      this.store.mutate(state => { state.runtime.lastSavedAt = savedAt; }, 'save:timestamp');
      return true;
    } catch (error) {
      this.autoSaveDisabled = true;
      this.onSaveDisabled?.(error);
      this.onError?.(error);
      return false;
    }
  }

  frame(time) {
    if (!this.running) return;
    const rawDelta = Math.max(0, (time - this.lastTime) / 1000);
    const deltaSeconds = Math.min(0.25, rawDelta);
    this.lastTime = time;
    this.store.mutate(state => {
      state.runtime.worldTimeMs = (state.runtime.worldTimeMs ?? Date.now()) + deltaSeconds * 1000;
      this.combatSystem.update(state, deltaSeconds);
      this.civilizationSystem?.update(state, deltaSeconds);
      state.runtime.performance.frames += 1;
      state.runtime.performance.lastFrameMs = rawDelta * 1000;
      if (rawDelta > 0.05) state.runtime.performance.slowFrames += 1;
    }, 'game:tick');
    this.renderer.render();
    this.uiClock += deltaSeconds;
    this.saveClock += deltaSeconds;
    if (this.uiClock >= 0.25) {
      this.uiClock = 0;
      this.onUiUpdate?.();
    }
    if (this.saveClock >= 5) {
      this.saveClock = 0;
      this.trySave();
    }
    this.frameId = requestAnimationFrame(next => this.frame(next));
  }

  stop({ save = true } = {}) {
    if (!this.running) return;
    this.running = false;
    if (this.frameId != null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    if (save) this.trySave();
  }
}
