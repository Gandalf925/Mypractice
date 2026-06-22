export const APP_VERSION = '0.11.0-refactor-complete';
export const SAVE_KEY = 'frontline_roads_refactor_v2';
export const SCHEMA_VERSION = 2;

export const LifecycleState = Object.freeze({
  BOOT: 'BOOT',
  LOAD_SAVE: 'LOAD_SAVE',
  MIGRATION: 'MIGRATION',
  LOCATION_REQUIRED: 'LOCATION_REQUIRED',
  ROAD_LOADING: 'ROAD_LOADING',
  BASE_SELECTION: 'BASE_SELECTION',
  INITIALIZING: 'INITIALIZING',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  ERROR: 'ERROR',
});

export const ALLOWED_TRANSITIONS = Object.freeze({
  BOOT: ['LOAD_SAVE'],
  LOAD_SAVE: ['MIGRATION', 'LOCATION_REQUIRED', 'PLAYING', 'ERROR'],
  MIGRATION: ['LOCATION_REQUIRED', 'PLAYING', 'ERROR'],
  LOCATION_REQUIRED: ['ROAD_LOADING', 'ERROR'],
  ROAD_LOADING: ['BASE_SELECTION', 'LOCATION_REQUIRED', 'ERROR'],
  BASE_SELECTION: ['INITIALIZING', 'LOCATION_REQUIRED', 'ERROR'],
  INITIALIZING: ['PLAYING', 'ERROR'],
  PLAYING: ['PAUSED', 'ERROR'],
  PAUSED: ['PLAYING', 'ERROR'],
  ERROR: ['LOCATION_REQUIRED', 'LOAD_SAVE'],
});

export const ROAD_CONFIG = Object.freeze({
  selectionRadiusMeters: 1000,
  fetchRadiusMeters: 1150,
  overpassTimeoutMs: 24000,
  minimumRawSegments: 18,
  minimumNodes: 14,
  minimumEdges: 16,
  maxSegmentLengthMeters: 280,
  minSegmentLengthMeters: 5,
  maxDistanceFromCenterMeters: 1125,
  selectionTolerancePixels: 24
});
