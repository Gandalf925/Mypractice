import { ROAD_CONFIG } from '../core/constants.js';

export function configuredRoadDataEndpoints(documentRef = globalThis.document) {
  const value = documentRef?.querySelector('meta[name="frontline-road-data"]')?.content ?? '';
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

export function buildRoadDataQuery(lat, lon, radiusMeters = ROAD_CONFIG.fetchRadiusMeters, documentRef = globalThis.document) {
  const template = documentRef?.querySelector('meta[name="frontline-road-query"]')?.content ?? '';
  return template.replace('{radius}', String(radiusMeters)).replace('{lat}', String(lat)).replace('{lon}', String(lon));
}
