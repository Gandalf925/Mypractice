import { clamp } from '../core/utilities.js';
import { MAJOR_HIGHWAYS, ROAD_PRIORITY } from './road-constants.js';
import { undirectedAngleGap } from './angle-utils.js';
import { overlapRatio, segmentSeparation } from './parallel-math.js';

export function compatibleRoadIdentity(a, b) {
  if (a.name && b.name) return a.name === b.name;
  const priorityGap = Math.abs((ROAD_PRIORITY[a.highway] ?? 0) - (ROAD_PRIORITY[b.highway] ?? 0));
  if (MAJOR_HIGHWAYS.has(a.highway) && MAJOR_HIGHWAYS.has(b.highway)) return priorityGap <= 1;
  return a.highway === b.highway;
}

export function isParallelDuplicate(a, b) {
  if (!compatibleRoadIdentity(a, b)) return false;
  if (undirectedAngleGap(a.angle, b.angle) > 14 * Math.PI / 180) return false;
  const maxSeparation = a.name && b.name ? 22 : MAJOR_HIGHWAYS.has(a.highway) ? 16 : 10;
  return segmentSeparation(a, b) <= maxSeparation && overlapRatio(a, b) >= 0.42;
}

export function mergeRoadMetadata(target, source) {
  const separated = segmentSeparation(target, source) > 3.5;
  target.roadWidth = clamp(Math.max(target.roadWidth, source.roadWidth, separated ? (target.roadWidth + source.roadWidth) * 0.82 : 0), 3.2, 28);
  target.lanes = separated ? clamp((target.lanes ?? 1) + (source.lanes ?? 1), 1, 10) : Math.max(target.lanes ?? 1, source.lanes ?? 1);
  target.oneway = Boolean(target.oneway && source.oneway);
  if ((ROAD_PRIORITY[source.highway] ?? 0) > (ROAD_PRIORITY[target.highway] ?? 0)) target.highway = source.highway;
  if (!target.name && source.name) target.name = source.name;
  target.mergedSegmentIds ??= [target.id];
  target.mergedSegmentIds.push(...(source.mergedSegmentIds ?? [source.id]));
  return target;
}

export function collapseParallelSegments(rawSegments) {
  const segments = rawSegments.map(segment => ({ ...segment, mergedSegmentIds: [segment.id] }));
  segments.sort((a, b) => (ROAD_PRIORITY[b.highway] ?? 0) - (ROAD_PRIORITY[a.highway] ?? 0) || b.roadWidth - a.roadWidth);
  const cellSize = 28;
  const buckets = new Map();
  const kept = [];
  const bucketKey = point => `${Math.floor(point.x / cellSize)},${Math.floor(point.y / cellSize)}`;
  function nearbyIndices(point) {
    const cx = Math.floor(point.x / cellSize);
    const cy = Math.floor(point.y / cellSize);
    const result = [];
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) result.push(...(buckets.get(`${cx + dx},${cy + dy}`) ?? []));
    return result;
  }
  for (const segment of segments) {
    let duplicateIndex = -1;
    for (const index of nearbyIndices(segment.mid)) if (isParallelDuplicate(kept[index], segment)) { duplicateIndex = index; break; }
    if (duplicateIndex >= 0) { mergeRoadMetadata(kept[duplicateIndex], segment); continue; }
    const key = bucketKey(segment.mid);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(kept.length);
    kept.push(segment);
  }
  return kept;
}
