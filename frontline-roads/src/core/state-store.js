import { ALLOWED_TRANSITIONS, LifecycleState } from './constants.js';
import { AppError, ErrorCode } from './errors.js';
import { deepClone, now } from './utilities.js';
import { validateState } from './state-schema.js';

export class StateStore {
  #state;
  #events;

  constructor(initialState, eventBus) {
    const validation = validateState(initialState);
    if (!validation.valid) {
      throw new AppError(ErrorCode.INVALID_STATE, validation.errors.join(', '), { recoverable: false });
    }
    this.#state = deepClone(initialState);
    this.#events = eventBus;
  }

  getState() {
    return deepClone(this.#state);
  }

  select(selector) {
    return selector(this.#state);
  }

  transition(nextLifecycle, metadata = null) {
    const current = this.#state.lifecycle;
    const allowed = ALLOWED_TRANSITIONS[current] ?? [];
    if (!allowed.includes(nextLifecycle)) {
      throw new AppError(
        ErrorCode.INVALID_TRANSITION,
        `Invalid lifecycle transition: ${current} -> ${nextLifecycle}`,
        { recoverable: false }
      );
    }
    this.#state.lifecycle = nextLifecycle;
    this.#state.runtime.updatedAt = now();
    this.#events.emit('lifecycle:changed', { previous: current, current: nextLifecycle, metadata });
  }

  update(mutator, reason = 'state:update') {
    const draft = deepClone(this.#state);
    mutator(draft);
    draft.runtime.updatedAt = now();
    const validation = validateState(draft);
    if (!validation.valid) {
      throw new AppError(ErrorCode.INVALID_STATE, validation.errors.join(', '), { recoverable: false });
    }
    this.#state = draft;
    this.#events.emit('state:changed', { reason, state: this.getState() });
  }

  mutate(mutator, reason = 'state:mutate', { emit = false, validate = false } = {}) {
    mutator(this.#state);
    this.#state.runtime.updatedAt = now();
    if (validate) {
      const validation = validateState(this.#state);
      if (!validation.valid) {
        throw new AppError(ErrorCode.INVALID_STATE, validation.errors.join(', '), { recoverable: false });
      }
    }
    if (emit) this.#events.emit('state:changed', { reason, state: this.getState() });
  }

  replace(state, reason = 'state:replace') {
    const validation = validateState(state);
    if (!validation.valid) {
      throw new AppError(ErrorCode.INVALID_STATE, validation.errors.join(', '), { recoverable: false });
    }
    this.#state = deepClone(state);
    this.#events.emit('state:changed', { reason, state: this.getState() });
  }

  setError(error) {
    this.update(draft => {
      draft.runtime.lastError = {
        code: error?.code ?? 'UNKNOWN',
        message: error?.message ?? String(error),
        at: now()
      };
    }, 'error:set');
    if (this.#state.lifecycle !== LifecycleState.ERROR) this.transition(LifecycleState.ERROR, error);
  }
}
