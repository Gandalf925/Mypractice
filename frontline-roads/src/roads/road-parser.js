import { ROAD_CONFIG } from '../core/constants.js';
import { AppError, ErrorCode } from '../core/errors.js';
import { distance, stableId } from '../core/utilities.js';
import { latLonToXY } from '../location/coordinates.js';
import { isAllowedWay, normalizeRoadName, parseLaneCount, roadWidthMeters } from './road-filter.js';
import { segmentAngle, segmentMidpoint } from './angle-utils.js';
import { nearestPointOnRoad } from './nearest-road-point.js';

export function parseOverpassSegments(data, center) {
  if (!Array.isArray(data?.elements)) throw new AppError(ErrorCode.ROAD_DATA_INVALID, '道路データの形式が不正です。');
  const segments = [];
  for (const way of data.elements) {
    const tags = way.tags ?? {};
    if (!isAllowedWay(tags) || !Array.isArray(way.geometry) || way.geometry.length < 2) continue;
    const highway = tags.highway;
    const lanes = parseLaneCount(tags, highway);
    const width = roadWidthMeters(highway, lanes, tags);
    const name = normalizeRoadName(tags);
    const oneway = tags.oneway === 'yes' || tags.junction === 'roundabout';
    for (let index = 0; index < way.geometry.length - 1; index += 1) {
      const sourceA = way.geometry[index];
      const sourceB = way.geometry[index + 1];
      const a = latLonToXY(sourceA.lat, sourceA.lon, center);
      const b = latLonToXY(sourceB.lat, sourceB.lon, center);
      const length = distance(a, b);
      if (length < ROAD_CONFIG.minSegmentLengthMeters || length > ROAD_CONFIG.maxSegmentLengthMeters) continue;
      if (nearestPointOnRoad({ x: 0, y: 0 }, a, b).distance > ROAD_CONFIG.maxDistanceFromCenterMeters) continue;
      const segment = { id: stableId('roadpart', way.id, index, sourceA.lat, sourceA.lon, sourceB.lat, sourceB.lon), wayId: way.id, a, b, highway, lanes, roadWidth: width, name, oneway };
      segment.mid = segmentMidpoint(segment);
      segment.angle = segmentAngle(segment);
      segments.push(segment);
    }
  }
  if (segments.length < ROAD_CONFIG.minimumRawSegments) throw new AppError(ErrorCode.ROAD_NETWORK_TOO_SMALL, '周辺の利用可能な道路が少なすぎます。別の場所で再試行してください。');
  return segments;
}
