import test from 'node:test';
import assert from 'node:assert/strict';
import { clipSegmentToCircle, drawBuildPlacement } from '../src/rendering/build-placement-overlay.js';

function context() {
  let operations = 0;
  return {
    get operations() { return operations; },
    save() { operations += 1; }, restore() { operations += 1; }, beginPath() { operations += 1; },
    moveTo() { operations += 1; }, lineTo() { operations += 1; }, arc() { operations += 1; },
    stroke() { operations += 1; }, fill() { operations += 1; }, setLineDash() { operations += 1; },
    set strokeStyle(value) { operations += 1; }, set fillStyle(value) { operations += 1; },
    set lineWidth(value) { operations += 1; }, set shadowColor(value) { operations += 1; },
    set shadowBlur(value) { operations += 1; }
  };
}

const camera = {
  scale: 2,
  worldToScreen(point) { return { x: point.x * 2 + 100, y: point.y * 2 + 100 }; }
};

test('barrier highlighting is clipped to the build-radius portion of a road', () => {
  const clipped = clipSegmentToCircle({ x: -100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, 85);
  assert.deepEqual(clipped, { a: { x: -85, y: 0 }, b: { x: 85, y: 0 } });
  assert.equal(clipSegmentToCircle({ x: 100, y: 100 }, { x: 120, y: 100 }, { x: 0, y: 0 }, 85), null);
});

test('build placement overlay draws valid sites, build radius and candidate effect radius', () => {
  const drawing = context();
  assert.doesNotThrow(() => drawBuildPlacement(drawing, camera, {
    type: 'gun',
    anchors: [
      { id: 'base', label: '本拠地', point: { x: 0, y: 0 } },
      { id: 'player', label: '現在地', point: { x: 120, y: 0 } }
    ],
    affordable: true,
    sites: [{ type: 'gun', kind: 'tower', nodeId: 'n', point: { x: 20, y: 0 }, anchorId: 'base' }],
    candidate: { type: 'gun', kind: 'tower', nodeId: 'n', point: { x: 20, y: 0 }, anchorId: 'base' }
  }, 1000, { quality: 'balanced' }));
  assert.ok(drawing.operations > 20);
});

test('barrier overlay tolerates a minimal canvas implementation', () => {
  const drawing = context();
  assert.doesNotThrow(() => drawBuildPlacement(drawing, camera, {
    type: 'barrier',
    anchors: [{ id: 'base', label: '本拠地', point: { x: 0, y: 0 } }],
    affordable: false,
    sites: [{ type: 'barrier', kind: 'barrier', edgeId: 'e', point: { x: 0, y: 0 }, a: { x: -100, y: 0 }, b: { x: 100, y: 0 }, anchorIds: ['base'] }],
    candidate: { type: 'barrier', kind: 'barrier', edgeId: 'e', point: { x: 10, y: 0 }, anchorId: 'base' }
  }, 0, { quality: 'minimal' }));
  assert.ok(drawing.operations > 10);
});


test('renderer draws construction guidance after combat effects so candidates stay visible', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/rendering/renderer.js', import.meta.url), 'utf8');
  assert.ok(source.indexOf('this.effects.draw') < source.indexOf('drawBuildPlacement(this.context'));
});
