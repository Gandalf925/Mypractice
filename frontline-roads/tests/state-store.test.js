import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/event-bus.js';
import { createInitialState } from '../src/core/state-schema.js';
import { StateStore } from '../src/core/state-store.js';
import { LifecycleState } from '../src/core/constants.js';

function createStore() {
  return new StateStore(createInitialState(), new EventBus());
}

test('lifecycle follows the new startup sequence', () => {
  const store = createStore();
  store.transition(LifecycleState.LOAD_SAVE);
  store.transition(LifecycleState.LOCATION_REQUIRED);
  store.transition(LifecycleState.ROAD_LOADING);
  store.transition(LifecycleState.BASE_SELECTION);
  store.transition(LifecycleState.INITIALIZING);
  store.transition(LifecycleState.PLAYING);
  assert.equal(store.read(state => state.lifecycle), LifecycleState.PLAYING);
});

test('invalid transition is rejected', () => {
  const store = createStore();
  assert.throws(() => store.transition(LifecycleState.PLAYING), /Invalid lifecycle transition/);
});

test('state snapshots cannot mutate the store', () => {
  const store = createStore();
  const snapshot = store.snapshot();
  snapshot.statistics.kills = 99;
  assert.equal(store.read(state => state.statistics.kills), 0);
});

test('failed transactions leave the committed state untouched', () => {
  const events = new EventBus();
  const store = new StateStore(createInitialState(), events);
  const before = store.snapshot();
  assert.throws(() => store.transaction(draft => {
    draft.statistics.kills = 17;
    draft.schemaVersion = -1;
  }, 'invalid:transaction'), /Invalid state|schemaVersion/i);
  assert.deepEqual(store.snapshot(), before);
});

test('mutator exceptions roll back state and buffered domain events', () => {
  const events = new EventBus();
  const store = new StateStore(createInitialState(), events);
  const messages = [];
  events.on('message', value => messages.push(value));
  assert.throws(() => store.transaction(draft => {
    draft.statistics.kills = 9;
    events.emit('message', { text: 'should not escape' });
    throw new Error('command failed');
  }), /command failed/);
  assert.equal(store.read(state => state.statistics.kills), 0);
  assert.deepEqual(messages, []);
});

test('read returns detached object values and old mutation APIs are absent', () => {
  const store = createStore();
  const performance = store.read(state => state.runtime.performance);
  performance.frames = 999;
  assert.equal(store.read(state => state.runtime.performance.frames), 0);
  assert.equal('select' in store, false);
  assert.equal('mutate' in store, false);
  assert.equal('update' in store, false);
  assert.equal('getState' in store, false);
});


test('asynchronous mutators are rejected before they can commit a draft', () => {
  const store = createStore();
  assert.throws(() => store.transaction(async draft => {
    draft.statistics.kills = 4;
  }), /must be synchronous/);
  assert.equal(store.read(state => state.statistics.kills), 0);
});

test('listener failures are isolated after a successful committed transaction', () => {
  const events = new EventBus();
  const store = new StateStore(createInitialState(), events);
  const originalError = console.error;
  const errors = [];
  console.error = (...values) => errors.push(values);
  events.on('message', () => { throw new Error('broken listener'); });
  try {
    assert.doesNotThrow(() => store.transaction(draft => {
      draft.statistics.kills = 3;
      events.emit('message', { text: 'committed' });
    }));
  } finally {
    console.error = originalError;
  }
  assert.equal(store.read(state => state.statistics.kills), 3);
  assert.equal(errors.length, 1);
});
