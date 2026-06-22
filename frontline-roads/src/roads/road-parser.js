import { ROAD_CONFIG } from '../core/constants.js';
import { AppError, ErrorCode } from '../core/errors.js';
import { distance, stableId } from '../core/utilities.js';
import { latLonToXY } from '../location/location-privacy.js';
import { isAllowedWay, normalizeRoadName, parseLaneCount, roadWidthMeters } from './road-filter.js';
import { segmentAngle, segmentMidpoint, pointToSegmentProjection } from './geometry.js';

function interpolateLocation(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
}

export function parseOverpassSegments(data, center) {
  if (!Array.isArray(data?.elements)) {
    throw new AppError(ErrorCode.ROAD_DATA_INVALID, '道路データの形式が不正です。');
  }

  const segments = [];
  for (const way of data.elements) {
    const tags = way.tags ?? {};
    if (!isAllowedWay(tags) || !Array.isArray(way.geometry) || way.geometry.length < 2) continue;

    const highway = tags.highway;
    const lanes = parseLaneCount(tags, highway);
    const width = roadWidthMeters(highway, lanes, tags);
    const name = normalizeRoadName(tags);
    const oneway = tags.oneway === 'yes' || tags.junction === 'roundabout';
    const layer = Number.parseInt(tags.layer ?? '0', 10) || 0;
    const bridge = Boolean(tags.bridge && tags.bridge !== 'no');
    const tunnel = Boolean(tags.tunnel && tags.tunnel !== 'no');

    for (let index = 0; index < way.geometry.length - 1; index += 1) {
      const sourceA = way.geometry[index];
      const sourceB = way.geometry[index + 1];
      const rawA = latLonToXY(sourceA.lat, sourceA.lon, center);
      const rawB = latLonToXY(sourceB.lat, sourceB.lon, center);
      const rawLength = distance(rawA, rawB);
      if (rawLength < ROAD_CONFIG.minSegmentLengthMeters) continue;
      const partCount = Math.max(1, Math.ceil(rawLength / ROAD_CONFIG.maxSegmentLengthMeters));
      for (let part = 0; part < partCount; part += 1) {
        const tA = part / partCount;
        const tB = (part + 1) / partCount;
        const locationA = interpolateLocation(sourceA, sourceB, tA);
        const locationB = interpolateLocation(sourceA, sourceB, tB);
        const a = latLonToXY(locationA.lat, locationA.lon, center);
        const b = latLonToXY(locationB.lat, locationB.lon, center);
        const length = distance(a, b);
        if (length < ROAD_CONFIG.minSegmentLengthMeters) continue;
        if (pointToSegmentProjection({ x: 0, y: 0 }, a, b).distance > ROAD_CONFIG.maxDistanceFromCenterMeters) continue;
        const sourceNodeA = part === 0 ? way.nodes?.[index] ?? null : `${way.id}:${index}:${part}`;
        const sourceNodeB = part === partCount - 1 ? way.nodes?.[index + 1] ?? null : `${way.id}:${index}:${part + 1}`;
        const segment = {
          id: stableId('segment', way.id, index, part, sourceA.lat, sourceA.lon, sourceB.lat, sourceB.lon),
          wayId: way.id,
          sourceNodeA,
          sourceNodeB,
          a,
          b,
          highway,
          lanes,
          roadWidth: width,
          name,
          oneway,
          layer,
          bridge,
          tunnel
        };
        segment.mid = segmentMidpoint(segment);
        segment.angle = segmentAngle(segment);
        segments.push(segment);
      }
    }
  }

  if (segments.length < ROAD_CONFIG.minimumRawSegments) {
    throw new AppError(ErrorCode.ROAD_NETWORK_TOO_SMALL, '周辺の利用可能な道路が少なすぎます。別の場所で再試行してください。');
  }

  return segments;
}
