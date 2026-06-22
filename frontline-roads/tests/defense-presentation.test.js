import test from 'node:test';
import assert from 'node:assert/strict';
import { defensePresentation } from '../src/combat/defense-presentation.js';

for (const type of ['barrier', 'gun', 'mortar', 'slow', 'relay']) {
  test(`${type} has player-facing role, effect, placement and numeric metrics`, () => {
    const presentation = defensePresentation(type);
    assert.ok(presentation.role.length > 0);
    assert.ok(presentation.summary.length > 10);
    assert.ok(presentation.effect.length > 10);
    assert.ok(presentation.placement.length > 5);
    assert.ok(presentation.metrics.length >= 2);
  });
}
