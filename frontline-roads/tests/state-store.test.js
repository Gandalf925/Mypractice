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
  assert.equal(store.select(state => state.lifecycle), LifecycleState.PLAYING);
});

test('invalid transition is rejected', () => {
  const store = createStore();
  assert.throws(() => store.transition(LifecycleState.PLAYING), /Invalid lifecycle transition/);
});

test('state snapshots cannot mutate the store', () => {
  const store = createStore();
  const snapshot = store.getState();
  snapshot.statistics.kills = 99;
  assert.equal(store.select(state => state.statistics.kills), 0);
});
