import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarPreferences } from '../src/ui/radar-preferences.js';

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
  const preferences = new RadarPreferences({ documentRef, storage: null, onChange: value => values.push(value) });
  assert.equal(documentRef.documentElement.dataset.radarQuality, 'balanced');
  documentRef.elements['#radarQualityButton'].handler();
  assert.equal(preferences.get().quality, 'minimal');
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
