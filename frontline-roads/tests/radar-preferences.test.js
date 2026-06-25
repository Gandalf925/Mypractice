import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarPreferences, suggestedRadarQuality } from '../src/ui/radar-preferences.js';

function button() {
  return { textContent: '', attributes: {}, addEventListener(type, handler) { this.handler = handler; }, setAttribute(key, value) { this.attributes[key] = value; } };
}

function fixture() {
  const elements = { '#radarQualityButton': button(), '#radarMotionButton': button(), '#radarRoutesButton': button() };
  const documentElement = { dataset: {} };
  return { documentElement, querySelector: selector => elements[selector] ?? null, elements };
}

test('radar preferences apply defaults and cycle without game state', () => {
  const documentRef = fixture();
  const values = [];
  const environment = { navigator: { maxTouchPoints: 0, hardwareConcurrency: 8, deviceMemory: 8 }, matchMedia: () => ({ matches: false }) };
  const preferences = new RadarPreferences({ documentRef, storage: null, environment, onChange: value => values.push(value) });
  assert.equal(documentRef.documentElement.dataset.radarQuality, 'balanced');
  documentRef.elements['#radarQualityButton'].handler();
  assert.equal(preferences.get().quality, 'full');
  documentRef.elements['#radarMotionButton'].handler();
  assert.equal(typeof preferences.get().motion, 'boolean');
  assert.ok(values.length >= 3);
});


test('bootstrap imports RadarPreferences before constructing it', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/app/bootstrap.js', import.meta.url), 'utf8');
  assert.match(source, /import\s+\{\s*RadarPreferences\s*\}\s+from\s+['"]\.\.\/ui\/radar-preferences\.js['"]/);
  assert.match(source, /new RadarPreferences\(/);
});


test('touch devices default to the power-saving radar profile', () => {
  const environment = { navigator: { maxTouchPoints: 5, hardwareConcurrency: 8, deviceMemory: 8 }, matchMedia: () => ({ matches: true }) };
  assert.equal(suggestedRadarQuality(environment), 'minimal');
  const documentRef = fixture();
  const preferences = new RadarPreferences({ documentRef, storage: null, environment });
  assert.equal(preferences.get().quality, 'minimal');
  assert.equal(preferences.get().routes, 'off');
  documentRef.elements['#radarQualityButton'].handler();
  assert.equal(preferences.get().quality, 'balanced');
});
