import { distance } from '../core/utilities.js';
import { activePlayerBases } from '../base/player-bases.js';

export const REGION_ACTIVITY = Object.freeze({
  ACTIVE: 'ACTIVE',
  PERIPHERAL: 'PERIPHERAL',
  DORMANT: 'DORMANT'
});

export const REGION_ACTIVITY_CONFIG = Object.freeze({
  activeRadiusMeters: 900,
  peripheralRadiusMeters: 2400,
  peripheralIntervalSeconds: 2,
  dormantIntervalSeconds: 8,
  maximumSimulationSubstepSeconds: 1
});

function finitePoint(point) {
  return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
}

export function regionActivityAnchors(state) {
  const anchors = activePlayerBases(state).filter(finitePoint).map(base => ({ x: base.x, y: base.y }));
  if (finitePoint(state.player?.worldPosition)) {
    const player = state.player.worldPosition;
    if (!anchors.some(anchor => distance(anchor, player) < 1)) anchors.push(player);
  }
  return anchors;
}

export function regionActivityAtPoint(state, point) {
  if (!finitePoint(point)) return REGION_ACTIVITY.ACTIVE;
  const anchors = regionActivityAnchors(state);
  if (anchors.length === 0) return REGION_ACTIVITY.ACTIVE;
  let nearest = Infinity;
  for (const anchor of anchors) nearest = Math.min(nearest, distance(anchor, point));
  if (nearest <= REGION_ACTIVITY_CONFIG.activeRadiusMeters) return REGION_ACTIVITY.ACTIVE;
  if (nearest <= REGION_ACTIVITY_CONFIG.peripheralRadiusMeters) return REGION_ACTIVITY.PERIPHERAL;
  return REGION_ACTIVITY.DORMANT;
}

export function ensureRegionalSimulationState(state) {
  state.runtime.regionalSimulation ??= {};
  const value = state.runtime.regionalSimulation;
  value.peripheralAccumulator = Math.max(0, Number(value.peripheralAccumulator) || 0);
  value.dormantAccumulator = Math.max(0, Number(value.dormantAccumulator) || 0);
  return value;
}

function consumeInterval(value, interval) {
  const count = Math.floor((value + 1e-9) / interval);
  return {
    elapsed: count * interval,
    remainder: Math.max(0, value - count * interval)
  };
}

export function consumeRegionalSimulationTime(state, deltaSeconds) {
  const elapsed = Math.max(0, Number(deltaSeconds) || 0);
  const runtime = ensureRegionalSimulationState(state);
  runtime.peripheralAccumulator += elapsed;
  runtime.dormantAccumulator += elapsed;

  const peripheral = consumeInterval(runtime.peripheralAccumulator, REGION_ACTIVITY_CONFIG.peripheralIntervalSeconds);
  const dormant = consumeInterval(runtime.dormantAccumulator, REGION_ACTIVITY_CONFIG.dormantIntervalSeconds);
  runtime.peripheralAccumulator = peripheral.remainder;
  runtime.dormantAccumulator = dormant.remainder;

  return {
    active: elapsed,
    peripheral: peripheral.elapsed,
    dormant: dormant.elapsed
  };
}
