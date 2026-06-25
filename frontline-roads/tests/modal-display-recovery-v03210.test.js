import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bindDismissibleModal, setVisible } from '../src/ui/dom.js';

const read = relative => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
}

test('modal overlay never uses backdrop blur and modal card stays composited as visible UI', async () => {
  const css = await read('src/styles/app.css');
  const overlay = cssBlock(css, '.modalOverlay');
  const card = cssBlock(css, '.modalCard');
  assert.match(overlay, /backdrop-filter:\s*none/);
  assert.match(overlay, /-webkit-backdrop-filter:\s*none/);
  assert.doesNotMatch(overlay, /blur\(/);
  assert.match(card, /opacity:\s*1/);
  assert.match(card, /visibility:\s*visible/);
  assert.match(card, /filter:\s*none/);
  assert.match(card, /backdrop-filter:\s*none/);
});

test('radar quality selectors do not style modal overlays or modal cards', async () => {
  const css = await read('src/styles/app.css');
  assert.doesNotMatch(css, /data-radar-quality[^,{]*\s+\.modalOverlay/);
  assert.doesNotMatch(css, /data-radar-quality[^,{]*\s+\.modalCard/);
  assert.doesNotMatch(css, /data-radar-quality[^,{]*\s+\.panel(?:\s|,|\{)/);
  assert.doesNotMatch(css, /,\s*@media/);
});

test('modal visibility updates accessibility state and backdrop click can always dismiss it', () => {
  const listeners = {};
  const attributes = new Map();
  const element = {
    hidden: true,
    addEventListener(type, listener) { listeners[type] = listener; },
    removeEventListener() {},
    setAttribute(name, value) { attributes.set(name, value); }
  };
  let closed = 0;
  bindDismissibleModal(element, () => { closed += 1; }, null);
  setVisible(element, true);
  assert.equal(element.hidden, false);
  assert.equal(attributes.get('aria-hidden'), 'false');
  listeners.click({ target: {} });
  assert.equal(closed, 0);
  listeners.click({ target: element });
  assert.equal(closed, 1);
  setVisible(element, false);
  assert.equal(attributes.get('aria-hidden'), 'true');
});

test('all full-screen command panels use the shared emergency dismiss behavior', async () => {
  for (const path of ['src/ui/menu-ui.js', 'src/ui/civilization-ui.js', 'src/ui/base-command-ui.js', 'src/ui/deployment-ui.js']) {
    const source = await read(path);
    assert.match(source, /bindDismissibleModal/);
  }
});
