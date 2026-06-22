import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseParallelSegments } from '../src/roads/parallel-road-collapse.js';
import { segmentAngle, segmentMidpoint } from '../src/roads/geometry.js';

function segment(id, y, name = 'main road') {
  const value = {
    id,
    a: { x: 0, y },
    b: { x: 100, y },
    highway: 'primary',
    roadWidth: 9,
    lanes: 2,
    name,
    oneway: true
  };
  value.mid = segmentMidpoint(value);
  value.angle = segmentAngle(value);
  return value;
}

test('parallel carriageways with the same identity collapse into one gameplay road', () => {
  const collapsed = collapseParallelSegments([segment('a', -5), segment('b', 5)]);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].lanes, 4);
  assert.deepEqual(new Set(collapsed[0].mergedSegmentIds), new Set(['a', 'b']));
});

test('nearby roads with different names remain separate', () => {
  const collapsed = collapseParallelSegments([segment('a', -5, 'road a'), segment('b', 5, 'road b')]);
  assert.equal(collapsed.length, 2);
});
