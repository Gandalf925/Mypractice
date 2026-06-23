import test from 'node:test';
import assert from 'node:assert/strict';
import { TabCoordinator } from '../src/persistence/tab-coordinator.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

const noTimer = () => 1;

test('only one tab owns the synchronous storage lease', () => {
  const storage = new MemoryStorage();
  let time = 1000;
  const first = new TabCoordinator({ storage, eventTarget: null, now: () => time, setIntervalImpl: noTimer, clearIntervalImpl: () => {}, id: 'first' });
  const second = new TabCoordinator({ storage, eventTarget: null, now: () => time, setIntervalImpl: noTimer, clearIntervalImpl: () => {}, id: 'second' });
  first.start();
  second.start();
  assert.equal(first.isPrimary(), true);
  assert.equal(second.isPrimary(), false);
  time += 7000;
  second.refresh();
  assert.equal(second.isPrimary(), true);
  first.refresh();
  assert.equal(first.isPrimary(), false);
});

test('broadcast fallback elects one primary tab when storage is unavailable', () => {
  const channels = [];
  class FakeChannel {
    constructor() { this.listeners = []; channels.push(this); }
    addEventListener(type, listener) { if (type === 'message') this.listeners.push(listener); }
    postMessage(data) { for (const channel of channels) if (channel !== this) for (const listener of channel.listeners) listener({ data }); }
    close() {}
  }
  const factory = () => new FakeChannel();
  const first = new TabCoordinator({ storage: null, channelFactory: factory, setIntervalImpl: null, id: 'a', now: () => 1000 });
  const second = new TabCoordinator({ storage: null, channelFactory: factory, setIntervalImpl: null, id: 'b', now: () => 1000 });
  first.start(() => {});
  second.start(() => {});
  first.refresh();
  assert.equal(first.isPrimary(), true);
  assert.equal(second.isPrimary(), false);
  first.release();
  second.release();
});
