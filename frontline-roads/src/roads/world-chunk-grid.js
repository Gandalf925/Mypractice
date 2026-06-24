import { ROAD_CONFIG } from '../core/constants.js';
import { latLonToXY, xyToLatLon } from '../location/location-privacy.js';

export const ROAD_CHUNK_VERSION = 2;

export function chunkId(x, y) {
  return `${x}:${y}`;
}

export function parseChunkId(id) {
  const [x, y] = String(id).split(':').map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw new TypeError(`Invalid road chunk id: ${id}`);
  return { x, y, id: chunkId(x, y) };
}

export function chunkForWorldPoint(point, sizeMeters = ROAD_CONFIG.chunkSizeMeters) {
  const x = Math.floor(Number(point.x) / sizeMeters);
  const y = Math.floor(Number(point.y) / sizeMeters);
  return { x, y, id: chunkId(x, y) };
}

export function chunkForLocation(location, worldCenter, sizeMeters = ROAD_CONFIG.chunkSizeMeters) {
  return chunkForWorldPoint(latLonToXY(location.lat, location.lon, worldCenter), sizeMeters);
}

export function chunkBounds(chunk, sizeMeters = ROAD_CONFIG.chunkSizeMeters) {
  return {
    minX: chunk.x * sizeMeters,
    minY: chunk.y * sizeMeters,
    maxX: (chunk.x + 1) * sizeMeters,
    maxY: (chunk.y + 1) * sizeMeters
  };
}

export function chunkCenterWorld(chunk, sizeMeters = ROAD_CONFIG.chunkSizeMeters) {
  return {
    x: (chunk.x + 0.5) * sizeMeters,
    y: (chunk.y + 0.5) * sizeMeters
  };
}

export function chunkCenterLocation(chunk, worldCenter, sizeMeters = ROAD_CONFIG.chunkSizeMeters) {
  const point = chunkCenterWorld(chunk, sizeMeters);
  return xyToLatLon(point.x, point.y, worldCenter);
}

export function chunksNearWorldPoint(point, sizeMeters = ROAD_CONFIG.chunkSizeMeters, edgeDistanceMeters = ROAD_CONFIG.chunkPrefetchDistanceMeters) {
  const current = chunkForWorldPoint(point, sizeMeters);
  const bounds = chunkBounds(current, sizeMeters);
  const xs = [current.x];
  const ys = [current.y];
  if (point.x - bounds.minX <= edgeDistanceMeters) xs.push(current.x - 1);
  if (bounds.maxX - point.x <= edgeDistanceMeters) xs.push(current.x + 1);
  if (point.y - bounds.minY <= edgeDistanceMeters) ys.push(current.y - 1);
  if (bounds.maxY - point.y <= edgeDistanceMeters) ys.push(current.y + 1);
  const result = [];
  for (const y of [...new Set(ys)]) {
    for (const x of [...new Set(xs)]) result.push({ x, y, id: chunkId(x, y) });
  }
  return result;
}

export function neighboringChunks(chunk, radius = 1) {
  const result = [];
  for (let y = chunk.y - radius; y <= chunk.y + radius; y += 1) {
    for (let x = chunk.x - radius; x <= chunk.x + radius; x += 1) result.push({ x, y, id: chunkId(x, y) });
  }
  return result;
}


export function chunksIntersectingCircle(centerPoint, radiusMeters, sizeMeters = ROAD_CONFIG.chunkSizeMeters) {
  const min = chunkForWorldPoint({ x: centerPoint.x - radiusMeters, y: centerPoint.y - radiusMeters }, sizeMeters);
  const max = chunkForWorldPoint({ x: centerPoint.x + radiusMeters, y: centerPoint.y + radiusMeters }, sizeMeters);
  const result = [];
  for (let y = min.y; y <= max.y; y += 1) {
    for (let x = min.x; x <= max.x; x += 1) {
      const chunk = { x, y, id: chunkId(x, y) };
      const bounds = chunkBounds(chunk, sizeMeters);
      const nearestX = Math.max(bounds.minX, Math.min(centerPoint.x, bounds.maxX));
      const nearestY = Math.max(bounds.minY, Math.min(centerPoint.y, bounds.maxY));
      if (Math.hypot(centerPoint.x - nearestX, centerPoint.y - nearestY) > radiusMeters) continue;
      chunk.center = chunkCenterWorld(chunk, sizeMeters);
      result.push(chunk);
    }
  }
  return result;
}


function uniqueChunkIds(values = []) {
  return [...new Set(values.map(String))];
}

function graphChunkIds(graph) {
  const ids = new Set();
  for (const node of graph?.nodes ?? []) for (const id of node.chunkIds ?? []) ids.add(String(id));
  for (const edge of graph?.edges ?? []) for (const id of edge.chunkIds ?? []) ids.add(String(id));
  return [...ids];
}

export function createRoadChunkState({ initialLoadedChunkIds = [], initialObservedChunkIds = [] } = {}) {
  const loaded = uniqueChunkIds(initialLoadedChunkIds);
  const observed = uniqueChunkIds(initialObservedChunkIds).filter(id => loaded.includes(id));
  return {
    version: ROAD_CHUNK_VERSION,
    sizeMeters: ROAD_CONFIG.chunkSizeMeters,
    loaded,
    empty: [],
    cached: [],
    integrated: [...loaded],
    playerObserved: observed,
    surveyed: [],
    failed: {},
    updatedAt: Date.now()
  };
}

function migrateLegacyRoadChunkState(world, legacy) {
  const explicitGraphIds = new Set(graphChunkIds(world?.roadGraph));
  const cached = uniqueChunkIds(Array.isArray(legacy?.cached) ? legacy.cached : []);
  const surveyed = uniqueChunkIds(Array.isArray(legacy?.surveyed) ? legacy.surveyed : []);
  const empty = uniqueChunkIds(Array.isArray(legacy?.empty) ? legacy.empty : []);
  const legacyIntegrated = new Set(uniqueChunkIds(Array.isArray(legacy?.integrated) ? legacy.integrated : []));
  const cachedAndIntegrated = cached.filter(id => legacyIntegrated.has(id));
  const confirmed = new Set([...explicitGraphIds, ...cachedAndIntegrated, ...surveyed]);
  const loaded = uniqueChunkIds(Array.isArray(legacy?.loaded) ? legacy.loaded : []).filter(id => confirmed.has(id));
  for (const id of explicitGraphIds) if (!loaded.includes(id)) loaded.push(id);
  const known = new Set([...loaded, ...empty]);
  const playerObserved = uniqueChunkIds(Array.isArray(legacy?.playerObserved) ? legacy.playerObserved : [])
    .filter(id => known.has(id));
  return {
    version: ROAD_CHUNK_VERSION,
    sizeMeters: ROAD_CONFIG.chunkSizeMeters,
    loaded,
    empty,
    cached,
    integrated: loaded.filter(id => explicitGraphIds.has(id) || legacyIntegrated.has(id)),
    playerObserved,
    surveyed: surveyed.filter(id => loaded.includes(id)),
    failed: legacy?.failed && typeof legacy.failed === 'object' ? { ...legacy.failed } : {},
    updatedAt: Number(legacy?.updatedAt) || Date.now()
  };
}

export function ensureRoadChunkState(world) {
  if (!world || typeof world !== 'object') return null;
  const current = world.roadChunks;
  if (!current || !Array.isArray(current.loaded)) {
    world.roadChunks = createRoadChunkState();
    return world.roadChunks;
  }
  if (current.version !== ROAD_CHUNK_VERSION) {
    world.roadChunks = migrateLegacyRoadChunkState(world, current);
    return world.roadChunks;
  }
  current.sizeMeters = ROAD_CONFIG.chunkSizeMeters;
  current.empty = Array.isArray(current.empty) ? current.empty : [];
  current.cached = Array.isArray(current.cached) ? current.cached : [];
  current.integrated = Array.isArray(current.integrated) ? current.integrated : [...current.loaded];
  current.failed = current.failed && typeof current.failed === 'object' ? current.failed : {};
  current.surveyed = Array.isArray(current.surveyed) ? current.surveyed : [];
  current.playerObserved = Array.isArray(current.playerObserved) ? current.playerObserved : current.loaded.filter(id => !current.surveyed.includes(id));
  current.updatedAt = Number(current.updatedAt) || Date.now();
  current.loaded = uniqueChunkIds(current.loaded);
  current.empty = uniqueChunkIds(current.empty);
  current.cached = uniqueChunkIds(current.cached);
  current.integrated = uniqueChunkIds(current.integrated).filter(id => current.loaded.includes(id));
  current.playerObserved = uniqueChunkIds(current.playerObserved).filter(id => current.loaded.includes(id) || current.empty.includes(id));
  current.surveyed = uniqueChunkIds(current.surveyed).filter(id => current.loaded.includes(id));
  return current;
}
